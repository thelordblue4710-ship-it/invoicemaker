-- ============================================================
--  InvoiceAU — Supabase schema (run in Supabase SQL Editor)
--  GST-compliant invoicing for the Australian market.
-- ============================================================

-- Each signed-in user owns one business profile.
create table public.businesses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  abn         text,                       -- Australian Business Number
  email       text,
  phone       text,
  address     text,
  bsb         text,                       -- bank BSB for EFT
  account     text,                       -- bank account number
  payid       text,
  terms_days  int  not null default 14,   -- default payment terms
  accent      text not null default '#1f7a66',
  created_at  timestamptz not null default now(),
  unique (owner_id)
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  abn         text,
  email       text,
  address     text,
  created_at  timestamptz not null default now()
);

create type invoice_status as enum ('draft', 'sent', 'paid');

create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete set null,
  number      text not null,              -- e.g. INV-0001
  issue_date  date not null default current_date,
  due_date    date not null,
  status      invoice_status not null default 'draft',
  notes       text,
  created_at  timestamptz not null default now(),
  unique (owner_id, number)
);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null default '',
  qty         numeric not null default 1,
  unit_price  numeric not null default 0,  -- ex-GST unit price
  taxable     boolean not null default true, -- attracts 10% GST
  position    int not null default 0
);

create index on public.clients (owner_id);
create index on public.invoices (owner_id);
create index on public.invoice_items (invoice_id);

-- ----------------------------------------------------------------
--  Row Level Security: a user can only ever see their own data.
-- ----------------------------------------------------------------
alter table public.businesses     enable row level security;
alter table public.clients        enable row level security;
alter table public.invoices       enable row level security;
alter table public.invoice_items  enable row level security;

create policy "own business"  on public.businesses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "own clients"   on public.clients
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "own invoices"  on public.invoices
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Items are reachable through their parent invoice.
create policy "own invoice items" on public.invoice_items
  for all using (
    exists (select 1 from public.invoices i
            where i.id = invoice_items.invoice_id and i.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.invoices i
            where i.id = invoice_items.invoice_id and i.owner_id = auth.uid())
  );

-- Create a blank business profile automatically on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.businesses (owner_id, name)
  values (new.id, 'My business');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
