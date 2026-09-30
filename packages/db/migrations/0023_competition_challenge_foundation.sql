create schema if not exists competition;

create table competition.competitions (
  competition_id uuid primary key,
  community_id uuid not null references community.communities(community_id),
  age_division text not null check (age_division in ('YOUTH', 'ADULT')),
  discipline_key text,
  phase text not null check (phase in ('FOUNDING_OPEN', 'CHAMPION_ESTABLISHED', 'FULLY_ESTABLISHED')),
  availability text not null check (availability in ('ACTIVE', 'PAUSED', 'CLOSED')),
  champion_user_id uuid references identity.users(user_id),
  contender_user_id uuid references identity.users(user_id),
  status_version bigint not null default 0 check (status_version >= 0),
  status_lock_result_id uuid,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint competitions_distinct_status_holders_check check (
    champion_user_id is null or contender_user_id is null or champion_user_id <> contender_user_id
  )
);

create unique index competitions_one_live_contour_uq
  on competition.competitions (community_id, age_division, coalesce(discipline_key, ''))
  where availability in ('ACTIVE', 'PAUSED');

create table competition.ruleset_snapshots (
  ruleset_snapshot_id uuid primary key,
  competition_id uuid not null references competition.competitions(competition_id),
  community_configuration_id uuid not null references community.community_configuration_versions(configuration_id),
  ruleset_ref text not null check (length(btrim(ruleset_ref)) > 0),
  ruleset_ack_mode text not null check (
    ruleset_ack_mode in ('IMPLICIT_ON_ACCEPT', 'EXPLICIT_ACK_REQUIRED')
  ),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null
);

create table competition.challenges (
  challenge_id uuid primary key,
  competition_id uuid not null references competition.competitions(competition_id),
  source_match_id uuid references social.matches(match_id),
  source_chat_id uuid not null references social.chats(chat_id),
  service_chat_id uuid not null references social.chats(chat_id),
  initiator_user_id uuid not null references identity.users(user_id),
  recipient_user_id uuid not null references identity.users(user_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  response_policy text not null check (response_policy in ('OPTIONAL', 'MANDATORY', 'MUTUAL_GENESIS')),
  stake text not null check (stake in ('NONE', 'CONTENDER', 'TITLE', 'GENESIS_CHAMPION', 'GENESIS_CONTENDER')),
  state text not null check (
    state in (
      'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
      'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL', 'COMPLETED',
      'DECLINED', 'WITHDRAWN', 'CANCELLED_NO_FAULT', 'EXPIRED_NO_FAULT'
    )
  ),
  ruleset_snapshot_id uuid not null references competition.ruleset_snapshots(ruleset_snapshot_id),
  response_deadline_at timestamptz not null,
  accepted_at timestamptz,
  scheduling_deadline_at timestamptz,
  decided_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint challenges_distinct_participants_check check (initiator_user_id <> recipient_user_id),
  constraint challenges_normalized_pair_check check (pair_low_id < pair_high_id),
  constraint challenges_pair_matches_participants_check check (
    (pair_low_id = initiator_user_id and pair_high_id = recipient_user_id)
    or (pair_low_id = recipient_user_id and pair_high_id = initiator_user_id)
  ),
  constraint challenges_acceptance_shape_check check (
    (accepted_at is null and scheduling_deadline_at is null)
    or (accepted_at is not null and scheduling_deadline_at is not null)
  )
);

create unique index challenges_one_live_pair_uq
  on competition.challenges (competition_id, pair_low_id, pair_high_id)
  where state in (
    'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED',
    'IN_SESSION', 'RESULT_PENDING', 'RESULT_RECORDED', 'UNDER_APPEAL'
  );

create index challenges_source_chat_idx
  on competition.challenges (source_chat_id, created_at desc, challenge_id);

create index challenges_response_timer_idx
  on competition.challenges (response_deadline_at, challenge_id)
  where state = 'AWAITING_RESPONSE';

create table competition.challenge_ruleset_acknowledgments (
  acknowledgment_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  user_id uuid not null references identity.users(user_id),
  ruleset_snapshot_id uuid not null references competition.ruleset_snapshots(ruleset_snapshot_id),
  mode text not null check (mode in ('IMPLICIT_ON_CREATE', 'IMPLICIT_ON_ACCEPT', 'EXPLICIT')),
  acknowledged_at timestamptz not null,
  unique (challenge_id, user_id)
);

create table competition.challenge_participant_obligations (
  obligation_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  user_id uuid not null references identity.users(user_id),
  accepted_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  constraint challenge_obligation_release_shape_check check (
    (released_at is null and release_reason is null)
    or (released_at is not null and release_reason is not null)
  ),
  unique (challenge_id, user_id)
);

create unique index challenge_one_active_obligation_per_user_uq
  on competition.challenge_participant_obligations (user_id)
  where released_at is null;

create table competition.optional_pair_quiet_periods (
  quiet_period_id uuid primary key,
  competition_id uuid not null references competition.competitions(competition_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  source_challenge_id uuid not null references competition.challenges(challenge_id),
  reason text not null check (reason = 'OPTIONAL_DECLINED'),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  constraint optional_pair_quiet_normalized_pair_check check (pair_low_id < pair_high_id),
  constraint optional_pair_quiet_window_check check (ends_at > started_at)
);

create index optional_pair_quiet_active_lookup_idx
  on competition.optional_pair_quiet_periods (competition_id, pair_low_id, pair_high_id, ends_at desc);

create table competition.pair_cooldowns (
  cooldown_id uuid primary key,
  competition_id uuid not null references competition.competitions(competition_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  source_result_id uuid,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  invalidated_at timestamptz,
  constraint pair_cooldowns_normalized_pair_check check (pair_low_id < pair_high_id),
  constraint pair_cooldowns_window_check check (ends_at > started_at)
);

create index pair_cooldowns_active_lookup_idx
  on competition.pair_cooldowns (competition_id, pair_low_id, pair_high_id, ends_at desc)
  where invalidated_at is null;

create trigger ruleset_snapshots_immutable
before update or delete on competition.ruleset_snapshots
for each row execute function platform.reject_event_mutation();

create trigger challenge_ruleset_acknowledgments_immutable
before update or delete on competition.challenge_ruleset_acknowledgments
for each row execute function platform.reject_event_mutation();

create trigger optional_pair_quiet_periods_immutable
before update or delete on competition.optional_pair_quiet_periods
for each row execute function platform.reject_event_mutation();
