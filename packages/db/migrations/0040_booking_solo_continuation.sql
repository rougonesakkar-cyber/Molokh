alter table scheduling.sessions
  add column solo_athlete_user_id uuid references identity.users(user_id),
  add constraint sessions_solo_athlete_shape_check check (
    solo_athlete_user_id is null
    or solo_athlete_user_id in (pair_low_id, pair_high_id)
  );

create table scheduling.booking_solo_continuations (
  continuation_id uuid primary key,
  booking_id uuid not null unique references scheduling.bookings(booking_id),
  session_id uuid not null unique references scheduling.sessions(session_id),
  cancelled_athlete_user_id uuid not null references identity.users(user_id),
  remaining_athlete_user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED')),
  deadline_at timestamptz not null,
  terminal_reason text,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  constraint booking_solo_continuations_distinct_athletes_check
    check (cancelled_athlete_user_id <> remaining_athlete_user_id),
  constraint booking_solo_continuations_terminal_shape_check check (
    (state = 'PENDING' and decided_at is null and terminal_reason is null)
    or (state <> 'PENDING' and decided_at is not null)
  )
);

create index booking_solo_continuations_pending_idx
  on scheduling.booking_solo_continuations (deadline_at, continuation_id)
  where state = 'PENDING';

create table scheduling.booking_solo_confirmations (
  confirmation_id uuid primary key,
  continuation_id uuid not null references scheduling.booking_solo_continuations(continuation_id),
  actor_user_id uuid not null references identity.users(user_id),
  required_role text not null check (required_role in ('REMAINING_ATHLETE', 'COACH')),
  decision text not null check (decision in ('ACCEPT', 'DECLINE')),
  decided_at timestamptz not null,
  policy_version text not null,
  unique (continuation_id, actor_user_id),
  unique (continuation_id, required_role)
);

create trigger booking_solo_confirmations_immutable
before update or delete on scheduling.booking_solo_confirmations
for each row execute function platform.reject_event_mutation();
