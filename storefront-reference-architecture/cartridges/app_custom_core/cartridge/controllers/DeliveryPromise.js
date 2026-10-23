'use strict';

/**
 * @namespace DeliveryPromise
 */

var server = require('server');

var PAGE_CACHE_MINUTES = 30;

/**
 * DeliveryPromise-Show : returns the delivery tier and the rendered, BM-managed
 * content block for an in-stock product and country. Called asynchronously from
 * the PDP so a slow or failing fulfillment service never blocks the page.
 * @name DeliveryPromise-Show
 * @function
 * @memberof DeliveryPromise
 */
server.get('Show', function (req, res, next) {
    var result = { tier: null, html: '', cacheable: false };

    try {
        var deliveryPromiseHelpers = require('*/cartridge/scripts/helpers/deliveryPromiseHelpers');
        result = deliveryPromiseHelpers.resolveDeliveryPromise(req.querystring.pid, req.querystring.country);
    } catch (e) {
        require('dw/system/Logger').getLogger('deliveryPromise', 'DeliveryPromise')
            .error('DeliveryPromise-Show failed: {0}', e.message);
    }

    // Only successful lookups are page cached; fallbacks are retried on the next view
    if (result.cacheable) {
        res.cachePeriod = PAGE_CACHE_MINUTES;
        res.cachePeriodUnit = 'minutes';
    }

    res.json({
        tier: result.tier,
        html: result.html
    });

    next();
});

module.exports = server.exports();
