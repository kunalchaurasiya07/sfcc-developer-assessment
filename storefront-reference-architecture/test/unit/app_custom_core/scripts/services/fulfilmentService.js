'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var serviceDefinition;
var serviceId;
var createdService;
var fulfilmentService = proxyquire('../../../../../cartridges/app_custom_core/cartridge/scripts/services/fulfilmentService', {
    'dw/svc/LocalServiceRegistry': {
        createService: function (id, definition) {
            serviceId = id;
            serviceDefinition = definition;
            return createdService;
        }
    },
    'dw/util/StringUtils': {
        encodeBase64: function (value) {
            return Buffer.from(value).toString('base64');
        }
    }
});

describe('fulfilmentService mock response', function () {
    [
        { suffix: 'ERROR400', statusCode: 400, error: 'bad_request' },
        { suffix: 'ERROR401', statusCode: 401, error: 'unauthorized' },
        { suffix: 'ERROR500', statusCode: 500, error: 'internal_error' },
        { suffix: 'ERROR', statusCode: 500, error: 'internal_error' }
    ].forEach(function (testCase) {
        it('returns the documented error body for ' + testCase.suffix, function () {
            var response = fulfilmentService.getMockResponse({ sku: 'TEST-' + testCase.suffix });
            var body = JSON.parse(response.text);

            assert.strictEqual(response.statusCode, testCase.statusCode);
            assert.strictEqual(body.error, testCase.error);
            assert.isString(body.message);
            assert.isAbove(body.message.length, 0);
        });
    });

    it('preserves ordinary SKUs and returns a deterministic successful tier', function () {
        var params = { sku: 'TEST-SKU', country: 'US' };
        var response = fulfilmentService.getMockResponse(params);
        var body = JSON.parse(response.text);

        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(body.sku, params.sku);
        assert.strictEqual(body.country, params.country);
        assert.include(['SAME_DAY', 'NEXT_DAY', 'STANDARD'], body.tier);
        assert.deepEqual(fulfilmentService.getMockResponse({}).statusCode, 200);
        assert.strictEqual(JSON.parse(fulfilmentService.getMockResponse({}).text).sku, '');
    });
});

describe('fulfilmentService configuration', function () {
    beforeEach(function () {
        serviceDefinition = null;
        serviceId = null;
        createdService = {};
        fulfilmentService.getService();
    });

    it('creates a GET request with query parameters and basic authorization', function () {
        var calls = [];
        var credential = {
            getURL: function () { return 'https://fulfilment.example///'; },
            getUser: function () { return 'api-user'; },
            getPassword: function () { return 'secret'; }
        };
        var svc = {
            getConfiguration: function () {
                return { getCredential: function () { return credential; } };
            },
            setRequestMethod: function (method) { calls.push(['method', method]); },
            setURL: function (url) { calls.push(['url', url]); },
            addParam: function (key, value) { calls.push(['param', key, value]); },
            addHeader: function (key, value) { calls.push(['header', key, value]); }
        };

        assert.strictEqual(serviceId, 'fulfilment.http.get');
        assert.isNull(serviceDefinition.createRequest(svc, { sku: 'SKU-1', country: 'US' }));
        assert.deepEqual(calls, [
            ['method', 'GET'],
            ['url', 'https://fulfilment.example/fulfillment'],
            ['param', 'sku', 'SKU-1'],
            ['param', 'country', 'US'],
            ['header', 'Accept', 'application/json'],
            ['header', 'Authorization', 'Basic ' + Buffer.from('api-user:secret').toString('base64')]
        ]);
    });

    it('rejects a missing credential or a credential without a URL', function () {
        var svc = {
            getConfiguration: function () {
                return { getCredential: function () { return null; } };
            }
        };
        assert.throws(function () {
            serviceDefinition.createRequest(svc, null);
        }, /credential.*not configured/);
        assert.throws(function () {
            serviceDefinition.createRequest(svc, { sku: 'SKU-1', country: 'US' });
        }, /credential.*not configured/);
        svc.getConfiguration = function () {
            return {
                getCredential: function () {
                    return { getURL: function () { return ''; } };
                }
            };
        };
        assert.throws(function () {
            serviceDefinition.createRequest(svc, { sku: 'SKU-1', country: 'US' });
        }, /credential.*not configured/);
    });

    it('parses successful responses and rejects HTTP errors', function () {
        assert.deepEqual(serviceDefinition.parseResponse({}, {
            statusCode: 200,
            text: '{"tier":"STANDARD"}'
        }), { tier: 'STANDARD' });
        assert.throws(function () {
            serviceDefinition.parseResponse({}, { statusCode: 503, text: '{}' });
        }, /HTTP 503/);
    });

    it('exposes mock calls and request/response log messages', function () {
        var credential = {
            getURL: function () { return 'https://example.com'; },
            getUser: function () { return 'user'; },
            getPassword: function () { return 'password'; }
        };
        var svc = {
            getConfiguration: function () {
                return { getCredential: function () { return credential; } };
            },
            setRequestMethod: function () {},
            setURL: function () {},
            addParam: function () {},
            addHeader: function () {}
        };

        serviceDefinition.createRequest(svc, { sku: 'SKU-2', country: 'GB' });
        var mockResponse = serviceDefinition.mockCall();
        assert.strictEqual(JSON.parse(mockResponse.text).sku, 'SKU-2');
        assert.strictEqual(serviceDefinition.getRequestLogMessage(),
            'GET /fulfillment?sku=SKU-2&country=GB');
        assert.strictEqual(serviceDefinition.getResponseLogMessage({ text: 'response' }), 'response');
        assert.strictEqual(serviceDefinition.getResponseLogMessage({ text: '' }), '');
        assert.strictEqual(serviceDefinition.getResponseLogMessage(null), '');
    });
});
