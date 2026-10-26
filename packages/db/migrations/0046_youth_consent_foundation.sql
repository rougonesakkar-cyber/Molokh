alter table platform.domain_events
  drop constraint domain_events_actor_type_check,
  add constraint domain_events_actor_type_check
    check (actor_type in ('USER', 'SYSTEM', 'PROVIDER', 'EXTERNAL'));

alter table platform.audit_events
  drop constraint audit_events_actor_type_check,
  add constraint audit_events_actor_type_check
    check (actor_type in ('USER', 'SYSTEM', 'PROVIDER', 'EXTERNAL'));

create table platform.feature_flags (
  feature_key text primary key,
  enabled boolean not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  updated_by uuid references identity.users(user_id),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

insert into platform.feature_flags (feature_key, enabled, reason, version)
values (
  'YOUTH_OFFICIAL', false,
  'Disabled until pilot legal wording and guardian-contact delivery are approved',
  1
);

create schema if not exists governance;

create table governance.youth_challenge_consents (
  consent_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  athlete_user_id uuid not null references identity.users(user_id),
  policy_version text not null,
  state text not null check (state in ('PENDING', 'GRANTED', 'DECLINED', 'REVOKED', 'EXPIRED')),
  channel text not null check (channel in ('EMAIL', 'SMS')),
  contact_hash text not null check (contact_hash ~ '^[0-9a-f]{64}$'),
  masked_contact text not null check (length(btrim(masked_contact)) between 3 and 160),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  guardian_display_name text check (
    guardian_display_name is null or length(btrim(guardian_display_name)) between 2 and 120
  ),
  relationship text check (relationship is null or length(btrim(relationship)) between 2 and 80),
  consent_audit_hash text check (
    consent_audit_hash is null or consent_audit_hash ~ '^[0-9a-f]{64}$'
  ),
  request_event_id uuid not null,
  decision_event_id uuid,
  revocation_event_id uuid,
  requested_at timestamptz not null,
  decided_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint youth_consent_challenge_athlete_policy_uq
    unique (challenge_id, athlete_user_id, policy_version),
  constraint youth_consent_deadline_check check (expires_at > requested_at),
  constraint youth_consent_state_shape_check check (
    (state = 'PENDING' and guardian_display_name is null and relationship is null
      and consent_audit_hash is null and decision_event_id is null and decided_at is null
      and revocation_event_id is null and revoked_at is null)
    or (state = 'GRANTED' and guardian_display_name is not null and relationship is not null
      and consent_audit_hash is not null and decision_event_id is not null and decided_at is not null
      and revocation_event_id is null and revoked_at is null)
    or (state = 'DECLINED' and decision_event_id is not null and decided_at is not null
      and revocation_event_id is null and revoked_at is null)
    or (state = 'REVOKED' and guardian_display_name is not null and relationship is not null
      and consent_audit_hash is not null and decision_event_id is not null and decided_at is not null
      and revocation_event_id is not null and revoked_at is not null)
    or state = 'EXPIRED'
  )
);

create index youth_consent_challenge_state_idx
  on governance.youth_challenge_consents (challenge_id, state, athlete_user_id);

create index youth_consent_subject_history_idx
  on governance.youth_challenge_consents (athlete_user_id, requested_at desc, consent_id);

create trigger youth_challenge_consents_reject_delete
before delete on governance.youth_challenge_consents
for each row execute function platform.reject_event_mutation();
