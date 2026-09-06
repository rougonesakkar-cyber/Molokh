create table platform.notifications (
  notification_id uuid primary key,
  recipient_user_id uuid not null,
  source_event_id uuid not null references platform.domain_events(event_id),
  category text not null check (
    category in ('MANDATORY', 'SERVICE', 'SOCIAL', 'PROMOTIONAL')
  ),
  render_key text not null check (length(btrim(render_key)) > 0),
  action_target jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  deadline_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (recipient_user_id, source_event_id, render_key)
);

create index notifications_recipient_created_idx
  on platform.notifications (recipient_user_id, created_at desc, notification_id desc);

create index notifications_recipient_unread_idx
  on platform.notifications (recipient_user_id, created_at desc)
  where read_at is null;

create table platform.notification_preferences (
  user_id uuid primary key,
  social_push_enabled boolean not null default true,
  promotional_push_enabled boolean not null default false,
  event_sms_opt_in boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
