drop index platform.outbox_messages_pending_idx;

alter table platform.outbox_messages
  add column available_at timestamptz not null default clock_timestamp(),
  add column locked_at timestamptz,
  add column locked_by text,
  add column last_error text,
  add constraint outbox_messages_event_topic_uq unique (event_id, topic),
  add constraint outbox_messages_lock_pair_check
    check ((locked_at is null) = (locked_by is null));

create index outbox_messages_pending_idx
  on platform.outbox_messages (available_at, created_at)
  where published_at is null;
