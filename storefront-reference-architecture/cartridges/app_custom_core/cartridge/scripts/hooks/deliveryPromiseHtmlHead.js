'use strict';

/**
 * app.template.htmlHead hook: injects the (non render-blocking) Montserrat font
 * only on pages that render the delivery promise block.
 * @param {Object} pdict - pipeline dictionary
 */
function htmlHead(pdict) {
    if (pdict && pdict.deliveryPromise && pdict.deliveryPromise.enabled) {
        var ISML = require('dw/template/ISML');
        ISML.renderTemplate('deliveryPromise/fontLoader', {});
    }
}

module.exports = {
    htmlHead: htmlHead
};
