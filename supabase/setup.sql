-- Run once in the Supabase SQL Editor for the Dwarka contact form.
-- Anonymous visitors can submit and upload only under their own private folder.

create table if not exists public.contact_submissions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(phone) between 1 and 40),
  company text check (company is null or char_length(company) <= 160),
  plan text check (plan is null or char_length(plan) <= 60),
  message text not null check (char_length(message) between 1 and 4000),
  contact_consent boolean not null check (contact_consent),
  document_consent boolean not null default false,
  document_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(document_paths) = 'array'),
  approval_kind text not null check (approval_kind in ('drawn', 'typed')),
  approval_name text,
  approval_path text,
  approval_text text not null check (approval_text = 'I confirm this enquiry is accurate and approve the submitted information for review. This approval is not a service or investment agreement.'),
  approval_version text not null check (approval_version = 'contact-enquiry-approval-v1'),
  email_delivery_status text not null default 'pending' check (email_delivery_status in ('pending', 'sent', 'failed')),
  email_delivery_id text,
  created_at timestamptz not null default now(),
  check (
    (approval_kind = 'typed' and approval_name is not null and char_length(trim(approval_name)) between 2 and 100 and approval_path is null)
    or
    (approval_kind = 'drawn' and approval_name is null and approval_path like owner_id::text || '/' || id::text || '/approval-signature-%')
  ),
  check (jsonb_array_length(document_paths) = 0 or document_consent)
);

alter table public.contact_submissions
  add column if not exists email_delivery_status text not null default 'pending'
    check (email_delivery_status in ('pending', 'sent', 'failed')),
  add column if not exists email_delivery_id text;

-- The Edge Function uses its server-side service key to read submissions and
-- record delivery status. Keep these privileges limited to those operations.
grant select, update on table public.contact_submissions to service_role;

alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from anon, authenticated;
grant insert (
  id, owner_id, name, email, phone, company, plan, message, contact_consent,
  document_consent, document_paths, approval_kind, approval_name, approval_path,
  approval_text, approval_version
) on public.contact_submissions to authenticated;

drop policy if exists "Visitors submit only their own enquiry" on public.contact_submissions;
create policy "Visitors submit only their own enquiry"
  on public.contact_submissions
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select auth.jwt()->>'is_anonymous') = 'true'
  );

create or replace function public.validate_contact_submission_uploads()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  legal_count integer := 0;
  front_count integer := 0;
  back_count integer := 0;
  total_bytes bigint := 0;
  item_size bigint;
  item_kind text;
  item_type text;
  item_path text;
begin
  if jsonb_typeof(new.document_paths) <> 'array' or jsonb_array_length(new.document_paths) > 7 then
    raise exception 'Invalid document list.';
  end if;

  for item in select value from jsonb_array_elements(new.document_paths)
  loop
    item_kind := item->>'kind';
    item_type := item->>'contentType';
    item_path := item->>'path';
    if coalesce(item->>'sizeBytes', '') !~ '^[0-9]+$'
      or item_path is null
      or item_path not like new.owner_id::text || '/' || new.id::text || '/%' then
      raise exception 'Invalid uploaded document metadata.';
    end if;
    item_size := (item->>'sizeBytes')::bigint;
    total_bytes := total_bytes + item_size;

    if item_kind = 'legal-document'
      and item_type in ('application/pdf', 'image/jpeg', 'image/png')
      and item_size between 1 and 5242880 then
      legal_count := legal_count + 1;
    elsif item_kind = 'id-front'
      and item_type in ('image/jpeg', 'image/png')
      and item_size between 1 and 4194304 then
      front_count := front_count + 1;
    elsif item_kind = 'id-back'
      and item_type in ('image/jpeg', 'image/png')
      and item_size between 1 and 4194304 then
      back_count := back_count + 1;
    else
      raise exception 'Unsupported document type or size.';
    end if;
  end loop;

  if legal_count > 5 or front_count > 1 or back_count > 1 or front_count <> back_count or total_bytes > 14680064 then
    raise exception 'Document count, pair, or combined size is invalid.';
  end if;
  if (legal_count + front_count + back_count) > 0 and not new.document_consent then
    raise exception 'Document consent is required.';
  end if;

  if new.approval_kind = 'drawn'
    and (new.approval_path is null or new.approval_path not like new.owner_id::text || '/' || new.id::text || '/approval-signature-%') then
    raise exception 'Drawn approval signature path is invalid.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_contact_submission_uploads on public.contact_submissions;
create trigger validate_contact_submission_uploads
  before insert on public.contact_submissions
  for each row execute function public.validate_contact_submission_uploads();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-documents',
  'contact-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Visitors upload into their own enquiry folder" on storage.objects;
create policy "Visitors upload into their own enquiry folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'contact-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt()->>'is_anonymous') = 'true'
  );

-- Allows cleanup if the metadata insert fails after files were uploaded.
-- Visitors still cannot list, read, or overwrite any stored document.
drop policy if exists "Visitors clean up their own failed uploads" on storage.objects;
create policy "Visitors clean up their own failed uploads"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'contact-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt()->>'is_anonymous') = 'true'
  );
