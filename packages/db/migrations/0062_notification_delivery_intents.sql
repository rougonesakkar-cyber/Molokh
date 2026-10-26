create table platform.notification_delivery_intents (
  delivery_intent_id uuid primary key,
  notification_id uuid not null references platform.notifications(notification_id),
  source_event_id uuid not null references platform.domain_events(event_id),
  recipient_user_id uuid not null,
  channel text not null check (channel in ('PUSH', 'SMS')),
  delivery_class text not null check (delivery_class = 'CRITICAL'),
  state text not null default 'PENDING' check (state in ('PENDING', 'DELIVERED', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (notification_id, channel),
  constraint notification_delivery_intent_state_check check (
    (state = 'DELIVERED' and delivered_at is not null)
    or (state in ('PENDING', 'FAILED') and delivered_at is null)
  )
);

create index notification_delivery_intents_pending_idx
  on platform.notification_delivery_intents (next_attempt_at, created_at, delivery_intent_id)
  where state in ('PENDING', 'FAILED');
