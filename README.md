# SFCC Engineer Task

## Background

When a shopper lands on a product page and selects a product which is in stock, below the
availability information, merchandising wants the PDP to display how soon the delivery can be made.

How fast we can deliver a given product to a given country is decided by an external fulfilment
service. The storefront's job is to ask that service on sellable product selection and render the
matching content.

## Requirements

On the PDP, below the existing availability information:

1. If variant availability is In Stock, call the fulfilment service for this product + country.
2. The service returns a delivery tier (`SAME_DAY`, `NEXT_DAY`, `STANDARD`).
3. Render the respective content based on delivery tier response.
4. The content block must be responsive and render in the Montserrat font specifically.
5. The content shown for each tier must be brand-managed without a code deployment.
6. The PDP must always load fast and never break.
7. Documentation must be created with technical details and configurations, and for business on how to use them.

**Reference:**

![Reference](./design.png)

## The content block

Each delivery tier maps a message to be shown on the PDP. Images can be used as per preference; below
is only a sample reference.

| Tier | Example block |
| --- | --- |
| `SAME_DAY` | ![SAME_DAY sample](./same-day-delivery-block.png) |
| `NEXT_DAY` | ![NEXT_DAY sample](./next-day-delivery-block.png) |
| `STANDARD` | ![STANDARD sample](./standard-delivery-block.png) |

## Service contract

The endpoint is protected with **HTTP Basic Authentication**. Send an
`Authorization: Basic <base64(username:password)>` header on every request.

```
GET {{ENDPOINT}}/fulfillment?sku={sku}&country={country}
Authorization: Basic {{base64(username:password)}}
```

Returns a normalized `tier` your content map keys on:

```json
Successful response example with status code 200
{
  "sku": "sku",
  "country": "country",
  "tier": "tier"
}

Error response example with status code 400/401/500
{
  "error": "error_type",
  "message": "error_message"
}
```

**Mocking the service.** No real backend — stand up a mock and note it in the README. Any of these
works:

- **Beeceptor** (`https://<name>.free.beeceptor.com`) or **Mocky** (`https://run.mocky.io/...`),
  varying `tier` per sku so you can demo every block.
- **DummyJSON** (`https://dummyjson.com/...`) if you'd rather map a real live response.
- A stub routed through the Service framework, with a note on how you'd swap in the real URL.

Include one sku with a **3–5s delay or intermittent 500** so you can demonstrate resilience.

## Acceptance criteria

- On available variant selection, the fulfilment service is called for `{sku, country}`; the matching
  tier's content block renders below the availability info.
- Each tier's content (copy, image, styling) is business-editable in BM with no deployment.
- The block is responsive and accessible, with clean loading and fallback states and no layout shift.
- A slow or failing fulfilment service never blocks or breaks the PDP.
- Repeat views of the same variant don't repeatedly hit the service.
- The block renders in Montserrat, loaded without hurting performance.
- The feature flag disables the whole feature cleanly.
- No visual or JS errors.

---

## Environment & submission

- You'll get a **fresh sandbox** with **only the SFRA storefront**.
- **Estimated effort:** ~1 day (roughly 6–10 hours depending on experience).
- **Submit** a **private GitHub repository shared with @faraharif**, @daniel-rosiak, containing your code, respective
  documentation, and a `README.md` to document your implementation and how to test it.

---

## Implementation

All changes are in the custom cartridge
[storefront-reference-architecture/cartridges/app_custom_core](storefront-reference-architecture/cartridges/app_custom_core).
`app_storefront_base` is untouched. The only change outside the cartridge is the build and upload scripts in
`storefront-reference-architecture/package.json`.

| Document | Audience |
| --- | --- |
| [Technical README](storefront-reference-architecture/cartridges/app_custom_core/README.md) | Developers: architecture, setup, configuration, mock service, test plan |
| [Business guide](storefront-reference-architecture/cartridges/app_custom_core/docs/BUSINESS_GUIDE.md) | Merchandisers: editing tier content, feature flag, FAQ |

### Quick start

1. Run `cd storefront-reference-architecture && npm install && npm run build && npm run uploadCartridge`.
2. Set the cartridge path to `app_custom_core:app_storefront_base`.
3. Zip `cartridges/app_custom_core/site_import/delivery-promise` and import it via *Site Import & Export*.
4. In *Services > Credentials > fulfilment.http.credentials*, set the mock URL, user and password.
5. Open a PDP and select an in-stock variant. The delivery block appears below the availability.

Note: Step 2 and step 4 already included in the Site-Import File

### Highlights

- The PDP is never blocked: the block is loaded asynchronously into a server-rendered skeleton.
  The service has a 2s timeout and a circuit breaker. A fallback asset is shown on failure.
- Repeat views don't hit the service. There is a tier cache (custom cache, 30 min) and the endpoint is page cached
  for 30 min. The browser also caches responses in memory and de-duplicates in-flight requests.
- Tier content (copy, icon, image, accent colour) is managed in BM content assets and is localizable.
- The feature flag `deliveryPromiseEnabled` removes the markup, assets, font and service calls.
- Montserrat is loaded non-render-blocking, only when the feature is on, with a size-adjusted fallback
  to avoid layout shift.
- Mock service: Beeceptor rules per SKU, including a 4s delay SKU and a 500 SKU. Service framework mock mode is
  also supported (SKU suffix `ERROR` gives a 500). See the technical README, section 4.
