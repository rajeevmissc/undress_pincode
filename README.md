# Pincode Delivery App

A custom Shopify Carrier Service that shows delivery options based on the
customer's PIN code, choosing between DTDC and Delhivery behind the scenes.
The fulfilling partner (`courier`: `DTDC` / `DELHIVERY` / `SPEEDPOST`) is included in every response.

## Delivery rules

Source of truth: `scripts/dtdc_delhivary_data.xlsx` (Sheet1 = per-pincode data,
Sheet2 = Delhivery zone rate card). 24,056 pincodes, every one serviceable by at
least one courier.

**If DTDC serves the pincode → only DTDC options are offered:**

| Customer sees | From the file | Price | Transit |
|---|---|---|---|
| `Standard Delivery` | DTDC Surface (SMART_EXPRESS) | always ₹0 | Surface TAT, e.g. "2 business days" |
| `Priority Delivery` | DTDC Air (PRIORITY) | ₹50 / 78 / 82 / 100 (by zone) | Air TAT |
| `Cash on Delivery` | DTDC COD flag | = that pincode's Air price | Air TAT |

A tier that the file marks `N` (or `NA`) is simply not shown — it is never
treated as "free". 8,746 pincodes get only Standard; 4 get only Priority.

**If DTDC does NOT serve the pincode → Delhivery fallback (1,255 pincodes):**

| Customer sees | Price | Transit |
|---|---|---|
| `Standard Delivery` | the Delhivery "TAT" column value — ₹120, or ₹150 for North East | fixed label "8–10 business days" |
| `Cash on Delivery` | Sheet2 col B by zone — ₹50 / 78 / 82 / 100 | "8–10 business days" |

Delhivery is **only** used when DTDC can't deliver at all — there is no
"DTDC ships but Delhivery covers COD" mixing.

**If neither courier has data for the pincode** (not serviceable by DTDC or
Delhivery, or the pincode simply isn't in the DB) **→ a single default option:**

| Customer sees | Price | Transit | COD |
|---|---|---|---|
| `Speed Post` (`service_code` `SPEEDPOST`) | ₹100 | "8–10 business days" | no |

So `serviceable` is effectively always `true` and checkout is never left without a
shipping option. Tunable in `src/services/rateResolver.ts` → `DEFAULT_OPTION`.
`POST /shopify/rates` with **no** postal code still returns `{"rates": []}` (the
default only kicks in once a PIN is actually supplied).

### Decisions baked in (no column for these in the file)

- **DTDC COD fee** = the pincode's DTDC Air price. Every COD pincode also has Air
  (verified across all 24,056 rows), so this is always defined.
- **Delhivery Standard price** = the value in Delhivery's "TAT" column (120 / 150).
- **Delhivery transit time** is a flat "8–10 business days" (the file has no
  day-level figure for Delhivery). This label is **stored on the document**
  (`delhivery.standard.transitLabel` / `delhivery.cod.transitLabel`), so the DB is
  self-describing; DTDC tiers instead carry a numeric `transitDays` and a null
  `transitLabel`. The resolver uses `transitLabel ?? "<transitDays> business days"`.

## Project structure

```
src/
  models/PincodeServiceability.ts   one document per pincode (dtdc + delhivery blocks)
  services/pincodeDataset.ts        parse the .xlsx workbook -> one record per pincode (pure)
  services/pincodeStore.ts          full-refresh load into MongoDB (+ drops the legacy collection)
  services/rateResolver.ts          the DTDC-first / Delhivery-fallback decision logic
  routes/carrierService.ts          POST /shopify/rates  - what Shopify checkout calls
  routes/pincodeCheck.ts            GET  /check/:pincode  - for a storefront widget
  routes/adminImport.ts            POST /admin/import    - re-upload the .xlsx over HTTP
  scripts/importXlsx.ts             CLI importer (npm run import)
  scripts/testResolver.ts           no-database logic test (npm run test-resolver)
  scripts/registerCarrierService.ts one-time Shopify registration
scripts/
  dtdc_delhivary_data.xlsx          the source workbook
  pincode_data_flat.csv             flat snapshot written by the importer (for eyeballing)
  validateRealData.ts               runs all 24,056 real pincodes through the resolver
```

## Setup

```bash
cp .env.example .env
# set MONGO_URI (with a database name in the path, e.g. .../pincode-delivery),
#     SHOPIFY_SHOP (bare host, no https://), SHOPIFY_ADMIN_ACCESS_TOKEN, ADMIN_API_KEY
npm install
npm run import          # loads scripts/dtdc_delhivary_data.xlsx into MongoDB (full refresh)
npm run dev             # server on :3000
```

`npm run import -- path/to/other.xlsx` to load a different file. Re-running it is
always safe — it wipes and rebuilds the `pincodeserviceabilities` collection.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/check/:pincode` | — (CORS open) | resolved options for a PIN, incl. `courier` |
| POST | `/shopify/rates` | — (Shopify calls it) | Carrier Service callback; prices in paise |
| POST | `/admin/import` | `x-admin-key` header | upload the `.xlsx` (form field `file`), full refresh |

`GET /check/110001` →

```json
{
  "pincode": "110001",
  "serviceable": true,
  "courier": "DTDC",
  "options": [
    { "code": "STANDARD", "name": "Standard Delivery", "price": 0,  "transitDays": 2, "transitLabel": "2 business days", "cod": false, "courier": "DTDC" },
    { "code": "PRIORITY", "name": "Priority Delivery", "price": 50, "transitDays": 2, "transitLabel": "2 business days", "cod": false, "courier": "DTDC" },
    { "code": "COD",      "name": "Cash on Delivery",  "price": 50, "transitDays": 2, "transitLabel": "2 business days", "cod": true,  "courier": "DTDC" }
  ]
}
```

`courier` is `"DTDC"`, `"DELHIVERY"`, or `"SPEEDPOST"` (same value on the result
and on each option). `POST /shopify/rates` puts it on each rate object and, when
there are rates, at the top level too — Shopify ignores the extra field.

Invalid PIN (`^[1-9][0-9]{5}$`) → `400`. Unknown but well-formed PIN → `200` with
the default Speed Post option (`serviceable: true`, one `SPEEDPOST` option).

`POST /shopify/rates` with `{"rate":{"destination":{"postal_code":"110001"}}}` →
one Shopify rate per option (`total_price` in paise, `currency` "INR",
`description` = the transit label, and a `min/max_delivery_date` window when a
day count is known). No match → `{"rates": []}` (not an error).

## Testing without Shopify / without a database

```bash
npm run test-resolver   # pure logic, explicit assertions, 9 scenarios
npm run validate-data    # every one of the 24,056 real pincodes through the resolver
```

## Shopify wiring (after the backend is up on a public HTTPS URL)

1. Custom app with the `write_shipping` Admin API scope → put the token in `.env`.
2. Deploy so `/shopify/rates` is reachable over HTTPS; set `CARRIER_SERVICE_CALLBACK_URL`.
3. `npm run register-carrier-service` (one-time).
4. Shopify admin → Settings → Shipping and delivery → your profile → Manage rates →
   add a rate from the new "Delivery Options" carrier service to the zone(s).

## COD payment method (Shopify Functions, in `extensions/`)

`extensions/cod-payment-customization/` hides "Cash on Delivery" at checkout
unless a `cod_eligible` cart attribute is `"true"`; `extensions/cod-checkout-attribute/`
keeps that attribute in sync by calling `/check/:pincode` as the buyer types their
PIN. Both have unit tests (`npm test` in each folder). Their `shopify.extension.toml`
is illustrative — regenerate via `shopify app generate extension` and drop the
tested `src/` files in. Enable **Protected customer data access (Address scope)**
for the app or the checkout extension gets no address data.
