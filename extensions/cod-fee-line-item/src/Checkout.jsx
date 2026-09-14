import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

// Renders into the checkout DOM directly (this newer API doesn't use
// reactExtension() - the default export just mounts the component).
export default async () => {
  render(<CodFeeLineItem />, document.body);
};

/**
 * Does this delivery option correspond to our "Cash on Delivery" carrier-
 * service shipping rate (`code: "COD"`, `name: "Cash on Delivery"` from
 * src/services/rateResolver.ts, sent to Shopify as `service_code` /
 * `service_name` by src/routes/carrierService.ts)? Checked by `code` first
 * since that's an exact, stable identifier; title is a fallback for delivery
 * options that don't surface a code (e.g. local pickup).
 */
function isCodDeliveryOption(option) {
  if (!option) return false;
  if (option.code && option.code.trim().toUpperCase() === 'COD') return true;
  const title = option.title;
  return !!title && title.trim().toLowerCase().includes('cash on delivery');
}

/**
 * Keeps a separate "COD Handling Fee" cart line in sync with whether the
 * shopper has the "Cash on Delivery" shipping rate selected.
 *
 * Why a cart line and not a price bump on the rate itself: Shopify's Carrier
 * Service API only lets the shipping rate carry one bundled price - there's
 * no way to make it show two amounts. src/services/rateResolver.ts already
 * keeps the COD rate's own `price` as the bare courier cost (no fee folded
 * in); this extension is what actually charges the fee, as its own line in
 * the order summary, separate from the Shipping line.
 *
 * The fee amount itself comes from the fee product's own Shopify price
 * (configured once when you create it) - this extension only adds/removes
 * one unit of that variant, it doesn't set or know the price directly.
 */
function CodFeeLineItem() {
  // Reading .value here subscribes this component to updates automatically
  // (these are @preact/signals) - no manual subscription needed.
  const deliveryGroups = shopify.deliveryGroups.value;
  const lines = shopify.lines.value;
  const settings = shopify.settings.value;

  const feeVariantId = settings?.cod_fee_variant_id;
  const busyRef = useRef(false);

  // selectedDeliveryOption is only a { handle } reference - the actual
  // code/title live on the matching entry in deliveryOptions.
  const codSelected = deliveryGroups.some((group) => {
    const selectedHandle = group.selectedDeliveryOption?.handle;
    if (!selectedHandle) return false;
    const selectedOption = group.deliveryOptions.find((o) => o.handle === selectedHandle);
    return isCodDeliveryOption(selectedOption);
  });

  const existingFeeLine = feeVariantId
    ? lines.find((line) => line.merchandise?.id === feeVariantId)
    : undefined;

  useEffect(() => {
    if (!feeVariantId || busyRef.current) return;

    if (codSelected && !existingFeeLine) {
      busyRef.current = true;
      shopify
        .applyCartLinesChange({
          type: 'addCartLine',
          merchandiseId: feeVariantId,
          quantity: 1,
        })
        .finally(() => {
          busyRef.current = false;
        });
    } else if (!codSelected && existingFeeLine) {
      busyRef.current = true;
      shopify
        .applyCartLinesChange({
          type: 'removeCartLine',
          id: existingFeeLine.id,
          quantity: existingFeeLine.quantity,
        })
        .finally(() => {
          busyRef.current = false;
        });
    }
    // existingFeeLine is a fresh object every render, so key the effect on its
    // id/undefined-ness rather than the object itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codSelected, existingFeeLine?.id, feeVariantId]);

  if (!feeVariantId) {
    // Misconfigured: merchant hasn't pasted the fee product's variant GID
    // into this extension's settings in the checkout editor yet. Stay silent
    // rather than break checkout for every shopper.
    return null;
  }

  if (codSelected && existingFeeLine) {
    return (
      <s-banner heading="Cash on Delivery selected" tone="info">
        A separate handling fee has been added to your order.
      </s-banner>
    );
  }

  return null;
}
