'use strict';

/**
 * @namespace Product
 * Extends app_storefront_base Product controller with delivery promise data.
 */

var server = require('server');
server.extend(module.superModule);

/**
 * Adds the delivery promise configuration to the view data
 * @param {Object} req - request
 * @param {Object} res - response
 * @param {Function} next - next middleware
 */
function appendDeliveryPromise(req, res, next) {
    var viewData = res.getViewData();

    if (viewData.product) {
        try {
            var deliveryPromiseHelpers = require('*/cartridge/scripts/helpers/deliveryPromiseHelpers');
            viewData.deliveryPromise = deliveryPromiseHelpers.getDeliveryPromiseConfig(viewData.product);
        } catch (e) {
            // The feature must never break the PDP
            require('dw/system/Logger').getLogger('deliveryPromise', 'DeliveryPromise')
                .error('Unable to build delivery promise config: {0}', e.message);
            viewData.deliveryPromise = { enabled: false, eligible: false, url: '' };
        }
        res.setViewData(viewData);
    }

    next();
}

/**
 * Product-Show : appends delivery promise config for the PDP
 * @name Custom/Product-Show
 * @function
 * @memberof Product
 */
server.append('Show', appendDeliveryPromise);

/**
 * Product-ShowInCategory : appends delivery promise config for the PDP
 * @name Custom/Product-ShowInCategory
 * @function
 * @memberof Product
 */
server.append('ShowInCategory', appendDeliveryPromise);

/**
 * Product-Variation : appends delivery promise config to the variation JSON
 * @name Custom/Product-Variation
 * @function
 * @memberof Product
 */
server.append('Variation', appendDeliveryPromise);

module.exports = server.exports();
