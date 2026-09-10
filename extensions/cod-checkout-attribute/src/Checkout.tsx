import { useEffect, useRef, useState } from "react";
import {
  reactExtension,
  useShippingAddress,
  useApplyAttributeChange,
  useAttributeValues,
  useSettings,
  Banner,
} from "@shopify/ui-extensions-react/checkout";
import { deriveCodEligibleValue, looksLikeCompletePincode, CheckPincodeResponse } from "./logic";

export default reactExtension("purchase.checkout.delivery-address.render-after", () => (
  <CodEligibilitySync />
));

function CodEligibilitySync() {
  const address = useShippingAddress();
  const applyAttributeChange = useApplyAttributeChange();
  const settings = useSettings();
  const [currentAttrValue] = useAttributeValues(["cod_eligible"]);

  const [status, setStatus] = useState<"idle" | "checking" | "checked" | "error">("idle");
  const [codPrice, setCodPrice] = useState<number | undefined>(undefined);
  const lastCheckedZip = useRef<string | null>(null);

  const apiBaseUrl = (settings?.api_base_url as string | undefined)?.replace(/\/$/, "");
  const zip = address?.zip;

  useEffect(() => {
    // useShippingAddress only updates on field commit (not every keystroke),
    // so we don't need our own debounce on top of that.
    if (!apiBaseUrl || !looksLikeCompletePincode(zip)) return;
    if (zip === lastCheckedZip.current) return; // don't re-fetch/re-write for the same zip

    let cancelled = false;
    lastCheckedZip.current = zip;
    setStatus("checking");

    (async () => {
      let data: CheckPincodeResponse | null = null;
      try {
        const res = await fetch(`${apiBaseUrl}/check/${zip}`);
        if (res.ok) {
          data = (await res.json()) as CheckPincodeResponse;
        }
      } catch {
        data = null; // network error - deriveCodEligibleValue(null) fails closed
      }

      if (cancelled) return;

      const value = deriveCodEligibleValue(data);
      setCodPrice(data?.cod?.price);
      setStatus(data ? "checked" : "error");

      const result = await applyAttributeChange({
        type: "updateAttribute",
        key: "cod_eligible",
        value,
      });

      if (cancelled) return;
      if (result.type === "error") {
        // Most commonly: buyer is on an accelerated checkout (Shop Pay / Apple Pay /
        // Google Pay), where applyAttributeChange is documented to fail. That's fine -
        // those buyers aren't paying via COD anyway, and the payment function already
        // fails closed (hides COD) when the attribute was never successfully set.
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [zip, apiBaseUrl, applyAttributeChange]);

  if (!apiBaseUrl) {
    // Misconfigured extension (merchant hasn't set the API URL in the checkout editor)
    return null;
  }

  if (status === "checking") {
    return <Banner status="info" title="Checking delivery options for your address..." />;
  }

  if (status === "checked" && currentAttrValue === "true") {
    return (
      <Banner
        status="success"
        title={
          codPrice
            ? `Cash on delivery available (+₹${codPrice})`
            : "Cash on delivery available at this address"
        }
      />
    );
  }

  // Deliberately silent otherwise (not serviceable / no COD / not yet checked) -
  // the delivery options themselves (from the Carrier Service) already communicate
  // availability; this banner only needs to speak up for the positive COD case.
  return null;
}
