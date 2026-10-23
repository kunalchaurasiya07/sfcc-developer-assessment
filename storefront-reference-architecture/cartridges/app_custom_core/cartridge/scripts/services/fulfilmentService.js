'use strict';

/**
 * Fulfilment service definition.
 *
 * GET {credential.url}/fulfillment?sku={sku}&country={country}
 * Authorization: Basic base64(user:password)
 *
 */

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var StringUtils = require('dw/util/StringUtils');

var SERVICE_ID = 'fulfilment.http.get';
var MOCK_TIERS = ['SAME_DAY', 'NEXT_DAY', 'STANDARD'];
var MOCK_ERRORS = {
    400: {
        statusMessage: 'Bad Request',
        error: 'bad_request',
        message: 'Invalid fulfilment request'
    },
    401: {
        statusMessage: 'Unauthorized',
        error: 'unauthorized',
        message: 'Mock fulfilment authentication failed'
    },
    500: {
        statusMessage: 'Internal Server Error',
        error: 'internal_error',
        message: 'Fulfilment backend unavailable'
    }
};

/**
 * Builds the HTTP Basic Authorization header value from the service credential
 * @param {dw.svc.ServiceCredential} credential - BM service credential
 * @returns {string} header value
 */
function buildAuthorizationHeader(credential) {
    return 'Basic ' + StringUtils.encodeBase64(credential.getUser() + ':' + credential.getPassword());
}

/**
 * Deterministic mock used when the service is switched to "mocked" mode in BM.
 * - SKUs ending with "ERROR400", "ERROR401" or "ERROR500" return that HTTP error
 * - SKUs ending with "ERROR" remain an alias for HTTP 500
 * - other SKUs get a stable tier derived from the SKU characters
 * @param {Object} params - request params { sku, country }
 * @returns {Object} mocked HTTP client-like response
 */
function getMockResponse(params) {
    var sku = String(params.sku || '');
    // sku = '061492216706M_ERROR400';
    // sku = '061492216706M_ERROR401';
    // sku = '061492216706M_ERROR500';
    // sku = '061492216706M_ERROR';
    var errorMatch = sku.match(/ERROR(400|401|500)?$/i);

    if (errorMatch) {
        var statusCode = Number.parseInt(errorMatch[1] || '500', 10);
        var error = MOCK_ERRORS[statusCode];
        return {
            statusCode: statusCode,
            statusMessage: error.statusMessage,
            text: JSON.stringify({ error: error.error, message: error.message })
        };
    }

    var sum = 0;
    for (var i = 0; i < sku.length; i++) {
        sum += sku.charCodeAt(i);
    }

    return {
        statusCode: 200,
        statusMessage: 'ok',
        text: JSON.stringify({
            sku: sku,
            country: params.country,
            tier: MOCK_TIERS[sum % MOCK_TIERS.length]
        })
    };
}

/**
 * Creates the fulfilment service instance
 * @returns {dw.svc.HTTPService} service
 */
function getService() {
    var requestParams = {};

    return LocalServiceRegistry.createService(SERVICE_ID, {
        createRequest: function (svc, params) {
            requestParams = params || {};

            var credential = svc.getConfiguration().getCredential();
            if (!credential || !credential.getURL()) {
                throw new Error('Fulfilment service credential (URL/user/password) is not configured');
            }

            var baseUrl = credential.getURL().replace(/\/+$/, '');

            svc.setRequestMethod('GET');
            svc.setURL(baseUrl + '/fulfillment');
            svc.addParam('sku', params.sku);
            svc.addParam('country', params.country);
            svc.addHeader('Accept', 'application/json');
            svc.addHeader('Authorization', buildAuthorizationHeader(credential));

            return null;
        },
        parseResponse: function (svc, client) {
            if (client.statusCode !== 200) {
                throw new Error('Fulfilment service responded with HTTP ' + client.statusCode);
            }
            return JSON.parse(client.text);
        },
        mockCall: function () {
            return getMockResponse(requestParams);
        },
        getRequestLogMessage: function () {
            return 'GET /fulfillment?sku=' + requestParams.sku + '&country=' + requestParams.country;
        },
        getResponseLogMessage: function (response) {
            return response && response.text ? response.text : '';
        }
    });
}

module.exports = {
    getService: getService,
    getMockResponse: getMockResponse
};
