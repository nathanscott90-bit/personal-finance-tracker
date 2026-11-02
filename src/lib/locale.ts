/**
 * Locale and currency for every number and date the app displays.
 *
 * Defaults to UK English and pounds sterling. Override at build time with
 * NEXT_PUBLIC_FINANCE_LOCALE (e.g. "en-US") and NEXT_PUBLIC_FINANCE_CURRENCY
 * (e.g. "USD"). NEXT_PUBLIC_ variables are inlined into client bundles, so the
 * same value applies to server and client rendering.
 */
export const LOCALE: string = process.env.NEXT_PUBLIC_FINANCE_LOCALE || "en-GB";
export const CURRENCY: string =
  process.env.NEXT_PUBLIC_FINANCE_CURRENCY || "GBP";

/** "£", "$", "€" … — the narrow symbol for CURRENCY in LOCALE. */
export const CURRENCY_SYMBOL: string =
  new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((p) => p.type === "currency")?.value ?? CURRENCY;

/** Placeholder for money inputs, e.g. "£0.00". */
export const MONEY_PLACEHOLDER = `${CURRENCY_SYMBOL}0.00`;
