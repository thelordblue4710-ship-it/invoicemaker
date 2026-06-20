# InvoiceAU — GST-ready invoicing for Australia

A Xero-style invoice maker tailored for Australian businesses: 10% GST handled
per line, compliant **Tax Invoice** layout, ABN fields, AUD formatting,
DD/MM/YYYY dates, financial-year (1 Jul – 30 Jun) reporting, and BSB / Account /
PayID payment details.

Stack: **Next.js** (hosted on **Vercel**) · **Supabase** (Postgres + Auth) ·
developed in **GitHub Codespaces** · versioned on **GitHub**.

---

## What's in this folder

```
invoiceau-starter/
├─ supabase/schema.sql        ← run this once in Supabase to create tables + security
├─ lib/supabase.js            ← Supabase client + GST/AUD helpers
├─ .devcontainer/             ← so the repo "just works" in Codespaces
├─ .env.example               ← which secrets you need
├─ package.json               ← dependencies
└─ README.md
```

The **interactive demo** (`invoiceau-demo.jsx`, provided alongside this folder)
is the finished front end. Drop it into `app/page.js` to use it as your UI,
then swap its in-memory state for the Supabase calls shown below.

---

## Step 1 — Put it on GitHub

1. Create a new empty repository at github.com (e.g. `invoiceau`).
2. Upload the contents of this folder, or from your machine:
   ```bash
   git init && git add . && git commit -m "InvoiceAU starter"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/invoiceau.git
   git push -u origin main
   ```

## Step 2 — Open it in Codespaces

On the repo page: **Code → Codespaces → Create codespace on main**.
The `.devcontainer` installs Node 20 and runs `npm install` for you.
When it opens, scaffold the Next.js app shell if you haven't already, then:
```bash
cp .env.example .env.local   # fill in your Supabase keys (Step 3)
npm run dev                  # preview opens on port 3000
```

## Step 3 — Create the Supabase backend

1. At supabase.com create a new project (choose the **Sydney** region for
   lowest latency in Australia).
2. Open **SQL Editor**, paste the whole of `supabase/schema.sql`, and run it.
   This creates the `businesses`, `clients`, `invoices`, and `invoice_items`
   tables, turns on Row Level Security (each user only sees their own data), and
   auto-creates a blank business profile on signup.
3. Go to **Project Settings → API** and copy the **Project URL** and the
   **anon public** key into your `.env.local`.
4. Under **Authentication → Providers**, keep Email enabled (add Google later if
   you like).

## Step 4 — Deploy on Vercel

1. At vercel.com: **Add New → Project**, import your GitHub repo.
2. Add two Environment Variables (same names as `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy. Every push to `main` now ships automatically.

---

## Wiring the demo UI to Supabase

The demo keeps invoices in React state. To persist them, replace those state
updates with Supabase queries. The shapes already match the schema.

```js
import { supabase, calcTotals } from "@/lib/supabase";

// Load this user's invoices with their line items
const { data: invoices } = await supabase
  .from("invoices")
  .select("*, client:clients(*), items:invoice_items(*)")
  .order("issue_date", { ascending: false });

// Create an invoice
const { data: inv } = await supabase
  .from("invoices")
  .insert({ number: "INV-0001", client_id, due_date, status: "draft" })
  .select()
  .single();

// Add line items
await supabase.from("invoice_items").insert(
  items.map((it, i) => ({ invoice_id: inv.id, ...it, position: i }))
);

// Mark paid
await supabase.from("invoices").update({ status: "paid" }).eq("id", inv.id);
```

`owner_id` is set automatically by RLS to the signed-in user, so you never send
it from the client.

---

## Australian compliance notes

- **GST** is 10% and toggled per line, so you can mix taxable and GST-free items
  (e.g. some food, exports) on one invoice.
- A document headed **Tax Invoice** showing your ABN, the GST amount, and the
  total is what the ATO requires for sales over $82.50 (inc GST). The demo's
  preview follows this layout.
- If you are **not registered for GST**, set every line to "Free" and rename the
  heading to "Invoice" — you must not charge GST unless registered.
- This is a starting point, not tax advice. Check current ATO requirements for
  your situation.
