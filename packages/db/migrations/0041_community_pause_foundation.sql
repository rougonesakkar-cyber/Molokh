create table community.community_pause_intervals (
  pause_id uuid primary key,
  community_id uuid not null references community.communities(community_id),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  started_by uuid not null references identity.users(user_id),
  started_at timestamptz not null,
  ended_by uuid references identity.users(user_id),
  ended_at timestamptz,
  resolution_reason text check (
    resolution_reason is null or length(btrim(resolution_reason)) between 1 and 500
  ),
  duration_seconds bigint check (duration_seconds is null or duration_seconds >= 0),
  constraint community_pause_interval_close_shape_check check (
    (ended_at is null and ended_by is null and resolution_reason is null and duration_seconds is null)
    or
    (ended_at is not null and ended_by is not null and resolution_reason is not null
      and duration_seconds is not null and ended_at >= started_at)
  )
);

create unique index community_pause_intervals_one_open_uq
  on community.community_pause_intervals (community_id)
  where ended_at is null;

create index community_pause_intervals_history_idx
  on community.community_pause_intervals (community_id, started_at desc, pause_id);

-- The deterministic local/bootstrap fixtures predate aggregate event sourcing for Community.
-- Backfill only missing aggregate baselines so their row and journal versions stay aligned.
insert into platform.domain_events (
  event_id, event_name, event_version, aggregate_type, aggregate_id,
  aggregate_version, transition_id, correlation_id, causation_id,
  actor_id, actor_type, actor_roles, actor_scope_ids, occurred_at,
  idempotency_key_hash, payload, metadata
)
select
  md5('community-created:' || community_id::text)::uuid,
  'CommunityCreated', 1, 'Community', community_id, 1, 'CO-01',
  md5('community-created-correlation:' || community_id::text)::uuid,
  null, created_by_central_id, 'SYSTEM', '["CENTRAL_ADMIN"]'::jsonb,
  '{}'::uuid[], created_at, md5('community-created:' || community_id::text),
  jsonb_build_object('communityId', community_id, 'venueId', venue_id, 'bootstrap', true),
  jsonb_build_object('policyVersion', 'community-lifecycle-mvp-v1', 'backfilled', true)
from community.communities as community
where not exists (
  select 1 from platform.domain_events as event
  where event.aggregate_type = 'Community' and event.aggregate_id = community.community_id
);

insert into platform.domain_events (
  event_id, event_name, event_version, aggregate_type, aggregate_id,
  aggregate_version, transition_id, correlation_id, causation_id,
  actor_id, actor_type, actor_roles, actor_scope_ids, occurred_at,
  idempotency_key_hash, payload, metadata
)
select
  md5('competition-created:' || competition_id::text)::uuid,
  'CompetitionCreated', 1, 'Competition', competition_id, 1, null,
  md5('competition-created-correlation:' || competition_id::text)::uuid,
  null, null, 'SYSTEM', '[]'::jsonb, '{}'::uuid[], created_at,
  md5('competition-created:' || competition_id::text),
  jsonb_build_object('competitionId', competition_id, 'communityId', community_id,
    'ageDivision', age_division, 'bootstrap', true),
  jsonb_build_object('policyVersion', 'community-lifecycle-mvp-v1', 'backfilled', true)
from competition.competitions as competition
where not exists (
  select 1 from platform.domain_events as event
  where event.aggregate_type = 'Competition' and event.aggregate_id = competition.competition_id
);
