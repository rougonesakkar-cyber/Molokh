create table identity.auth_otp_challenges (
  challenge_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  transport text not null check (transport in ('LOCAL_DEVELOPMENT', 'SMS_OPT_IN')),
  state text not null check (state in ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED')),
  code_verifier_hash text not null check (code_verifier_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  max_attempts integer not null default 5 check (max_attempts = 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version bigint not null check (version > 0),
  check (expires_at = created_at + interval '10 minutes'),
  check (
    (state = 'PENDING' and verified_at is null and attempts < max_attempts)
    or (state = 'VERIFIED' and verified_at is not null and verified_at < expires_at)
    or (state in ('EXPIRED', 'LOCKED') and verified_at is null)
  )
);

create unique index auth_otp_one_pending_per_user_uq
  on identity.auth_otp_challenges (user_id)
  where state = 'PENDING';
create index auth_otp_expiry_idx
  on identity.auth_otp_challenges (expires_at, challenge_id)
  where state = 'PENDING';

create table identity.auth_session_families (
  family_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  trusted_session_id uuid not null unique
    references identity.trusted_sessions(trusted_session_id),
  state text not null check (state in ('ACTIVE', 'REVOKED')),
  device_label text check (device_label is null or length(btrim(device_label)) between 1 and 120),
  created_at timestamptz not null,
  last_rotated_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text check (
    revoke_reason is null or length(btrim(revoke_reason)) between 3 and 120
  ),
  policy_version text not null,
  version bigint not null check (version > 0),
  updated_at timestamptz not null,
  check (
    (state = 'ACTIVE' and revoked_at is null and revoke_reason is null)
    or (state = 'REVOKED' and revoked_at is not null and revoke_reason is not null)
  )
);

create index auth_session_user_state_idx
  on identity.auth_session_families (user_id, state, last_rotated_at desc);

create table identity.auth_refresh_tokens (
  refresh_token_id uuid primary key,
  family_id uuid not null references identity.auth_session_families(family_id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  generation integer not null check (generation > 0),
  state text not null check (state in ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  replaced_by_token_id uuid references identity.auth_refresh_tokens(refresh_token_id),
  unique (family_id, generation),
  check (expires_at = issued_at + interval '30 days'),
  check (
    (state = 'ACTIVE' and used_at is null and replaced_by_token_id is null)
    or (state = 'ROTATED' and used_at is not null and replaced_by_token_id is not null)
    or (state in ('REVOKED', 'EXPIRED') and replaced_by_token_id is null)
  )
);

create unique index auth_refresh_one_active_per_family_uq
  on identity.auth_refresh_tokens (family_id)
  where state = 'ACTIVE';

create table identity.auth_access_tokens (
  access_token_id uuid primary key,
  family_id uuid not null references identity.auth_session_families(family_id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  generation integer not null check (generation > 0),
  state text not null check (state in ('ACTIVE', 'REVOKED', 'EXPIRED')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (family_id, generation),
  check (expires_at = issued_at + interval '15 minutes'),
  check (
    (state = 'ACTIVE' and revoked_at is null)
    or (state = 'REVOKED' and revoked_at is not null)
    or state = 'EXPIRED'
  )
);

create unique index auth_access_one_active_per_family_uq
  on identity.auth_access_tokens (family_id)
  where state = 'ACTIVE';
create index auth_access_expiry_idx
  on identity.auth_access_tokens (expires_at, access_token_id)
  where state = 'ACTIVE';

create trigger auth_session_families_reject_delete
before delete on identity.auth_session_families
for each row execute function platform.reject_event_mutation();
