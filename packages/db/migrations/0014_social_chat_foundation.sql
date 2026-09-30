create table social.chats (
  chat_id uuid primary key,
  scope text not null check (scope in ('PERSONAL_MATCH', 'CHALLENGE_SERVICE')),
  state text not null check (state in ('OPEN', 'ARCHIVED', 'READ_ONLY', 'CLOSED')),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table social.chat_participants (
  chat_id uuid not null references social.chats(chat_id),
  user_id uuid not null references identity.users(user_id),
  joined_at timestamptz not null default clock_timestamp(),
  primary key (chat_id, user_id)
);

insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
select
  chat_id,
  'PERSONAL_MATCH',
  case when state = 'ARCHIVED' then 'ARCHIVED' else 'OPEN' end,
  1,
  created_at,
  updated_at
from social.matches
on conflict (chat_id) do nothing;

insert into social.chat_participants (chat_id, user_id, joined_at)
select chat_id, pair_low_id, created_at from social.matches
union all
select chat_id, pair_high_id, created_at from social.matches
on conflict (chat_id, user_id) do nothing;

create unique index matches_chat_id_uq on social.matches (chat_id);

alter table social.matches
  add constraint matches_chat_fk
  foreign key (chat_id) references social.chats(chat_id)
  deferrable initially deferred;
