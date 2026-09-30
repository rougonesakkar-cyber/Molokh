create table scheduling.booking_official_conversions (
  conversion_id uuid primary key,
  booking_id uuid not null references scheduling.bookings(booking_id),
  session_id uuid not null references scheduling.sessions(session_id),
  competition_id uuid not null references competition.competitions(competition_id),
  requested_by_user_id uuid not null references identity.users(user_id),
  stake text not null check (stake in ('NONE', 'CONTENDER', 'TITLE')),
  state text not null check (
    state in (
      'WAITING_FIFO', 'PENDING_CONFIRMATION', 'CONVERTED',
      'DECLINED', 'EXPIRED', 'INVALIDATED'
    )
  ),
  bound_holder_user_id uuid references identity.users(user_id),
  queue_entry_id uuid unique references competition.challenge_queue_entries(queue_entry_id),
  challenge_id uuid unique references competition.challenges(challenge_id),
  confirmation_deadline_at timestamptz,
  terminal_reason text,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  constraint booking_official_conversions_status_shape_check check (
    (stake = 'CONTENDER' and bound_holder_user_id is not null)
    or (stake <> 'CONTENDER' and bound_holder_user_id is null)
  ),
  constraint booking_official_conversions_queue_shape_check check (
    (state = 'WAITING_FIFO' and queue_entry_id is not null and confirmation_deadline_at is null)
    or (state = 'PENDING_CONFIRMATION' and confirmation_deadline_at is not null)
    or (state in ('CONVERTED', 'DECLINED', 'EXPIRED', 'INVALIDATED'))
  ),
  constraint booking_official_conversions_terminal_shape_check check (
    (state in ('CONVERTED', 'DECLINED', 'EXPIRED', 'INVALIDATED') and decided_at is not null)
    or (state in ('WAITING_FIFO', 'PENDING_CONFIRMATION') and decided_at is null)
  )
);

create unique index booking_official_conversions_one_live_booking_uq
  on scheduling.booking_official_conversions (booking_id)
  where state in ('WAITING_FIFO', 'PENDING_CONFIRMATION');

create index booking_official_conversions_pending_idx
  on scheduling.booking_official_conversions (confirmation_deadline_at, conversion_id)
  where state = 'PENDING_CONFIRMATION';

create table scheduling.booking_conversion_confirmations (
  confirmation_id uuid primary key,
  conversion_id uuid not null references scheduling.booking_official_conversions(conversion_id),
  actor_user_id uuid not null references identity.users(user_id),
  required_role text not null check (
    required_role in ('ATHLETE_LOW', 'ATHLETE_HIGH', 'COACH')
  ),
  decision text not null check (decision in ('ACCEPT', 'DECLINE')),
  ruleset_acknowledged boolean not null default false,
  decided_at timestamptz not null,
  policy_version text not null,
  unique (conversion_id, actor_user_id),
  unique (conversion_id, required_role)
);

create trigger booking_conversion_confirmations_immutable
before update or delete on scheduling.booking_conversion_confirmations
for each row execute function platform.reject_event_mutation();
