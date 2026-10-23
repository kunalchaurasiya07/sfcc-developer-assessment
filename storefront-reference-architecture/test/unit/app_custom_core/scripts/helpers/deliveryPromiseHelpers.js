'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var preferences;
var siteError;
var preferenceError;
var localeResult;
var localeArgument;
var product;
var productLookup;
var availabilityCalls;
var cacheError;
var cacheBehavior;
var cachedTier;
var serviceResult;
var serviceError;
var serviceCalls;
var tierMapping;
var lookupCalls;
var customObjectError;
var content;
var contentLookup;
var contentError;
var urlArguments;
var logMessages;
var renderedArguments;

var deliveryPromiseHelpers = proxyquire('../../../../../cartridges/app_custom_core/cartridge/scripts/helpers/deliveryPromiseHelpers', {
    'dw/system/Site': {
        getCurrent: function () {
            if (siteError) {
                throw siteError;
            }
            return {
                getCustomPreferenceValue: function (id) {
                    if (preferenceError) {
                        throw preferenceError;
                    }
                    return preferences[id];
                }
            };
        }
    },
    'dw/system/Logger': {
        getLogger: function () {
            return {
                warn: function () {
                    logMessages.push('warn');
                },
                error: function () {
                    logMessages.push('error');
                }
            };
        }
    },
    'dw/catalog/ProductMgr': {
        getProduct: function (id) {
            productLookup = id;
            return product;
        }
    },
    'dw/content/ContentMgr': {
        getContent: function (id) {
            contentLookup = id;
            if (contentError) {
                throw contentError;
            }
            return content;
        }
    },
    'dw/object/CustomObjectMgr': {
        getCustomObject: function (type, key) {
            lookupCalls.push({ type: type, key: key });
            if (customObjectError) {
                throw customObjectError;
            }
            return tierMapping;
        }
    },
    'dw/system/CacheMgr': {
        getCache: function () {
            if (cacheError) {
                throw cacheError;
            }
            return {
                get: function (key, callback) {
                    if (cacheBehavior === 'throw') {
                        throw new Error('cache read failed');
                    }
                    if (cacheBehavior === 'cached') {
                        return cachedTier;
                    }
                    return callback();
                }
            };
        }
    },
    'dw/web/URLUtils': {
        url: function () {
            urlArguments = Array.prototype.slice.call(arguments);
            return {
                toString: function () {
                    return '/delivery-promise';
                }
            };
        }
    },
    'dw/util/Locale': {
        getLocale: function (locale) {
            localeArgument = locale;
            return localeResult;
        }
    },
    '*/cartridge/scripts/services/fulfilmentService': {
        getService: function () {
            return {
                call: function (params) {
                    serviceCalls.push(params);
                    if (serviceError) {
                        throw serviceError;
                    }
                    return serviceResult;
                }
            };
        }
    },
    '*/cartridge/scripts/renderTemplateHelper': {
        getRenderedHtml: function (model, template) {
            renderedArguments = { model: model, template: template };
            return '<div>delivery promise</div>';
        }
    }
});

describe('deliveryPromiseHelpers', function () {
    beforeEach(function () {
        preferences = {
            deliveryPromiseEnabled: false,
            deliveryPromiseClientTimeout: '5000',
            deliveryPromiseDefaultCountry: ''
        };
        siteError = null;
        preferenceError = null;
        localeResult = { country: 'us' };
        localeArgument = null;
        global.request = { locale: 'en_US' };
        product = {
            ID: 'SKU-1',
            online: true,
            getAvailabilityModel: function () {
                return {
                    isInStock: function (quantity) {
                        availabilityCalls.push(quantity);
                        return true;
                    }
                };
            }
        };
        productLookup = null;
        availabilityCalls = [];
        cacheError = null;
        cacheBehavior = 'load';
        cachedTier = null;
        serviceResult = { ok: true, object: { tier: 'NEXT_DAY' } };
        serviceError = null;
        serviceCalls = [];
        tierMapping = null;
        lookupCalls = [];
        customObjectError = null;
        content = null;
        contentLookup = null;
        contentError = null;
        urlArguments = null;
        logMessages = [];
        renderedArguments = null;
    });

    describe('site preferences and country resolution', function () {
        it('enables the feature only for a boolean true preference', function () {
            assert.isFalse(deliveryPromiseHelpers.isEnabled());
            preferences.deliveryPromiseEnabled = 'true';
            assert.isFalse(deliveryPromiseHelpers.isEnabled());
            preferences.deliveryPromiseEnabled = true;
            assert.isTrue(deliveryPromiseHelpers.isEnabled());
        });

        it('treats preference lookup errors as disabled', function () {
            siteError = new Error('site unavailable');
            assert.isFalse(deliveryPromiseHelpers.isEnabled());
            siteError = null;
            preferenceError = new Error('preference unavailable');
            assert.isFalse(deliveryPromiseHelpers.isEnabled());
        });

        it('uses the default timeout for an unparseable preference and clamps bounds', function () {
            preferences.deliveryPromiseClientTimeout = 'invalid';
            assert.strictEqual(deliveryPromiseHelpers.getDeliveryPromiseConfig(null).timeout, undefined);
            preferences.deliveryPromiseEnabled = true;
            assert.strictEqual(deliveryPromiseHelpers.getDeliveryPromiseConfig(null).timeout, 5000);
            preferences.deliveryPromiseClientTimeout = '500';
            assert.strictEqual(deliveryPromiseHelpers.getDeliveryPromiseConfig(null).timeout, 1000);
            preferences.deliveryPromiseClientTimeout = '20000';
            assert.strictEqual(deliveryPromiseHelpers.getDeliveryPromiseConfig(null).timeout, 15000);
            preferences.deliveryPromiseClientTimeout = '7500ms';
            assert.strictEqual(deliveryPromiseHelpers.getDeliveryPromiseConfig(null).timeout, 7500);
        });

        it('uses the request locale country when it is valid', function () {
            assert.strictEqual(deliveryPromiseHelpers.getCountryCode(), 'US');
            assert.strictEqual(localeArgument, 'en_US');
        });

        it('uses a valid configured fallback country, otherwise US', function () {
            localeResult = { country: 'United States' };
            preferences.deliveryPromiseDefaultCountry = 'ca';
            assert.strictEqual(deliveryPromiseHelpers.getCountryCode(), 'CA');
            localeResult = { country: '' };
            assert.strictEqual(deliveryPromiseHelpers.getCountryCode(), 'CA');
            preferences.deliveryPromiseDefaultCountry = 'C1';
            assert.strictEqual(deliveryPromiseHelpers.getCountryCode(), 'US');
            localeResult = null;
            assert.strictEqual(deliveryPromiseHelpers.getCountryCode(), 'US');
            preferences.deliveryPromiseDefaultCountry = '';
            localeResult = { country: 'invalid' };
            assert.strictEqual(deliveryPromiseHelpers.getCountryCode(), 'US');
        });
    });

    describe('stock and product configuration', function () {
        it('rejects missing, offline, and non-sellable product types', function () {
            assert.isFalse(deliveryPromiseHelpers.isInStock(null, 1));
            ['online', 'master', 'variationGroup', 'productSet', 'bundle'].forEach(function (flag) {
                var testProduct = Object.assign({}, product);
                testProduct[flag] = flag !== 'online';
                assert.isFalse(deliveryPromiseHelpers.isInStock(testProduct, 1), flag);
            });
        });

        it('checks stock with the requested positive quantity, or one by default', function () {
            assert.isTrue(deliveryPromiseHelpers.isInStock(product, 3));
            assert.isTrue(deliveryPromiseHelpers.isInStock(product, 0));
            assert.deepEqual(availabilityCalls, [3, 1]);
            product.getAvailabilityModel = function () { return null; };
            assert.isFalse(deliveryPromiseHelpers.isInStock(product, 1));
        });

        it('returns a disabled configuration without looking up a product', function () {
            assert.deepEqual(deliveryPromiseHelpers.getDeliveryPromiseConfig({
                id: 'SKU-1',
                readyToOrder: true,
                available: true
            }), { enabled: false, eligible: false, url: '' });
            assert.isNull(productLookup);
        });

        it('returns enabled but ineligible configurations without a URL', function () {
            preferences.deliveryPromiseEnabled = true;
            var notReady = deliveryPromiseHelpers.getDeliveryPromiseConfig({
                id: 'SKU-1',
                readyToOrder: false,
                available: true
            });
            assert.deepEqual(notReady, {
                enabled: true,
                eligible: false,
                url: '',
                timeout: 5000
            });
            assert.isNull(productLookup);
            product = null;
            var unavailable = deliveryPromiseHelpers.getDeliveryPromiseConfig({
                id: 'SKU-2',
                readyToOrder: true,
                available: true
            });
            assert.isFalse(unavailable.eligible);
        });

        it('creates a delivery URL for an eligible product', function () {
            preferences.deliveryPromiseEnabled = true;
            var result = deliveryPromiseHelpers.getDeliveryPromiseConfig({
                id: 'SKU-1',
                readyToOrder: true,
                available: true,
                selectedQuantity: 4
            });
            assert.isTrue(result.eligible);
            assert.strictEqual(result.url, '/delivery-promise');
            assert.deepEqual(urlArguments, ['DeliveryPromise-Show', 'pid', 'SKU-1', 'country', 'US']);
            assert.deepEqual(availabilityCalls, [4]);
        });
    });

    describe('tier lookup and mapping', function () {
        it('returns normalized fulfilment tiers and caches them by a sanitized key', function () {
            assert.strictEqual(deliveryPromiseHelpers.getTier('SKU/1', 'US'), 'NEXT_DAY');
            assert.deepEqual(serviceCalls, [{ sku: 'SKU/1', country: 'US' }]);
        });

        it('returns a cached tier without calling the service', function () {
            cacheBehavior = 'cached';
            cachedTier = 'SAME_DAY';
            assert.strictEqual(deliveryPromiseHelpers.getTier('SKU-1', 'US'), 'SAME_DAY');
            assert.deepEqual(serviceCalls, []);
        });

        it('returns null and logs when the response has a bad tier or no successful tier', function () {
            serviceResult.object.tier = 'bad tier';
            assert.isNull(deliveryPromiseHelpers.getTier('SKU-1', 'US'));
            serviceResult = { ok: false, status: 'ERROR', error: 'failed', errorMessage: 'offline' };
            assert.isNull(deliveryPromiseHelpers.getTier('SKU-1', 'US'));
            serviceResult = { ok: true, object: null };
            assert.isNull(deliveryPromiseHelpers.getTier('SKU-1', 'US'));
            assert.include(logMessages, 'warn');
        });

        it('logs service exceptions and retries directly when the cache fails', function () {
            serviceError = new Error('service failed');
            assert.isNull(deliveryPromiseHelpers.getTier('SKU-1', 'US'));
            assert.include(logMessages, 'error');
            serviceError = null;
            cacheError = new Error('cache unavailable');
            assert.strictEqual(deliveryPromiseHelpers.getTier('SKU-1', 'US'), 'NEXT_DAY');
            assert.strictEqual(serviceCalls.length, 2);
            cacheError = null;
            cacheBehavior = 'throw';
            assert.strictEqual(deliveryPromiseHelpers.getTier('SKU-1', 'US'), 'NEXT_DAY');
            assert.strictEqual(serviceCalls.length, 3);
        });

        it('resolves valid mappings and rejects missing, malformed, disabled, or invalid mappings', function () {
            assert.isNull(deliveryPromiseHelpers.getTierConfig(''));
            assert.isNull(deliveryPromiseHelpers.getTierConfig('BAD<script>'));
            assert.isNull(deliveryPromiseHelpers.getTierConfig('VALID'));
            tierMapping = {};
            assert.isNull(deliveryPromiseHelpers.getTierConfig('VALID'));
            tierMapping = { custom: { enabled: false, contentAssetId: 'asset' } };
            assert.isNull(deliveryPromiseHelpers.getTierConfig('VALID'));
            tierMapping = { custom: { enabled: true, contentAssetId: { value: ' asset-id ' } } };
            assert.deepEqual(deliveryPromiseHelpers.getTierConfig('VALID'), { assetId: 'asset-id' });
            tierMapping.custom.contentAssetId = '';
            assert.isNull(deliveryPromiseHelpers.getTierConfig('VALID'));
            tierMapping.custom.contentAssetId = new Array(102).join('x');
            assert.isNull(deliveryPromiseHelpers.getTierConfig('VALID'));
            customObjectError = new Error('lookup failed');
            assert.isNull(deliveryPromiseHelpers.getTierConfig('VALID'));
            assert.include(logMessages, 'error');
        });
    });

    describe('content models', function () {
        it('returns null when the asset is missing or offline', function () {
            assert.isNull(deliveryPromiseHelpers.getContentModel({ assetId: 'missing' }, 'NEXT_DAY'));
            content = { online: false, custom: {} };
            assert.isNull(deliveryPromiseHelpers.getContentModel({ assetId: 'offline' }, 'NEXT_DAY'));
            assert.strictEqual(contentLookup, 'offline');
        });

        it('normalizes content attributes, allowed icons, colours, and image data', function () {
            content = {
                online: true,
                name: 'Asset heading',
                custom: {
                    dpEyebrow: { value: 'Today' },
                    dpHeading: '',
                    dpMessage: null,
                    dpBadgeText: { value: '' },
                    dpIcon: { value: 'truck' },
                    dpBadgeIcon: 'not-allowed',
                    dpImage: { getURL: function () { return { toString: function () { return '/image.png'; } }; } },
                    dpImageAlt: 'Delivery van',
                    dpAccentColor: ' #abc '
                }
            };
            assert.deepEqual(deliveryPromiseHelpers.getContentModel({ assetId: 'asset' }, null), {
                tier: 'FALLBACK',
                eyebrow: 'Today',
                heading: 'Asset heading',
                message: '',
                badgeText: '',
                icon: 'truck',
                badgeIcon: '',
                imageUrl: '/image.png',
                imageAlt: 'Delivery van',
                accentColor: '#abc'
            });
        });

        it('supports custom headings and rejects invalid icons and colours', function () {
            content = {
                online: true,
                name: 'Asset heading',
                custom: {
                    dpHeading: { value: 'Custom heading' },
                    dpIcon: 'unknown',
                    dpBadgeIcon: 'gift',
                    dpImage: null,
                    dpAccentColor: '#12xz'
                }
            };
            var model = deliveryPromiseHelpers.getContentModel({ assetId: 'asset' }, 'STANDARD');
            assert.strictEqual(model.tier, 'STANDARD');
            assert.strictEqual(model.heading, 'Custom heading');
            assert.strictEqual(model.icon, '');
            assert.strictEqual(model.badgeIcon, 'gift');
            assert.strictEqual(model.imageUrl, '');
            assert.strictEqual(model.accentColor, '');
        });
    });

    describe('delivery promise resolution', function () {
        it('returns the non-cacheable empty result when disabled or given invalid input', function () {
            assert.deepEqual(deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', 'US'), {
                tier: null,
                html: '',
                cacheable: false
            });
            preferences.deliveryPromiseEnabled = true;
            assert.deepEqual(deliveryPromiseHelpers.resolveDeliveryPromise('', 'US'), {
                tier: null,
                html: '',
                cacheable: false
            });
            assert.deepEqual(deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', 'USA'), {
                tier: null,
                html: '',
                cacheable: false
            });
            assert.deepEqual(deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', null), {
                tier: null,
                html: '',
                cacheable: false
            });
        });

        it('returns empty content for products that are not in stock', function () {
            preferences.deliveryPromiseEnabled = true;
            product.online = false;
            assert.deepEqual(deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', 'us'), {
                tier: null,
                html: '',
                cacheable: false
            });
        });

        it('renders fallback content when the tier is missing or unmapped', function () {
            preferences.deliveryPromiseEnabled = true;
            serviceResult = { ok: false, status: 'ERROR' };
            content = { online: true, custom: { dpHeading: 'Fallback' } };
            var result = deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', 'us');
            assert.strictEqual(result.tier, null);
            assert.strictEqual(result.html, '<div>delivery promise</div>');
            assert.isFalse(result.cacheable);
            assert.strictEqual(renderedArguments.template, 'deliveryPromise/deliveryPromiseBlock');
            assert.strictEqual(renderedArguments.model.deliveryPromise.heading, 'Fallback');
        });

        it('renders mapped content as cacheable when a tier is available', function () {
            preferences.deliveryPromiseEnabled = true;
            tierMapping = { custom: { contentAssetId: 'tier-asset' } };
            content = { online: true, custom: { dpHeading: 'Next day' } };
            var result = deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', 'US');
            assert.strictEqual(result.tier, 'NEXT_DAY');
            assert.strictEqual(result.html, '<div>delivery promise</div>');
            assert.isTrue(result.cacheable);
            assert.strictEqual(contentLookup, 'tier-asset');
        });

        it('returns non-cacheable empty markup when selected content is unavailable', function () {
            preferences.deliveryPromiseEnabled = true;
            tierMapping = { custom: { contentAssetId: 'tier-asset' } };
            content = { online: false, custom: {} };
            var result = deliveryPromiseHelpers.resolveDeliveryPromise('SKU-1', 'US');
            assert.deepEqual(result, { tier: 'NEXT_DAY', html: '', cacheable: false });
        });
    });
});
