/**
 * Run once (and again only if the callback URL changes):
 *   npm run register-carrier-service
 *
 * Requires CARRIER-CALCULATED SHIPPING to be enabled on the store first
 * (Advanced Shopify plan / annual billing plan, or the $20/mo add-on -
 * ask Shopify Support to enable it if "Carrier service" is greyed out
 * under Settings > Shipping and delivery).
 *
 * Requires an Admin API access token with the write_shipping scope
 * (create a custom app under Settings > Apps and sales channels > Develop apps).
 */
import "dotenv/config";

const MUTATION = `
  mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
    carrierServiceCreate(input: $input) {
      carrierService {
        id
        name
        callbackUrl
        active
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const callbackUrl = process.env.CARRIER_SERVICE_CALLBACK_URL;

  if (!shop || !token || !callbackUrl) {
    console.error(
      "Set SHOPIFY_SHOP, SHOPIFY_ADMIN_ACCESS_TOKEN and CARRIER_SERVICE_CALLBACK_URL in .env first"
    );
    process.exit(1);
  }

  const res = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: MUTATION,
      variables: {
        input: {
          name: "Delivery Options", // internal name only - never shown to customers
          callbackUrl,
          active: true,
          supportsServiceDiscovery: true,
        },
      },
    }),
  });

  const json = (await res.json()) as {
    data?: {
      carrierServiceCreate?: {
        carrierService?: { id: string; name: string; callbackUrl: string; active: boolean };
        userErrors?: { field: string[]; message: string }[];
      };
    };
    errors?: unknown;
  };
  console.log(JSON.stringify(json, null, 2));

  const errors = json?.data?.carrierServiceCreate?.userErrors;
  if (errors?.length) {
    console.error("Shopify rejected the request - see userErrors above.");
    process.exit(1);
  }

  console.log("\nCarrier service registered. Now go to a shipping profile in Shopify admin");
  console.log("and add a zone rate that uses this carrier service, or confirm it's picked up");
  console.log("automatically depending on your shipping profile setup.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
