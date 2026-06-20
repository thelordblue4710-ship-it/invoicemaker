import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Reads invoices/clients under the
// signed-in user's Row Level Security policies.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const GST_RATE = 0.1;

export const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

export const lineTotal = (it) =>
  (Number(it.qty) || 0) * (Number(it.unit_price) || 0);

export function calcTotals(items = []) {
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const gst = items.reduce(
    (s, it) => s + (it.taxable ? lineTotal(it) * GST_RATE : 0),
    0
  );
  return { subtotal, gst, total: subtotal + gst };
}
