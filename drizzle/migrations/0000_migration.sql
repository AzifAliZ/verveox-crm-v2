
-- ===== Enums =====
create type public.app_role as enum ('super_admin','manager','employee');
create type public.lead_stage as enum ('new','contacted','interested','qualified','application_started','enrolled','not_responding','not_interested','not_eligible','lost');
create type public.lead_temperature as enum ('hot','warm','cold');
create type public.lead_priority as enum ('urgent','high','medium','low');
create type public.followup_status as enum ('pending','completed','cancelled');
create type public.followup_type as enum ('call','email','whatsapp','meeting','other');

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ===== Teams / profiles / roles =====
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  team_id uuid references public.teams(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_admin(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_uid,'super_admin') and exists(select 1 from public.profiles where id=_uid and is_active)
$$;
create or replace function public.is_manager(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_uid,'manager') and exists(select 1 from public.profiles where id=_uid and is_active)
$$;
create or replace function public.is_active_user(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=_uid and is_active)
$$;
create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid()
$$;
create or replace function public.same_team(_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _other is not null and exists(
    select 1 from public.profiles a join public.profiles b on a.team_id = b.team_id
    where a.id = auth.uid() and b.id = _other and a.team_id is not null)
$$;

-- First signup becomes super_admin, everyone else employee
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role='super_admin') then
    insert into public.user_roles(user_id, role) values (new.id,'super_admin');
  else
    insert into public.user_roles(user_id, role) values (new.id,'employee');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Reference data =====
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 150),
  kind text not null default 'course' check (kind in ('course','internship','training')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.lead_sources(key,label) values
 ('facebook','Facebook Ads'),('instagram','Instagram Ads'),('website','Website Form'),
 ('whatsapp','WhatsApp'),('referral','Referral'),('manual','Manual Entry'),('import','Import'),('other','Other');

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 50),
  color text not null default 'blue' check (color in ('red','blue','green','amber','gray','violet')),
  created_at timestamptz not null default now()
);

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Verveox Technologies',
  hot_threshold int not null default 70 check (hot_threshold between 1 and 100),
  warm_threshold int not null default 35 check (warm_threshold between 0 and 99),
  retention_days int check (retention_days is null or retention_days >= 30),
  updated_at timestamptz not null default now(),
  check (warm_threshold < hot_threshold)
);
insert into public.app_settings(id) values (1);

create table public.scoring_rules (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  points int not null check (points between -100 and 100),
  is_active boolean not null default true,
  sort_order int not null default 0
);
insert into public.scoring_rules(key,label,points,sort_order) values
 ('strong_intent','Strong expressed joining intent',25,1),
 ('join_7_days','Joining within seven days',20,2),
 ('eligible','Meets eligibility criteria',15,3),
 ('responded','Responded to follow-up',15,4),
 ('requested_fees','Requested course or fee details',10,5),
 ('requested_callback','Requested counselling or callback',10,6),
 ('repeated_nonresponse','Repeated documented nonresponse',-10,7);

-- ===== Campaign hierarchy =====
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  external_campaign_id text,
  name text not null check (char_length(name) between 1 and 200),
  source_platform text not null default 'facebook',
  objective text,
  status text not null default 'active' check (status in ('active','paused','archived','completed')),
  start_date date, end_date date,
  budget numeric(14,2) check (budget is null or budget >= 0),
  spend numeric(14,2) check (spend is null or spend >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index campaigns_ext_uq on public.campaigns(source_platform, external_campaign_id) where external_campaign_id is not null;
create trigger campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();

create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  external_ad_set_id text unique,
  name text not null default '',
  status text
);
create table public.ads (
  id uuid primary key default gen_random_uuid(),
  ad_set_id uuid references public.ad_sets(id) on delete set null,
  external_ad_id text unique,
  name text not null default '',
  status text
);
create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  external_form_id text unique,
  page_id text,
  name text not null default '',
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text,
  field_mapping jsonb not null default '{}'::jsonb
);

-- ===== Leads =====
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 150),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp_number text check (whatsapp_number is null or char_length(whatsapp_number) <= 30),
  normalized_email text generated always as (lower(trim(email))) stored,
  normalized_phone text generated always as (right(regexp_replace(coalesce(phone,''),'\D','','g'),10)) stored,
  college text, degree text, department text,
  graduation_year int check (graduation_year is null or graduation_year between 1970 and 2100),
  skills text, experience_level text,
  interest text,
  course_id uuid references public.courses(id) on delete set null,
  preferred_batch text, availability text,
  eligibility_status text not null default 'unknown' check (eligibility_status in ('unknown','eligible','not_eligible','pending_review')),
  source text not null default 'manual',
  source_details text,
  external_lead_id text,
  meta_lead_id text, meta_page_id text, meta_form_id text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  ad_set_id uuid references public.ad_sets(id) on delete set null,
  ad_id uuid references public.ads(id) on delete set null,
  campaign_name_snapshot text,
  utm_source text, utm_medium text, utm_campaign text, landing_page text,
  stage public.lead_stage not null default 'new',
  temperature public.lead_temperature not null default 'cold',
  score int not null default 0 check (score between 0 and 100),
  score_reason text,
  classification_mode text not null default 'auto' check (classification_mode in ('auto','manual')),
  manual_temperature_override public.lead_temperature,
  priority public.lead_priority not null default 'medium',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  marketing_opt_out boolean not null default false,
  preferred_channel text check (preferred_channel is null or preferred_channel in ('call','email','whatsapp','sms')),
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  conversion_at timestamptz,
  lost_reason text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index leads_meta_lead_uq on public.leads(meta_lead_id) where meta_lead_id is not null;
create index leads_created_idx on public.leads(created_at desc);
create index leads_assigned_idx on public.leads(assigned_to);
create index leads_stage_idx on public.leads(stage);
create index leads_temp_idx on public.leads(temperature);
create index leads_campaign_idx on public.leads(campaign_id);
create index leads_course_idx on public.leads(course_id);
create index leads_source_idx on public.leads(source);
create index leads_nemail_idx on public.leads(normalized_email);
create index leads_nphone_idx on public.leads(normalized_phone);
create index leads_next_fu_idx on public.leads(next_followup_at);
create trigger leads_updated before update on public.leads for each row execute function public.set_updated_at();

create table public.lead_shares (
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, user_id)
);

-- Access helper: can the current user see this lead?
create or replace function public.can_access_lead(_lead_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user(auth.uid()) and exists (
    select 1 from public.leads l where l.id = _lead_id and (
      public.is_admin(auth.uid())
      or l.assigned_to = auth.uid()
      or l.created_by = auth.uid()
      or exists(select 1 from public.lead_shares s where s.lead_id = l.id and s.user_id = auth.uid())
      or (public.is_manager(auth.uid()) and (l.assigned_to is null or public.same_team(l.assigned_to)))
    ))
$$;

create table public.lead_tags (
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (lead_id, tag_id)
);

create table public.lead_signals (
  lead_id uuid not null references public.leads(id) on delete cascade,
  rule_key text not null references public.scoring_rules(key) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (lead_id, rule_key)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  activity_type text not null check (activity_type in ('note','call','email','whatsapp','meeting','stage_change','score_change','assignment','system','import')),
  subject text, description text, outcome text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index activities_lead_idx on public.activities(lead_id, occurred_at desc);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  followup_type public.followup_type not null default 'call',
  due_at timestamptz not null,
  remind_at timestamptz,
  reminder_sent_at timestamptz,
  status public.followup_status not null default 'pending',
  completed_at timestamptz, outcome text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index followups_due_idx on public.followups(status, due_at);
create index followups_assigned_idx on public.followups(assigned_to);
create index followups_lead_idx on public.followups(lead_id);
create trigger followups_updated before update on public.followups for each row execute function public.set_updated_at();

create table public.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  old_stage public.lead_stage, new_stage public.lead_stage not null,
  changed_by uuid, reason text,
  changed_at timestamptz not null default now()
);
create index lsh_lead_idx on public.lead_stage_history(lead_id, changed_at desc);

create table public.lead_score_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  old_score int, new_score int,
  old_temperature public.lead_temperature, new_temperature public.lead_temperature,
  reason text, source text not null default 'auto',
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index lsch_lead_idx on public.lead_score_history(lead_id, created_at desc);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  purpose text not null check (purpose in ('marketing','whatsapp','email','calls','data_processing')),
  consent_status text not null check (consent_status in ('granted','withdrawn','denied')),
  consent_source text, consent_text_version text,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload jsonb,
  status text not null default 'received' check (status in ('received','processing','processed','failed','duplicate','permanent_failure')),
  attempts int not null default 0,
  last_error text,
  lead_id uuid references public.leads(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  file_name text,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  duplicate_mode text not null default 'skip' check (duplicate_mode in ('skip','update','import_new')),
  total_rows int not null default 0, imported_rows int not null default 0,
  updated_rows int not null default 0,
  skipped_rows int not null default 0, failed_rows int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  error_report_path text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  filters jsonb not null default '{}'::jsonb,
  selected_columns text[] not null default '{}',
  format text not null default 'csv',
  row_count int,
  status text not null default 'completed',
  file_path text, expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changes jsonb, metadata jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit_logs(created_at desc);
create index audit_entity_idx on public.audit_logs(entity_type, entity_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, body text, link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notif_user_idx on public.notifications(user_id, created_at desc);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ===== Business-logic triggers =====
create or replace function public.temp_for_score(_s int) returns public.lead_temperature
language sql stable security definer set search_path = public as $$
  select case when _s >= s.hot_threshold then 'hot'::public.lead_temperature
              when _s >= s.warm_threshold then 'warm'::public.lead_temperature
              else 'cold'::public.lead_temperature end
  from public.app_settings s where s.id = 1
$$;

-- Lead BEFORE trigger: guards, temperature resolution, conversion timestamp
create or replace function public.leads_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.score := 0;
    new.score_reason := null;
  else
    -- score is only changed by recalc function (which sets a session flag)
    if new.score is distinct from old.score and coalesce(current_setting('verveox.recalc', true),'') <> '1' then
      new.score := old.score;
    end if;
    -- non-admin/manager cannot reassign
    if new.assigned_to is distinct from old.assigned_to and auth.uid() is not null
       and not (public.is_admin(auth.uid()) or public.is_manager(auth.uid())) then
      raise exception 'Only managers and admins can reassign leads';
    end if;
  end if;
  if new.manual_temperature_override is not null then
    new.classification_mode := 'manual';
    new.temperature := new.manual_temperature_override;
  else
    new.classification_mode := 'auto';
    new.temperature := public.temp_for_score(new.score);
  end if;
  if new.stage = 'enrolled' and new.conversion_at is null then new.conversion_at := now(); end if;
  if new.stage <> 'enrolled' then new.conversion_at := null; end if;
  return new;
end $$;
create trigger leads_bw before insert or update on public.leads for each row execute function public.leads_before_write();

create or replace function public.leads_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare diff jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'INSERT' then
    insert into public.lead_stage_history(lead_id, old_stage, new_stage, changed_by, reason) values (new.id, null, new.stage, auth.uid(), 'created');
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, changes)
      values (auth.uid(), 'create', 'lead', new.id, jsonb_build_object('full_name', new.full_name, 'source', new.source));
    if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
      insert into public.notifications(user_id, title, body, link) values (new.assigned_to, 'New lead assigned', new.full_name, '/leads/' || new.id);
    end if;
    return new;
  end if;
  if new.stage is distinct from old.stage then
    insert into public.lead_stage_history(lead_id, old_stage, new_stage, changed_by) values (new.id, old.stage, new.stage, auth.uid());
  end if;
  if new.temperature is distinct from old.temperature or new.score is distinct from old.score then
    insert into public.lead_score_history(lead_id, old_score, new_score, old_temperature, new_temperature, reason, source, changed_by)
    values (new.id, old.score, new.score, old.temperature, new.temperature,
      case when new.classification_mode='manual' then 'Manual temperature override' else new.score_reason end,
      case when new.classification_mode='manual' and new.manual_temperature_override is distinct from old.manual_temperature_override then 'manual' else 'auto' end,
      auth.uid());
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    insert into public.notifications(user_id, title, body, link) values (new.assigned_to, 'Lead assigned to you', new.full_name, '/leads/' || new.id);
  end if;
  for k in select jsonb_object_keys(to_jsonb(new)) loop
    if k not in ('updated_at','normalized_email','normalized_phone') and (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('old', to_jsonb(old)->k, 'new', to_jsonb(new)->k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, changes)
    values (auth.uid(), case when new.archived_at is not null and old.archived_at is null then 'archive'
                             when new.archived_at is null and old.archived_at is not null then 'restore' else 'update' end,
            'lead', new.id, diff);
  end if;
  return new;
end $$;
create trigger leads_aw after insert or update on public.leads for each row execute function public.leads_after_write();

create or replace function public.leads_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), 'delete', 'lead', old.id, jsonb_build_object('full_name', old.full_name));
  return old;
end $$;
create trigger leads_ad after delete on public.leads for each row execute function public.leads_after_delete();

-- Score recalculation from signals
create or replace function public.recalc_lead_score(_lead_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s int; r text;
begin
  select coalesce(sum(sr.points),0), string_agg(sr.label || ' (' || case when sr.points>0 then '+' else '' end || sr.points || ')', ', ' order by sr.sort_order)
    into s, r
  from public.lead_signals ls join public.scoring_rules sr on sr.key = ls.rule_key and sr.is_active
  where ls.lead_id = _lead_id;
  s := greatest(0, least(100, s));
  perform set_config('verveox.recalc','1', true);
  update public.leads set score = s, score_reason = coalesce(r,'No signals recorded') where id = _lead_id;
  perform set_config('verveox.recalc','0', true);
end $$;

create or replace function public.lead_signals_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_lead_score(coalesce(new.lead_id, old.lead_id));
  return null;
end $$;
create trigger lead_signals_recalc after insert or delete on public.lead_signals for each row execute function public.lead_signals_changed();

-- Recalc all when rules or thresholds change (admin only tables)
create or replace function public.recalc_all_scores() returns trigger
language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  for l in select id from public.leads loop perform public.recalc_lead_score(l); end loop;
  return null;
end $$;
create trigger scoring_rules_recalc after insert or update or delete on public.scoring_rules for each statement execute function public.recalc_all_scores();
create trigger settings_recalc after update of hot_threshold, warm_threshold on public.app_settings for each statement execute function public.recalc_all_scores();

-- Follow-up sync to lead.next_followup_at
create or replace function public.sync_next_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare lid uuid := coalesce(new.lead_id, old.lead_id);
begin
  update public.leads set next_followup_at = (
    select min(due_at) from public.followups where lead_id = lid and status = 'pending')
  where id = lid;
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status <> 'completed' then
    update public.leads set last_contacted_at = coalesce(new.completed_at, now()) where id = lid;
    insert into public.activities(lead_id, actor_id, activity_type, subject, description, outcome)
    values (lid, auth.uid(), case when new.followup_type::text in ('call','email','whatsapp','meeting') then new.followup_type::text else 'system' end,
            'Follow-up completed: ' || new.title, new.description, new.outcome);
  end if;
  if (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    insert into public.notifications(user_id, title, body, link) values (new.assigned_to, 'Follow-up assigned', new.title, '/leads/' || lid);
  end if;
  return null;
end $$;
create trigger followups_sync after insert or update or delete on public.followups for each row execute function public.sync_next_followup();

-- Contact activity updates last_contacted_at
create or replace function public.activity_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.activity_type in ('call','email','whatsapp','meeting') then
    update public.leads set last_contacted_at = greatest(coalesce(last_contacted_at, new.occurred_at), new.occurred_at) where id = new.lead_id;
  end if;
  return null;
end $$;
create trigger activities_contact after insert on public.activities for each row execute function public.activity_contact();

-- Consent: withdrawn marketing => opt out
create or replace function public.consent_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.purpose = 'marketing' then
    update public.leads set marketing_opt_out = (new.consent_status <> 'granted') where id = new.lead_id;
  end if;
  return null;
end $$;
create trigger consent_after after insert on public.consent_records for each row execute function public.consent_sync();

-- Role change audit + self-escalation guard
create or replace function public.audit_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, changes)
  values (auth.uid(), lower(tg_op), 'user_role', coalesce(new.user_id, old.user_id),
          jsonb_build_object('role', coalesce(new.role, old.role)));
  return null;
end $$;
create trigger user_roles_audit after insert or update or delete on public.user_roles for each row execute function public.audit_roles();

-- Profiles: non-admins can only change their own full_name
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    if new.is_active is distinct from old.is_active or new.team_id is distinct from old.team_id or new.email is distinct from old.email then
      raise exception 'Not permitted';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_t before update on public.profiles for each row execute function public.profiles_guard();

-- ===== Dashboard RPC (SECURITY INVOKER => RLS applies) =====
create or replace function public.dashboard_metrics(
  _from timestamptz, _to timestamptz,
  _campaign uuid default null, _source text default null, _course uuid default null, _owner uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
with f as (
  select * from public.leads l
  where l.archived_at is null
    and l.created_at >= _from and l.created_at < _to
    and (_campaign is null or l.campaign_id = _campaign)
    and (_source is null or l.source = _source)
    and (_course is null or l.course_id = _course)
    and (_owner is null or l.assigned_to = _owner)
), allv as (select * from public.leads where archived_at is null)
select jsonb_build_object(
  'total', (select count(*) from f),
  'total_all', (select count(*) from allv),
  'today', (select count(*) from allv where created_at >= date_trunc('day', now())),
  'week', (select count(*) from allv where created_at >= date_trunc('week', now())),
  'month', (select count(*) from allv where created_at >= date_trunc('month', now())),
  'hot', (select count(*) from f where temperature='hot'),
  'warm', (select count(*) from f where temperature='warm'),
  'cold', (select count(*) from f where temperature='cold'),
  'contacted', (select count(*) from f where last_contacted_at is not null or stage <> 'new'),
  'qualified', (select count(*) from f where stage in ('qualified','application_started','enrolled')),
  'converted', (select count(*) from f where stage='enrolled'),
  'fu_today', (select count(*) from public.followups fu where fu.status='pending' and fu.due_at >= date_trunc('day', now()) and fu.due_at < date_trunc('day', now()) + interval '1 day'),
  'fu_overdue', (select count(*) from public.followups fu where fu.status='pending' and fu.due_at < now()),
  'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d) from (select date_trunc('day', created_at)::date d, count(*) c from f group by 1) x), '[]'),
  'by_source', coalesce((select jsonb_agg(jsonb_build_object('name', source, 'count', c) order by c desc) from (select source, count(*) c from f group by 1) x), '[]'),
  'by_stage', coalesce((select jsonb_agg(jsonb_build_object('name', stage, 'count', c)) from (select stage, count(*) c from f group by 1) x), '[]'),
  'by_course', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(c2.name, 'Unspecified'), 'count', c) order by c desc) from (select course_id, count(*) c from f group by 1) x left join public.courses c2 on c2.id = x.course_id), '[]'),
  'by_campaign', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(cp.name, 'No campaign'), 'count', c) order by c desc) from (select campaign_id, count(*) c from f group by 1) x left join public.campaigns cp on cp.id = x.campaign_id), '[]'),
  'by_owner', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.full_name, 'Unassigned'), 'count', c, 'converted', cv) order by c desc) from (select assigned_to, count(*) c, count(*) filter (where stage='enrolled') cv from f group by 1) x left join public.profiles p on p.id = x.assigned_to), '[]')
)
$$;

-- ===== GRANTS =====
grant select, insert, update, delete on public.teams, public.profiles, public.courses, public.lead_sources, public.tags,
  public.app_settings, public.scoring_rules, public.campaigns, public.ad_sets, public.ads, public.lead_forms,
  public.leads, public.lead_shares, public.lead_tags, public.lead_signals, public.activities, public.followups,
  public.consent_records, public.import_jobs, public.export_jobs, public.notifications, public.saved_views to authenticated;
grant select on public.user_roles, public.lead_stage_history, public.lead_score_history, public.audit_logs, public.integration_events to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on function public.recalc_lead_score(uuid) from public, anon, authenticated;

-- ===== RLS =====
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.courses enable row level security;
alter table public.lead_sources enable row level security;
alter table public.tags enable row level security;
alter table public.app_settings enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.campaigns enable row level security;
alter table public.ad_sets enable row level security;
alter table public.ads enable row level security;
alter table public.lead_forms enable row level security;
alter table public.leads enable row level security;
alter table public.lead_shares enable row level security;
alter table public.lead_tags enable row level security;
alter table public.lead_signals enable row level security;
alter table public.activities enable row level security;
alter table public.followups enable row level security;
alter table public.lead_stage_history enable row level security;
alter table public.lead_score_history enable row level security;
alter table public.consent_records enable row level security;
alter table public.integration_events enable row level security;
alter table public.import_jobs enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.saved_views enable row level security;

-- read-for-active-users, write-for-admin reference tables
create policy "active read" on public.teams for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin write" on public.teams for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "active read" on public.courses for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin write" on public.courses for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "active read" on public.lead_sources for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin write" on public.lead_sources for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "active read" on public.tags for select to authenticated using (public.is_active_user(auth.uid()));
create policy "mgr write" on public.tags for all to authenticated using (public.is_admin(auth.uid()) or public.is_manager(auth.uid())) with check (public.is_admin(auth.uid()) or public.is_manager(auth.uid()));
create policy "active read" on public.app_settings for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin update" on public.app_settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "active read" on public.scoring_rules for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin write" on public.scoring_rules for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "active read" on public.campaigns for select to authenticated using (public.is_active_user(auth.uid()));
create policy "mgr write" on public.campaigns for all to authenticated using (public.is_admin(auth.uid()) or public.is_manager(auth.uid())) with check (public.is_admin(auth.uid()) or public.is_manager(auth.uid()));
create policy "active read" on public.ad_sets for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin write" on public.ad_sets for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "active read" on public.ads for select to authenticated using (public.is_active_user(auth.uid()));
create policy "admin write" on public.ads for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "admin all" on public.lead_forms for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- profiles
create policy "read profiles" on public.profiles for select to authenticated using (public.is_active_user(auth.uid()) or id = auth.uid());
create policy "update self" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin(auth.uid())) with check (id = auth.uid() or public.is_admin(auth.uid()));

-- roles: read own or admin; no client writes (server fn with admin)
create policy "read roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager(auth.uid()));

-- leads
create policy "read leads" on public.leads for select to authenticated using (public.can_access_lead(id));
create policy "insert leads" on public.leads for insert to authenticated with check (
  public.is_active_user(auth.uid()) and (
    public.is_admin(auth.uid()) or public.is_manager(auth.uid())
    or assigned_to is null or assigned_to = auth.uid()));
create policy "update leads" on public.leads for update to authenticated using (public.can_access_lead(id)) with check (
  public.is_admin(auth.uid()) or public.is_manager(auth.uid()) or assigned_to = auth.uid() or created_by = auth.uid()
  or exists(select 1 from public.lead_shares s where s.lead_id = id and s.user_id = auth.uid()));
create policy "delete leads" on public.leads for delete to authenticated using (public.is_admin(auth.uid()));

create policy "read shares" on public.lead_shares for select to authenticated using (public.can_access_lead(lead_id));
create policy "mgr shares" on public.lead_shares for all to authenticated using ((public.is_admin(auth.uid()) or public.is_manager(auth.uid())) and public.can_access_lead(lead_id)) with check ((public.is_admin(auth.uid()) or public.is_manager(auth.uid())) and public.can_access_lead(lead_id));

-- lead children
create policy "lead access" on public.lead_tags for all to authenticated using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));
create policy "lead access" on public.lead_signals for all to authenticated using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));
create policy "read" on public.activities for select to authenticated using (public.can_access_lead(lead_id));
create policy "insert" on public.activities for insert to authenticated with check (public.can_access_lead(lead_id) and actor_id = auth.uid());
create policy "own edit" on public.activities for update to authenticated using (actor_id = auth.uid() and activity_type = 'note') with check (actor_id = auth.uid());
create policy "own delete" on public.activities for delete to authenticated using ((actor_id = auth.uid() and activity_type='note') or public.is_admin(auth.uid()));
create policy "read" on public.followups for select to authenticated using (public.can_access_lead(lead_id) or assigned_to = auth.uid());
create policy "insert" on public.followups for insert to authenticated with check (public.can_access_lead(lead_id) and created_by = auth.uid());
create policy "update" on public.followups for update to authenticated using (public.can_access_lead(lead_id) or assigned_to = auth.uid()) with check (public.can_access_lead(lead_id) or assigned_to = auth.uid());
create policy "delete" on public.followups for delete to authenticated using (public.is_admin(auth.uid()) or public.is_manager(auth.uid()));
create policy "read" on public.lead_stage_history for select to authenticated using (public.can_access_lead(lead_id));
create policy "read" on public.lead_score_history for select to authenticated using (public.can_access_lead(lead_id));
create policy "read" on public.consent_records for select to authenticated using (public.can_access_lead(lead_id));
create policy "insert" on public.consent_records for insert to authenticated with check (public.can_access_lead(lead_id) and recorded_by = auth.uid());

-- admin/system
create policy "admin read" on public.integration_events for select to authenticated using (public.is_admin(auth.uid()));
create policy "admin read" on public.audit_logs for select to authenticated using (public.is_admin(auth.uid()));
create policy "own or admin" on public.import_jobs for select to authenticated using (requested_by = auth.uid() or public.is_admin(auth.uid()));
create policy "insert own" on public.import_jobs for insert to authenticated with check (requested_by = auth.uid() and (public.is_admin(auth.uid()) or public.is_manager(auth.uid())));
create policy "update own" on public.import_jobs for update to authenticated using (requested_by = auth.uid()) with check (requested_by = auth.uid());
create policy "own or admin" on public.export_jobs for select to authenticated using (requested_by = auth.uid() or public.is_admin(auth.uid()));
create policy "insert own" on public.export_jobs for insert to authenticated with check (requested_by = auth.uid() and public.is_active_user(auth.uid()));
create policy "own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.saved_views for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- export audit
create or replace function public.export_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'export', 'export_job', new.id, jsonb_build_object('rows', new.row_count, 'columns', new.selected_columns, 'filters', new.filters));
  return null;
end $$;
create trigger export_jobs_audit after insert on public.export_jobs for each row execute function public.export_audit();
