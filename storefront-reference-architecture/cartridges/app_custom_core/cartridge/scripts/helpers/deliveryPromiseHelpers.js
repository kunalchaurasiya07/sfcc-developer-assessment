'use strict';

var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');
var ProductMgr = require('dw/catalog/ProductMgr');
var ContentMgr = require('dw/content/ContentMgr');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var CacheMgr = require('dw/system/CacheMgr');
var URLUtils = require('dw/web/URLUtils');
var Locale = require('dw/util/Locale');

var log = Logger.getLogger('deliveryPromise', 'DeliveryPromise');

var CACHE_ID = 'deliveryPromiseTier';
var TIER_MAPPING_TYPE = 'DeliveryPromiseTier';
var COUNTRY_PATTERN = /^[A-Z]{2}$/;
var TIER_PATTERN = /^[A-Z0-9][A-Z0-9_]{0,39}$/;
var COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
var DEFAULT_COUNTRY = 'US';
var DEFAULT_CLIENT_TIMEOUT = 5000;
var MIN_CLIENT_TIMEOUT = 1000;
var MAX_CLIENT_TIMEOUT = 15000;

/** Fallback content remains a dedicated asset; all fulfilment tiers are BM-managed. */
var FALLBACK = { assetId: 'delivery-promise-fallback' };

/** Font Awesome 4.7 icons merchants can pick in BM (enum values) */
var ALLOWED_ICONS = [
    'bolt', 'truck', 'cube', 'clock-o', 'calendar', 'calendar-check-o',
    'shield', 'rocket', 'map-marker', 'check-circle', 'info-circle', 'gift'
];

/**
 * Reads a site preference safely
 * @param {string} id - preference id
 * @returns {*} preference value or null
 */
function getPreference(id) {
    try {
        return Site.getCurrent().getCustomPreferenceValue(id);
    } catch (e) {
        return null;
    }
}

/**
 * Feature flag
 * @returns {boolean} true when the delivery promise feature is enabled for the current site
 */
function isEnabled() {
    return getPreference('deliveryPromiseEnabled') === true;
}

/**
 * Client-side request timeout (ms) for the delivery promise endpoint
 * @returns {number} timeout in ms
 */
function getClientTimeout() {
    var value = Number.parseInt(getPreference('deliveryPromiseClientTimeout'), 10);
    if (Number.isNaN(value)) {
        return DEFAULT_CLIENT_TIMEOUT;
    }
    return Math.min(Math.max(value, MIN_CLIENT_TIMEOUT), MAX_CLIENT_TIMEOUT);
}

/**
 * Resolves the shopper country from the request locale (cache safe because the
 * locale is part of the URL), falling back to the configured default country.
 * @returns {string} ISO 3166-1 alpha-2 country code
 */
function getCountryCode() {
    var locale = Locale.getLocale(request.locale); // eslint-disable-line no-undef
    var country = locale && locale.country ? String(locale.country).toUpperCase() : '';

    if (!COUNTRY_PATTERN.test(country)) {
        var preferred = String(getPreference('deliveryPromiseDefaultCountry') || '').toUpperCase();
        country = COUNTRY_PATTERN.test(preferred) ? preferred : DEFAULT_COUNTRY;
    }
    return country;
}

/**
 * Checks if a product is a sellable (non-master) product that is in stock
 * @param {dw.catalog.Product} apiProduct - product
 * @param {number} quantity - requested quantity
 * @returns {boolean} true when in stock
 */
function isInStock(apiProduct, quantity) {
    if (!apiProduct || !apiProduct.online || apiProduct.master || apiProduct.variationGroup
        || apiProduct.productSet || apiProduct.bundle) {
        return false;
    }
    var availabilityModel = apiProduct.getAvailabilityModel();
    return !!availabilityModel && availabilityModel.isInStock(quantity > 0 ? quantity : 1);
}

/**
 * Builds the configuration rendered on the PDP / returned with Product-Variation
 * @param {Object} productModel - SFRA full product model
 * @returns {Object} delivery promise config
 */
function getDeliveryPromiseConfig(productModel) {
    if (!isEnabled()) {
        return { enabled: false, eligible: false, url: '' };
    }

    var eligible = false;
    if (productModel && productModel.readyToOrder && productModel.available) {
        eligible = isInStock(ProductMgr.getProduct(productModel.id), productModel.selectedQuantity || 1);
    }

    return {
        enabled: true,
        eligible: eligible,
        url: eligible
            ? URLUtils.url('DeliveryPromise-Show', 'pid', productModel.id, 'country', getCountryCode()).toString()
            : '',
        timeout: getClientTimeout()
    };
}

/**
 * Calls the fulfilment service (no caching)
 * @param {string} sku - product id
 * @param {string} country - country code
 * @returns {string|null} normalised tier or null on any failure
 */
function fetchTier(sku, country) {
    try {
        var fulfilmentService = require('*/cartridge/scripts/services/fulfilmentService');
        var result = fulfilmentService.getService().call({ sku: sku, country: country });

        if (result.ok && result.object && result.object.tier) {
            var tier = String(result.object.tier).trim().toUpperCase();
            if (TIER_PATTERN.test(tier)) {
                return tier;
            }
            log.warn('Unknown delivery tier "{0}" for sku={1} country={2}', tier, sku, country);
            return null;
        }

        log.warn('Fulfilment lookup failed for sku={0} country={1}: status={2} error={3} message={4}',
            sku, country, result.status, result.error, result.errorMessage);
    } catch (e) {
        log.error('Fulfilment lookup error for sku={0} country={1}: {2}', sku, country, e.message);
    }
    return null;
}

/**
 * Returns the delivery tier, served from the custom cache when possible.
 * Failures are not cached so the service is retried on the next request
 * (the service circuit breaker protects it from being hammered).
 * @param {string} sku - product id
 * @param {string} country - country code
 * @returns {string|null} tier
 */
function getTier(sku, country) {
    var key = (sku + '_' + country).replace(/[^\w-]/g, '_');
    try {
        var tier = CacheMgr.getCache(CACHE_ID).get(key, function () {
            // returning undefined prevents the value from being stored
            return fetchTier(sku, country) || undefined;
        });
        return tier || null;
    } catch (e) {
        log.error('Delivery promise cache error: {0}', e.message);
        return fetchTier(sku, country);
    }
}

/**
 * Normalises an enum / string attribute value
 * @param {*} value - attribute value
 * @returns {string} value as string
 */
function toStringValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object' && 'value' in value) {
        return value.value ? String(value.value) : '';
    }
    return String(value);
}

/**
 * Resolves a fulfilment tier to its BM-managed content asset configuration.
 * @param {string} tier - normalised fulfilment tier
 * @returns {Object|null} tier mapping or null when it is missing/disabled
 */
function getTierConfig(tier) {
    if (!tier || !TIER_PATTERN.test(tier)) {
        return null;
    }

    try {
        var mapping = CustomObjectMgr.getCustomObject(TIER_MAPPING_TYPE, tier);
        if (!mapping || !mapping.custom || mapping.custom.enabled === false) {
            return null;
        }

        var assetId = toStringValue(mapping.custom.contentAssetId).trim();
        if (!assetId || assetId.length > 100) {
            log.warn('Delivery promise tier mapping has an invalid content asset ID: tier={0}', tier);
            return null;
        }

        return { assetId: assetId };
    } catch (e) {
        log.error('Delivery promise tier mapping lookup failed for tier={0}: {1}', tier, String(e));
        return null;
    }
}

/**
 * Returns a whitelisted icon name
 * @param {*} value - attribute value
 * @returns {string} icon name or empty string
 */
function sanitizeIcon(value) {
    var icon = toStringValue(value);
    return ALLOWED_ICONS.includes(icon) ? icon : '';
}

/**
 * Returns a valid hex colour
 * @param {*} value - attribute value
 * @returns {string} colour or empty string
 */
function sanitizeColor(value) {
    var color = toStringValue(value).trim();
    return COLOR_PATTERN.test(color) ? color : '';
}

/**
 * Builds the view model of a delivery promise content asset
 * @param {Object} tierConfig - BM-managed mapping or fallback configuration
 * @param {string|null} tier - tier code
 * @returns {Object|null} content view model or null when the asset is missing / offline
 */
function getContentModel(tierConfig, tier) {
    var asset = ContentMgr.getContent(tierConfig.assetId);
    if (!asset || !asset.online) {
        return null;
    }

    var custom = asset.custom;
    var image = custom.dpImage;

    return {
        tier: tier || 'FALLBACK',
        eyebrow: toStringValue(custom.dpEyebrow),
        heading: toStringValue(custom.dpHeading) || toStringValue(asset.name),
        message: toStringValue(custom.dpMessage),
        badgeText: toStringValue(custom.dpBadgeText),
        icon: sanitizeIcon(custom.dpIcon),
        badgeIcon: sanitizeIcon(custom.dpBadgeIcon),
        imageUrl: image ? image.getURL().toString() : '',
        imageAlt: toStringValue(custom.dpImageAlt),
        accentColor: sanitizeColor(custom.dpAccentColor)
    };
}

/**
 * Resolves tier + rendered content for a product/country
 * @param {string} pid - product id
 * @param {string} country - country code
 * @returns {{tier: (string|null), html: string, cacheable: boolean}} result
 */
function resolveDeliveryPromise(pid, country) {
    var empty = { tier: null, html: '', cacheable: false };
    var countryCode = String(country || '').toUpperCase();

    if (!isEnabled() || !pid || !COUNTRY_PATTERN.test(countryCode)) {
        return empty;
    }

    var apiProduct = ProductMgr.getProduct(pid);
    if (!isInStock(apiProduct, 1)) {
        return empty;
    }

    var tier = getTier(apiProduct.ID, countryCode);
    var tierConfig = tier ? getTierConfig(tier) : null;
    var content = tierConfig
        ? getContentModel(tierConfig, tier)
        : getContentModel(FALLBACK, null);

    if (!content) {
        return { tier: tier, html: '', cacheable: false };
    }

    var renderTemplateHelper = require('*/cartridge/scripts/renderTemplateHelper');
    return {
        tier: tier,
        html: renderTemplateHelper.getRenderedHtml({ deliveryPromise: content }, 'deliveryPromise/deliveryPromiseBlock'),
        cacheable: !!(tierConfig && tier)
    };
}

module.exports = {
    isEnabled: isEnabled,
    getCountryCode: getCountryCode,
    isInStock: isInStock,
    getDeliveryPromiseConfig: getDeliveryPromiseConfig,
    getTier: getTier,
    getTierConfig: getTierConfig,
    getContentModel: getContentModel,
    resolveDeliveryPromise: resolveDeliveryPromise
};
