create table social.chat_messages (
  message_id uuid primary key,
  chat_id uuid not null references social.chats(chat_id),
  sender_user_id uuid references identity.users(user_id),
  payload_type text not null check (payload_type in ('PERSONAL_TEXT', 'SERVICE', 'ACTION')),
  current_revision_id uuid not null,
  state text not null check (state in ('ACTIVE', 'HIDDEN_BY_MODERATION')),
  reported_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint chat_message_sender_check check (
    (payload_type = 'PERSONAL_TEXT' and sender_user_id is not null)
    or payload_type in ('SERVICE', 'ACTION')
  )
);

create table social.chat_message_revisions (
  revision_id uuid primary key,
  message_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  payload jsonb not null,
  created_by uuid references identity.users(user_id),
  created_at timestamptz not null,
  unique (message_id, revision_id),
  unique (message_id, revision_no),
  constraint chat_message_revision_message_fk
    foreign key (message_id) references social.chat_messages(message_id)
    deferrable initially deferred
);

alter table social.chat_messages
  add constraint chat_message_current_revision_fk
  foreign key (message_id, current_revision_id)
  references social.chat_message_revisions(message_id, revision_id)
  deferrable initially deferred;

create table social.chat_message_user_visibility (
  message_id uuid not null references social.chat_messages(message_id),
  user_id uuid not null references identity.users(user_id),
  hidden_at timestamptz not null,
  primary key (message_id, user_id)
);

create table social.chat_message_reports (
  report_id uuid primary key,
  message_id uuid not null references social.chat_messages(message_id),
  reporter_user_id uuid not null references identity.users(user_id),
  reason_code text not null,
  state text not null check (state in ('PENDING_CENTRAL', 'RESOLVED')),
  evidence_snapshot jsonb not null,
  created_at timestamptz not null,
  resolved_at timestamptz,
  unique (message_id, reporter_user_id)
);

create index chat_messages_history_idx
  on social.chat_messages (chat_id, created_at desc, message_id desc);

create index chat_message_reports_central_queue_idx
  on social.chat_message_reports (created_at, report_id)
  where state = 'PENDING_CENTRAL';
