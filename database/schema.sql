-- ============================================================
-- RAKET MANTAN v2
-- SISTEM INFORMASI AKUNTANSI PENDAPATAN & PERSEDIAAN
-- Supabase PostgreSQL + Supabase Auth
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. TYPES
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'ownership_status') then
    create type public.ownership_status as enum ('milik_sendiri', 'konsinyasi');
  end if;
  if not exists (select 1 from pg_type where typname = 'inventory_status') then
    create type public.inventory_status as enum ('tersedia', 'terjual');
  end if;
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('completed', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'payout_status') then
    create type public.payout_status as enum ('pending', 'paid');
  end if;
end $$;

-- ============================================================
-- 2. USERS PROFILE
-- ============================================================
create table if not exists public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'admin',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. INVENTORY
-- ============================================================
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  received_date date not null default current_date,
  brand text not null,
  type text not null default '',
  shape text not null check (shape in ('Teardrop', 'Round', 'Diamond', 'Hybrid')),
  condition text not null check (condition in ('Baru', 'Bekas/Like New')),
  ownership_status public.ownership_status not null,
  cost_price numeric(15,2) not null default 0 check (cost_price >= 0),
  shipping_cost numeric(15,2) not null default 0 check (shipping_cost >= 0),
  selling_price numeric(15,2) not null default 0 check (selling_price >= 0),
  consignor_name text,
  status public.inventory_status not null default 'tersedia',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consignment_name_required check (
    ownership_status = 'milik_sendiri'
    or nullif(trim(consignor_name), '') is not null
  )
);

alter table public.inventory drop constraint if exists inventory_shape_check;
alter table public.inventory add constraint inventory_shape_check
  check (shape in ('Teardrop', 'Round', 'Diamond', 'Hybrid'));
alter table public.inventory add column if not exists photo_path text;
alter table public.inventory add column if not exists type text not null default '';
alter table public.inventory add column if not exists shipping_cost numeric(15,2) not null default 0 check (shipping_cost >= 0);
alter table public.inventory add column if not exists received_date date;
update public.inventory set received_date = created_at::date where received_date is null;
alter table public.inventory alter column received_date set default current_date;
alter table public.inventory alter column received_date set not null;

-- ============================================================
-- 4. SALES TRANSACTIONS
-- ============================================================
create table if not exists public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  sale_date timestamptz not null default now(),
  customer_name text not null,
  final_price numeric(15,2) not null check (final_price >= 0),
  shipping_cost numeric(15,2) not null default 0 check (shipping_cost >= 0),
  profit_margin numeric(15,2) not null default 0,
  commission_fee numeric(15,2) not null default 0 check (commission_fee >= 0),
  status public.sale_status not null default 'completed',
  created_at timestamptz not null default now()
);

alter table public.sales_transactions add column if not exists shipping_cost numeric(15,2) not null default 0 check (shipping_cost >= 0);

-- ============================================================
-- 5. CONSIGNMENT PAYOUTS
-- amount_due = hak penitip setelah dikurangi commission_fee.
-- Contoh: harga jual 3.000.000, fee 300.000 -> amount_due 2.700.000.
-- ============================================================
create table if not exists public.consignment_payouts (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  payout_date date,
  amount_due numeric(15,2) not null check (amount_due >= 0),
  status public.payout_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. INDEXES
-- ============================================================
create index if not exists idx_inventory_status on public.inventory(status);
create index if not exists idx_inventory_ownership on public.inventory(ownership_status);
create index if not exists idx_sales_inventory on public.sales_transactions(inventory_id);
create index if not exists idx_sales_date on public.sales_transactions(sale_date);
create index if not exists idx_sales_status on public.sales_transactions(status);
create index if not exists idx_payout_inventory on public.consignment_payouts(inventory_id);
create index if not exists idx_payout_status on public.consignment_payouts(status);

-- ============================================================
-- 7. UPDATED_AT
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

-- ============================================================
-- 8. PROFILE AUTO-CREATE AFTER AUTH SIGNUP
-- Role dari metadata hanya untuk kebutuhan demo aplikasi.
-- Untuk produksi, sebaiknya pendaftaran publik selalu admin dan
-- perubahan menjadi owner hanya dilakukan oleh owner/admin berwenang.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'admin');

  if requested_role not in ('owner', 'admin') then
    requested_role := 'admin';
  end if;

  insert into public.users_profile (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'User Raket Mantan'),
    requested_role::public.app_role
  )
  on conflict (id) do update
    set full_name = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- 9. HELPER: CURRENT ROLE
-- ============================================================
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users_profile where id = auth.uid()
$$;

-- ============================================================
-- 10. PROCESS SALE RPC
-- Atomik:
-- - validasi stok
-- - hitung profit/commission
-- - insert sale
-- - ubah inventory -> terjual
-- - jika konsinyasi, generate payout pending
-- ============================================================
drop function if exists public.process_sale(uuid, timestamptz, text, numeric, numeric, public.sale_status);
create or replace function public.process_sale(
  p_inventory_id uuid,
  p_sale_date timestamptz,
  p_customer_name text,
  p_final_price numeric,
  p_commission_fee numeric default 0,
  p_shipping_cost numeric default 0,
  p_status public.sale_status default 'completed'
)
returns public.sales_transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  inv public.inventory%rowtype;
  new_sale public.sales_transactions%rowtype;
  computed_profit numeric(15,2);
  payout_amount numeric(15,2);
begin
  if auth.uid() is null then
    raise exception 'User belum terautentikasi';
  end if;

  if p_final_price <= 0 then
    raise exception 'Harga jual harus lebih dari 0';
  end if;

  if p_shipping_cost < 0 then
    raise exception 'Biaya ongkir tidak boleh negatif';
  end if;

  select * into inv
  from public.inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'Raket tidak ditemukan';
  end if;

  if inv.status <> 'tersedia' then
    raise exception 'Raket sudah tidak tersedia';
  end if;

  if inv.ownership_status = 'milik_sendiri' then
    computed_profit := p_final_price - inv.cost_price - inv.shipping_cost - p_shipping_cost;
  else
      if p_commission_fee < 0 or p_commission_fee > p_final_price then
        raise exception 'Komisi Consignment tidak valid';
    end if;
    computed_profit := p_commission_fee - inv.shipping_cost - p_shipping_cost;
  end if;

  insert into public.sales_transactions (
    inventory_id, sale_date, customer_name, final_price, shipping_cost,
    profit_margin, commission_fee, status
  )
  values (
    p_inventory_id, coalesce(p_sale_date, now()), trim(p_customer_name),
    p_final_price, p_shipping_cost, computed_profit,
    case when inv.ownership_status = 'konsinyasi' then p_commission_fee else 0 end,
    p_status
  )
  returning * into new_sale;

  if p_status = 'completed' then
    update public.inventory
    set status = 'terjual'
    where id = p_inventory_id;

    if inv.ownership_status = 'konsinyasi' then
      payout_amount := greatest(p_final_price - p_commission_fee, 0);

      insert into public.consignment_payouts (
        inventory_id, amount_due, status
      )
      values (
        p_inventory_id, payout_amount, 'pending'
      );
    end if;
  end if;

  return new_sale;
end;
$$;

drop function if exists public.update_sale(uuid, timestamptz, text, numeric, numeric);
create or replace function public.update_sale(
  p_sale_id uuid,
  p_sale_date timestamptz,
  p_customer_name text,
  p_final_price numeric,
  p_commission_fee numeric,
  p_shipping_cost numeric
)
returns public.sales_transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale_row public.sales_transactions%rowtype;
  inv public.inventory%rowtype;
  pending_payout_id uuid;
  computed_profit numeric(15,2);
begin
  if auth.uid() is null then
    raise exception 'User belum terautentikasi';
  end if;

  if p_final_price <= 0 then
    raise exception 'Harga jual harus lebih dari 0';
  end if;

  if p_shipping_cost < 0 then
    raise exception 'Biaya ongkir tidak boleh negatif';
  end if;

  if nullif(trim(p_customer_name), '') is null then
    raise exception 'Nama pembeli wajib diisi';
  end if;

  select * into sale_row
  from public.sales_transactions
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  select * into inv
  from public.inventory
  where id = sale_row.inventory_id
  for update;

  if inv.ownership_status = 'milik_sendiri' then
    computed_profit := p_final_price - inv.cost_price - inv.shipping_cost - p_shipping_cost;
  else
    if p_commission_fee < 0 or p_commission_fee > p_final_price then
      raise exception 'Komisi Consignment tidak valid';
    end if;
    computed_profit := p_commission_fee - inv.shipping_cost - p_shipping_cost;
  end if;

  if sale_row.status = 'completed'
    and inv.ownership_status = 'konsinyasi'
    and (p_final_price <> sale_row.final_price or p_commission_fee <> sale_row.commission_fee) then
    select id into pending_payout_id
    from public.consignment_payouts
    where inventory_id = sale_row.inventory_id and status = 'pending'
    order by created_at desc
    limit 1
    for update;

    if pending_payout_id is null and exists (
      select 1 from public.consignment_payouts
      where inventory_id = sale_row.inventory_id and status = 'paid'
    ) then
      raise exception 'Nilai transaksi tidak dapat diubah setelah payout Consignment dibayar';
    end if;

    if pending_payout_id is not null then
      update public.consignment_payouts
      set amount_due = greatest(p_final_price - p_commission_fee, 0)
      where id = pending_payout_id;
    end if;
  end if;

  update public.sales_transactions
  set sale_date = p_sale_date,
      customer_name = trim(p_customer_name),
      final_price = p_final_price,
      shipping_cost = p_shipping_cost,
      commission_fee = case when inv.ownership_status = 'konsinyasi' then p_commission_fee else 0 end,
      profit_margin = computed_profit
  where id = p_sale_id
  returning * into sale_row;

  return sale_row;
end;
$$;

-- ============================================================
-- 11. REFUND RPC
-- - sale menjadi refunded
-- - inventory kembali tersedia
-- - payout pending terkait dibatalkan dengan delete
-- ============================================================
create or replace function public.refund_sale(p_sale_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale_row public.sales_transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'User belum terautentikasi';
  end if;

  select * into sale_row
  from public.sales_transactions
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;

  if sale_row.status = 'refunded' then
    return true;
  end if;

  update public.sales_transactions
  set status = 'refunded'
  where id = p_sale_id;

  update public.inventory
  set status = 'tersedia'
  where id = sale_row.inventory_id;

  delete from public.consignment_payouts
  where inventory_id = sale_row.inventory_id
    and status = 'pending';

  return true;
end;
$$;

-- ============================================================
-- 12. RLS
-- ============================================================
alter table public.users_profile enable row level security;
alter table public.inventory enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.consignment_payouts enable row level security;

-- PROFILE
drop policy if exists "profile_select_authenticated" on public.users_profile;
drop policy if exists "profile_insert_own" on public.users_profile;
drop policy if exists "profile_update_own" on public.users_profile;

create policy "profile_select_authenticated"
on public.users_profile for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'owner');

create policy "profile_insert_own"
on public.users_profile for insert
to authenticated
with check (id = auth.uid());

create policy "profile_update_own"
on public.users_profile for update
to authenticated
using (id = auth.uid() or public.current_user_role() = 'owner')
with check (id = auth.uid() or public.current_user_role() = 'owner');

-- INVENTORY
drop policy if exists "inventory_select_authenticated" on public.inventory;
drop policy if exists "inventory_insert_authenticated" on public.inventory;
drop policy if exists "inventory_update_authenticated" on public.inventory;
drop policy if exists "inventory_delete_authenticated" on public.inventory;

create policy "inventory_select_authenticated"
on public.inventory for select
to authenticated using (true);

create policy "inventory_insert_authenticated"
on public.inventory for insert
to authenticated with check (true);

create policy "inventory_update_authenticated"
on public.inventory for update
to authenticated using (true) with check (true);

create policy "inventory_delete_authenticated"
on public.inventory for delete
to authenticated using (true);

-- SALES
drop policy if exists "sales_select_authenticated" on public.sales_transactions;
drop policy if exists "sales_insert_authenticated" on public.sales_transactions;
drop policy if exists "sales_update_authenticated" on public.sales_transactions;
drop policy if exists "sales_delete_refunded_authenticated" on public.sales_transactions;

create policy "sales_select_authenticated"
on public.sales_transactions for select
to authenticated using (true);

create policy "sales_insert_authenticated"
on public.sales_transactions for insert
to authenticated with check (true);

create policy "sales_update_authenticated"
on public.sales_transactions for update
to authenticated using (true) with check (true);

create policy "sales_delete_refunded_authenticated"
on public.sales_transactions for delete
to authenticated using (status = 'refunded');

-- PAYOUTS
drop policy if exists "payout_select_authenticated" on public.consignment_payouts;
drop policy if exists "payout_insert_authenticated" on public.consignment_payouts;
drop policy if exists "payout_update_authenticated" on public.consignment_payouts;

create policy "payout_select_authenticated"
on public.consignment_payouts for select
to authenticated using (true);

create policy "payout_insert_authenticated"
on public.consignment_payouts for insert
to authenticated with check (true);

create policy "payout_update_authenticated"
on public.consignment_payouts for update
to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-photos',
  'inventory-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inventory_photos_select_authenticated" on storage.objects;
drop policy if exists "inventory_photos_insert_authenticated" on storage.objects;
drop policy if exists "inventory_photos_update_authenticated" on storage.objects;
drop policy if exists "inventory_photos_delete_authenticated" on storage.objects;

create policy "inventory_photos_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'inventory-photos');

create policy "inventory_photos_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'inventory-photos');

create policy "inventory_photos_update_authenticated"
on storage.objects for update to authenticated
using (bucket_id = 'inventory-photos')
with check (bucket_id = 'inventory-photos');

create policy "inventory_photos_delete_authenticated"
on storage.objects for delete to authenticated
using (bucket_id = 'inventory-photos');

-- ============================================================
-- 13. GRANTS UNTUK RPC
-- ============================================================
grant execute on function public.process_sale(uuid, timestamptz, text, numeric, numeric, numeric, public.sale_status)
to authenticated;

grant execute on function public.refund_sale(uuid)
to authenticated;

grant execute on function public.update_sale(uuid, timestamptz, text, numeric, numeric, numeric)
to authenticated;

grant execute on function public.current_user_role()
to authenticated;

-- ============================================================
-- ERD RINGKAS
-- ============================================================
-- auth.users
--     1
--     |
--     | 1
--     v
-- users_profile
--
-- inventory 1 --------< sales_transactions
--     |
--     |
--     +------------< consignment_payouts
--
-- inventory.id -> sales_transactions.inventory_id
-- inventory.id -> consignment_payouts.inventory_id
-- users_profile.id -> auth.users.id

notify pgrst, 'reload schema';
