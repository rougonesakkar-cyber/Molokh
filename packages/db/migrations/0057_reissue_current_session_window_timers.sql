insert into platform.outbox_messages (message_id, topic, event_id, payload)
select
  gen_random_uuid(),
  'scheduling.session.scheduled.v1',
  source_event.event_id,
  jsonb_build_object(
    'sessionId', session.session_id,
    'timer', jsonb_build_object(
      'commandType', 'OPEN_SESSION_WINDOW',
      'aggregateType', 'Session',
      'aggregateId', session.session_id,
      'expectedState', 'SCHEDULED',
      'expectedVersion', session.version,
      'deadlineAt', session.scheduled_start_at,
      'policyVersion', 'scheduling-mvp-v1',
      'idempotencyKey', concat(
        'session:', session.session_id, ':open-session-window:v', session.version
      )
    )
  )
from scheduling.sessions as session
join lateral (
  select event_id
  from platform.domain_events
  where aggregate_type = 'Session' and aggregate_id = session.session_id
  order by aggregate_version desc
  limit 1
) as source_event on true
where session.state = 'SCHEDULED'
  and not exists (
    select 1
    from platform.outbox_messages as existing
    where existing.topic in (
      'scheduling.session.scheduled.v1',
      'scheduling.session.coach-replaced.v1'
    )
      and existing.payload -> 'timer' ->> 'aggregateId' = session.session_id::text
      and (existing.payload -> 'timer' ->> 'expectedVersion')::bigint = session.version
  );
