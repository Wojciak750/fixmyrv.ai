-- Adjuster paperwork: business profile, uploaded landlord forms, drafts and downloaded versions.
-- Apply as ONE migration exactly as written. No values are seeded; every profile value starts empty.
-- The private storage bucket 'qa-paperwork' is created separately with Lovable's storage tool
-- (the migration tool refuses inserts into storage.buckets). Do not add any storage policies for it.
--
-- Security model: row level security is ON for every table below with NO policies, and all table
-- privileges are revoked from anon and authenticated. The browser can never read these rows, not even
-- the encrypted ones. Only the qa-paperwork edge function (service role) reads and writes them,
-- after checking the caller is the dashboard admin. EIN, routing and account numbers and the signature
-- are encrypted by the edge function before they reach the database.

create table public.qa_business_profile (
  id smallint primary key default 1 check (id = 1),
  legal_name text not null default '',
  trade_name text not null default '',
  entity_type text not null default '',
  tax_classification text not null default '',
  mailing_street text not null default '',
  mailing_city text not null default '',
  mailing_state text not null default '',
  mailing_zip text not null default '',
  phone text not null default '',
  email text not null default '',
  contact_name text not null default '',
  contact_title text not null default '',
  bank_name text not null default '',
  bank_account_name text not null default '',
  bank_account_type text not null default '',
  bank_address text not null default '',
  default_notice_to_vacate text not null default '',
  ein_enc text,
  ein_last4 text check (ein_last4 is null or ein_last4 ~ '^\d{1,4}$'),
  routing_number_enc text,
  routing_number_last4 text check (routing_number_last4 is null or routing_number_last4 ~ '^\d{1,4}$'),
  account_number_enc text,
  account_number_last4 text check (account_number_last4 is null or account_number_last4 ~ '^\d{1,4}$'),
  signature_enc text,
  signature_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint qa_business_profile_enc_ck check (
    (ein_enc is null or ein_enc like 'v1.%')
    and (routing_number_enc is null or routing_number_enc like 'v1.%')
    and (account_number_enc is null or account_number_enc like 'v1.%')
    and (signature_enc is null or signature_enc like 'v1.%')
  )
);
create trigger qa_business_profile_touch before update on public.qa_business_profile
  for each row execute function public.qa_touch_updated_at();

create table public.qa_paperwork (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.qa_customers(id),
  file_name text not null,
  storage_path text not null unique,
  size_bytes int not null check (size_bytes >= 0),
  page_count int,
  status text not null check (status in ('reading', 'ready', 'manual', 'unreadable')),
  status_message text,
  title text,
  structure jsonb,
  plan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index qa_paperwork_customer_idx on public.qa_paperwork (customer_id, created_at desc);
create trigger qa_paperwork_touch before update on public.qa_paperwork
  for each row execute function public.qa_touch_updated_at();

create table public.qa_paperwork_drafts (
  paperwork_id uuid primary key references public.qa_paperwork(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  sensitive_enc text check (sensitive_enc is null or sensitive_enc like 'v1.%'),
  positions jsonb not null default '{}'::jsonb,
  extra_targets jsonb not null default '[]'::jsonb,
  preview_hash text,
  signed_at timestamptz,
  signed_date text,
  signed_hash text,
  updated_at timestamptz not null default now()
);
create trigger qa_paperwork_drafts_touch before update on public.qa_paperwork_drafts
  for each row execute function public.qa_touch_updated_at();

-- One row per download. Never edited; removed only when the whole form is deleted.
create table public.qa_paperwork_versions (
  id uuid primary key default gen_random_uuid(),
  paperwork_id uuid not null references public.qa_paperwork(id) on delete cascade,
  version_no int not null,
  values jsonb not null default '{}'::jsonb,
  sensitive_enc text check (sensitive_enc is null or sensitive_enc like 'v1.%'),
  positions jsonb not null default '{}'::jsonb,
  extra_targets jsonb not null default '[]'::jsonb,
  preview_hash text,
  signed_at timestamptz,
  signed_date text,
  signed_hash text,
  created_at timestamptz not null default now(),
  unique (paperwork_id, version_no)
);
create trigger qa_paperwork_versions_no_update before update on public.qa_paperwork_versions
  for each row execute function public.qa_block_change();

create or replace function public.qa_paperwork_add_version(p_paperwork_id uuid, p_state jsonb)
returns setof public.qa_paperwork_versions
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  perform 1 from public.qa_paperwork where id = p_paperwork_id for update;
  select coalesce(max(version_no), 0) + 1 into n from public.qa_paperwork_versions where paperwork_id = p_paperwork_id;
  return query
  insert into public.qa_paperwork_versions
    (paperwork_id, version_no, values, sensitive_enc, positions, extra_targets, preview_hash, signed_at, signed_date, signed_hash)
  values (
    p_paperwork_id, n,
    coalesce(p_state->'values', '{}'::jsonb),
    p_state->>'sensitive_enc',
    coalesce(p_state->'positions', '{}'::jsonb),
    coalesce(p_state->'extra_targets', '[]'::jsonb),
    p_state->>'preview_hash',
    (p_state->>'signed_at')::timestamptz,
    p_state->>'signed_date',
    p_state->>'signed_hash'
  )
  returning *;
end $$;

alter table public.qa_business_profile enable row level security;
alter table public.qa_paperwork enable row level security;
alter table public.qa_paperwork_drafts enable row level security;
alter table public.qa_paperwork_versions enable row level security;

revoke all on public.qa_business_profile, public.qa_paperwork, public.qa_paperwork_drafts, public.qa_paperwork_versions from anon, authenticated;
revoke all on function public.qa_paperwork_add_version(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.qa_paperwork_add_version(uuid, jsonb) to service_role;
