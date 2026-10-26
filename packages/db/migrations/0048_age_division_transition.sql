create table identity.age_division_transitions (
  transition_id uuid primary key,
  user_id uuid not null unique references identity.users(user_id),
  from_age_division text not null check (from_age_division = 'YOUTH'),
  to_age_division text not null check (to_age_division = 'ADULT'),
  identity_version_before bigint not null check (identity_version_before > 0),
  identity_version_after bigint not null check (
    identity_version_after = identity_version_before + 1
  ),
  affected_membership_count integer not null check (affected_membership_count >= 0),
  closed_challenge_ids uuid[] not null default '{}',
  retention_ids uuid[] not null default '{}',
  invalidated_queue_entry_ids uuid[] not null default '{}',
  expired_consent_ids uuid[] not null default '{}',
  status_changes jsonb not null default '[]'::jsonb,
  source_event_id uuid not null,
  policy_version text not null,
  transitioned_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create trigger age_division_transitions_immutable
before update or delete on identity.age_division_transitions
for each row execute function platform.reject_event_mutation();

insert into platform.outbox_messages (message_id, topic, event_id, payload)
select
  gen_random_uuid(),
  'identity.age-division-timer.v1',
  source_event.event_id,
  jsonb_build_object(
    'userId', users.user_id,
    'timer', jsonb_build_object(
      'commandType', 'TRANSITION_TO_ADULT',
      'aggregateType', 'AgeDivisionTransition',
      'aggregateId', users.user_id,
      'expectedState', 'YOUTH',
      'expectedVersion', 0,
      'deadlineAt', ((users.birth_date + interval '18 years')::date::timestamp at time zone 'UTC'),
      'policyVersion', 'identity-v1',
      'idempotencyKey', concat('age-division:', users.user_id, ':adult:v1')
    )
  )
from identity.users as users
join lateral (
  select event_id
  from platform.domain_events
  where aggregate_type in ('Identity', 'User') and aggregate_id = users.user_id
  order by occurred_at desc, aggregate_version desc
  limit 1
) as source_event on true
where users.age_division = 'YOUTH'
  and not exists (
    select 1
    from platform.outbox_messages as existing
    where existing.topic = 'identity.age-division-timer.v1'
      and existing.payload ->> 'userId' = users.user_id::text
  );
