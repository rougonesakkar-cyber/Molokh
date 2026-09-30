create table scheduling.session_competitive_snapshots (
  snapshot_id uuid primary key,
  session_id uuid not null unique references scheduling.sessions(session_id),
  challenge_id uuid not null references competition.challenges(challenge_id),
  competition_id uuid not null references competition.competitions(competition_id),
  ruleset_snapshot_id uuid not null references competition.ruleset_snapshots(ruleset_snapshot_id),
  community_configuration_id uuid not null references community.community_configuration_versions(configuration_id),
  planned_stake text not null check (
    planned_stake in ('NONE', 'CONTENDER', 'TITLE', 'GENESIS_CHAMPION', 'GENESIS_CONTENDER')
  ),
  effective_stake text not null check (
    effective_stake in ('NONE', 'CONTENDER', 'TITLE', 'GENESIS_CHAMPION', 'GENESIS_CONTENDER')
  ),
  champion_user_id uuid references identity.users(user_id),
  contender_user_id uuid references identity.users(user_id),
  competition_status_version bigint not null check (competition_status_version >= 0),
  venue_id uuid not null references community.venues(venue_id),
  coach_user_id uuid not null references identity.users(user_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  created_at timestamptz not null,
  constraint session_competitive_snapshot_pair_check check (pair_low_id < pair_high_id),
  constraint session_competitive_snapshot_status_holders_check check (
    champion_user_id is null or contender_user_id is null or champion_user_id <> contender_user_id
  ),
  constraint session_competitive_snapshot_window_check check (
    scheduled_end_at > scheduled_start_at
  )
);

create index session_competitive_snapshots_challenge_idx
  on scheduling.session_competitive_snapshots (challenge_id, created_at desc, snapshot_id);

create trigger session_competitive_snapshots_immutable
before update or delete on scheduling.session_competitive_snapshots
for each row execute function platform.reject_event_mutation();
