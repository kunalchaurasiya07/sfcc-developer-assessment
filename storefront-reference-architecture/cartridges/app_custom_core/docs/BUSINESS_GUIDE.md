# Delivery Promise – Business User Guide

The **Delivery Promise** block tells shoppers how fast an in-stock product can be delivered. It appears on the product page, directly below the availability information.

The delivery system chooses a tier for each product and country. These are the starter tiers:

| Tier | Example message | Content asset ID |
| --- | --- | --- |
| Same day | "Same-day delivery – Order before 4:00 PM to get it today" | `delivery-promise-same-day` |
| Next day | "Next-day delivery – Arrives tomorrow if you order today" | `delivery-promise-next-day` |
| Standard | "Standard delivery – Delivered in 3–5 business days" | `delivery-promise-standard` |
| Fallback | Shown when the delivery system is unavailable | `delivery-promise-fallback` |

You control **which content asset each tier uses and what that asset looks like and says**. After the feature is installed, adding a tier does not require a code deployment.

---

## 1. Turning the feature on or off

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Delivery Promise**.
2. Set **Enable Delivery Promise on PDP** to *Yes* or *No*. Save.
3. Changes are visible after the page cache refreshes. To see them immediately, go to **Administration > Sites > Manage Sites > [site] > Cache > Invalidate**.

When it is switched off, the block disappears completely and the delivery system is not called.

Other settings in the same group:

| Setting | What it does |
| --- | --- |
| Default Country | The country used when the shopper's locale has no country, e.g. `US` |
| Client Timeout (ms) | The longest time the page waits for the block. After this, the block is hidden. Recommended: 5000. |

---

## 2. Editing a tier's content

1. Go to **Merchant Tools > Content > Content Assets**.
2. Search for `delivery-promise`.
3. Open the asset for the tier you want to change, e.g. `delivery-promise-next-day`.
4. Select the language at the top (e.g. *Default*, *English (US)*, *French*) if you want to translate.
5. Scroll to the **Delivery Promise** attribute group and edit the fields:

| Field | Shown as | Tips |
| --- | --- | --- |
| **Eyebrow** | Small coloured uppercase label at the top | Short, e.g. "Delivery option" |
| **Heading** | Large bold title | Max ~30 characters reads best, e.g. "Next-day delivery" |
| **Message** | Supporting text under the heading | One sentence, plain text |
| **Badge Text** | Rounded pill at the bottom | Short, e.g. "Arrives tomorrow". Leave empty to hide. |
| **Icon** | Icon in the coloured square, top left | Choose from the list. Leave empty to hide. |
| **Badge Icon** | Small icon inside the badge | Choose from the list. Leave empty to hide. |
| **Image** | Picture on the right (top on mobile) | Landscape, about 600 × 480 px, JPG or WebP, under 100 KB. Leave empty for a text-only block. |
| **Image Alt Text** | Read aloud by screen readers | Describe the image, e.g. "Courier handing over a parcel". Leave empty if it is purely decorative. |
| **Accent Colour** | Colour of the icon square, eyebrow and badge | A hex code such as `#2e7d32`. Leave empty for grey. Invalid values are ignored. |

6. Click **Apply**.
7. Make sure the asset is **Online** (the *Online* checkbox at the top).

Changes appear on the storefront within about 30 minutes, or immediately after invalidating the page cache.

### Starter asset colours

| Tier | Default colour |
| --- | --- |
| Same day | Green `#2e7d32` |
| Next day | Blue `#1f78b4` |
| Standard / Fallback | Grey `#6c757d` |

These are colours set on the starter content assets, not code-defined tier styles. Use dark enough colours so white text and icons remain readable. New tier assets with no accent colour use grey.

### Available icons

Lightning bolt, Truck, Parcel / cube, Clock, Calendar, Calendar check, Shield, Rocket, Map marker, Check circle, Info circle, Gift.

---

## 3. The fallback message

If the delivery system is slow or unavailable, shoppers see the **`delivery-promise-fallback`** asset instead of a tier. For example: "Fast, reliable delivery – Delivery options and dates are confirmed at checkout".

- Edit it the same way as the tier assets.
- Set it **Offline** if you would rather show nothing when the delivery system is unavailable. Keeping it online gives a smoother page with no jump in layout.

---

## 4. Adding a new tier (no deployment)

Use this when the fulfilment service introduces a tier such as `EVENING`. The fulfilment service must return the new tier code; this setup controls how the storefront presents it.

1. Create a content asset under **Merchant Tools > Content > Content Assets**. Give it an ID such as `delivery-promise-evening`, set it Online, and fill in the Delivery Promise attributes described above.
2. Go to **Administration > Site Development > Custom Objects** and open the `DeliveryPromiseTier` type for the site.
3. If the type page says it cannot be edited because it has no attribute groups, re-import the updated `meta/custom-objecttype-definitions.xml` from the delivery-promise site archive. The *Delivery Promise Tier Mapping* group exposes the editable content asset ID and enabled fields; the tier is entered as the custom-object key.
4. Create a custom object with key `EVENING`. Tier keys are normalized to uppercase and may contain uppercase letters, numbers and underscores (up to 40 characters).
5. Set **Content Asset ID** to `delivery-promise-evening` and **Enabled** to Yes, then save.
6. Configure the fulfilment service or an external HTTP mock (for example Beeceptor) to return `EVENING` for an in-stock test SKU. The built-in service mock cycles through only the starter tiers.
7. If you previously tested the same SKU and country, invalidate the storefront page cache. Successful rendered blocks are cached for up to 30 minutes.

The tier uses the existing responsive card, supported icon choices, and validated accent colour. A new visual layout or new content fields still needs a code deployment. An unmapped or disabled tier uses the fallback asset.

### Updating or disabling a mapping

- To change the tier's content, update the mapped content asset.
- To point the tier at another asset, edit **Content Asset ID** on its custom object.
- To disable the tier mapping temporarily, set **Enabled** to No. The fallback asset is shown.

---

## 5. Hiding a single tier

To hide the block for one tier only (e.g. you stop offering same-day delivery), set that asset **Offline**. Shoppers whose product resolves to that tier will then see no delivery block. The rest of the page is unaffected.

---

## 6. FAQ

**When does the block appear?**
Only when a specific variant (e.g. colour *and* size) is selected and it is **in stock**. It does not appear for out-of-stock products or before a variant is selected.

**Why don't I see my change?**
Check the following:

- the asset is Online
- you edited the right language
- the Delivery Promise preference is enabled

Then invalidate the page cache.

**Can I use HTML in the message?**
No. Text is shown as plain text for security and consistent styling.

**Who decides the tier for a product?**
The external fulfilment (delivery) system, per product and country. Business Manager maps each tier code to a content asset and controls how it is presented.
