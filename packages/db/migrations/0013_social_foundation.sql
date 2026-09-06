create schema if not exists social;

create table social.likes (
  like_id uuid primary key,
  from_user_id uuid not null references identity.users(user_id),
  to_user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('ACTIVE', 'MATCHED', 'EXPIRED', 'WITHDRAWN', 'REMOVED_BY_SKIP')),
  source text not null check (source = 'DISCOVERY'),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  version bigint not null check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint likes_distinct_users_check check (from_user_id <> to_user_id),
  constraint likes_expiry_after_creation_check check (expires_at > created_at)
);

create unique index likes_one_active_directed_pair_uq
  on social.likes (from_user_id, to_user_id)
  where state = 'ACTIVE';

create index likes_active_inbound_idx
  on social.likes (to_user_id, from_user_id, expires_at)
  where state = 'ACTIVE';

create table social.matches (
  match_id uuid primary key,
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  state text not null check (state in ('ACTIVE', 'ARCHIVED', 'UNMATCHED', 'BLOCKED')),
  chat_id uuid not null,
  last_activity_at timestamptz not null,
  unmatched_by uuid references identity.users(user_id),
  unmatched_at timestamptz,
  rediscovery_after timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint matches_normalized_pair_check check (pair_low_id < pair_high_id)
);

create unique index matches_one_live_pair_uq
  on social.matches (pair_low_id, pair_high_id)
  where state in ('ACTIVE', 'ARCHIVED');

create table social.blocks (
  block_id uuid primary key,
  blocker_user_id uuid not null references identity.users(user_id),
  blocked_user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('ACTIVE', 'REVOKED')),
  reason_code text,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  revoked_at timestamptz,
  constraint blocks_distinct_users_check check (blocker_user_id <> blocked_user_id)
);

create unique index blocks_one_active_directed_pair_uq
  on social.blocks (blocker_user_id, blocked_user_id)
  where state = 'ACTIVE';

create index blocks_active_pair_lookup_idx
  on social.blocks (blocked_user_id, blocker_user_id)
  where state = 'ACTIVE';

create table social.discovery_pair_suppressions (
  suppression_id uuid primary key,
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  reason text not null check (reason in ('SKIP', 'UNMATCH')),
  state text not null check (state in ('ACTIVE', 'EXPIRED')),
  started_at timestamptz not null,
  until_at timestamptz not null,
  version bigint not null check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint discovery_suppressions_normalized_pair_check check (pair_low_id < pair_high_id),
  constraint discovery_suppressions_expiry_check check (until_at > started_at)
);

create unique index discovery_suppressions_one_active_pair_uq
  on social.discovery_pair_suppressions (pair_low_id, pair_high_id)
  where state = 'ACTIVE';

create index discovery_suppressions_active_expiry_idx
  on social.discovery_pair_suppressions (until_at)
  where state = 'ACTIVE';
