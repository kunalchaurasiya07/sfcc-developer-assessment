'use strict';

var SELECTOR = '.js-delivery-promise';
var CONTENT_SELECTOR = '.js-delivery-promise-content';
var SKELETON_SELECTOR = '.js-delivery-promise-skeleton';
var DEFAULT_TIMEOUT = 5000;

/**
 * Resolved responses keyed by URL (url already contains pid + country).
 * Only successful tier lookups are kept so a failed call can be retried later.
 */
var htmlCache = {};

/** In-flight requests keyed by URL, so rapid re-selection never duplicates calls */
var pendingRequests = {};
var ACCENT_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Updates container state attributes
 * @param {jQuery} $container - delivery promise container
 * @param {string} state - loading | loaded | hidden
 */
function setState($container, state) {
    $container
        .attr('data-state', state)
        .attr('aria-busy', state === 'loading' ? 'true' : 'false')
        .prop('hidden', state === 'hidden');
}

/**
 * Hides the block (ineligible product, no content or failure)
 * @param {jQuery} $container - delivery promise container
 */
function hide($container) {
    $container.find(CONTENT_SELECTOR).empty();
    setState($container, 'hidden');
}

/**
 * Shows the loading skeleton (same footprint as the final block -> no layout shift)
 * @param {jQuery} $container - delivery promise container
 */
function showLoading($container) {
    var template = $container.find(SKELETON_SELECTOR).get(0);
    var skeletonHtml = template ? template.innerHTML : '';
    $container.find(CONTENT_SELECTOR).html(skeletonHtml);
    setState($container, 'loading');
}

/**
 * Renders the server-rendered, BM-managed content block
 * @param {jQuery} $container - delivery promise container
 * @param {string} html - block html
 */
function show($container, html) {
    if (!html) {
        hide($container);
        return;
    }
    $container.find(CONTENT_SELECTOR).html(html);
    $container.find('[data-accent]').each(function () {
        var accent = this.getAttribute('data-accent');
        if (ACCENT_PATTERN.test(accent)) {
            this.style.setProperty('--dp-accent', accent);
        }
    });
    setState($container, 'loaded');
}

/**
 * Fetches the block for a URL (deduplicated + cached)
 * @param {string} url - DeliveryPromise-Show url
 * @param {number} timeout - request timeout in ms
 * @returns {jQuery.Promise} promise resolved with the html
 */
function fetchBlock(url, timeout) {
    if (!pendingRequests[url]) {
        pendingRequests[url] = $.ajax({
            url: url,
            method: 'GET',
            dataType: 'json',
            timeout: timeout
        }).then(function (data) {
            var html = data && data.html ? data.html : '';
            if (data && data.tier) {
                htmlCache[url] = html;
            }
            delete pendingRequests[url];
            return html;
        }, function () {
            delete pendingRequests[url];
            return $.Deferred().reject().promise();
        });
    }
    return pendingRequests[url];
}

/**
 * Loads the block for the URL currently set on the container
 * @param {jQuery} $container - delivery promise container
 */
function load($container) {
    var url = $container.attr('data-url');

    if (!url) {
        hide($container);
        return;
    }

    if (Object.prototype.hasOwnProperty.call(htmlCache, url)) {
        show($container, htmlCache[url]);
        return;
    }

    showLoading($container);

    var timeout = parseInt($container.attr('data-timeout'), 10) || DEFAULT_TIMEOUT;

    fetchBlock(url, timeout).then(function (html) {
        // ignore stale responses if the shopper selected another variant meanwhile
        if ($container.attr('data-url') === url) {
            show($container, html);
        }
    }, function () {
        if ($container.attr('data-url') === url) {
            hide($container);
        }
    });
}

/**
 * Handles variant / quantity changes on the PDP
 * @param {jQuery.Event} e - event
 * @param {Object} response - { data: Product-Variation json, container: $productContainer }
 */
function onAfterAttributeSelect(e, response) {
    if (!response || !response.container) {
        return;
    }

    var $container = $(response.container).find(SELECTOR);
    if (!$container.length) {
        return;
    }

    var config = response.data && response.data.deliveryPromise;
    var url = config && config.enabled && config.eligible && config.url ? config.url : '';

    $container.attr('data-url', url);
    if (config && config.timeout) {
        $container.attr('data-timeout', config.timeout);
    }

    load($container);
}

module.exports = {
    init: function () {
        $(SELECTOR).each(function () {
            load($(this));
        });

        $('body').on('product:afterAttributeSelect', onAfterAttributeSelect);
    }
};
