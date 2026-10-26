create table scheduling.booking_training_retentions (
  retention_id uuid primary key,
  booking_id uuid not null unique references scheduling.bookings(booking_id),
  session_id uuid not null unique references scheduling.sessions(session_id),
  challenge_id uuid not null unique references competition.challenges(challenge_id),
  cause text not null check (cause in ('YOUTH_CONSENT_REVOKED', 'AGE_TRANSITION')),
  state text not null check (state in ('PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED')),
  deadline_at timestamptz not null,
  terminal_reason text,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  constraint booking_training_retentions_terminal_shape_check check (
    (state = 'PENDING' and decided_at is null and terminal_reason is null)
    or (state <> 'PENDING' and decided_at is not null and terminal_reason is not null)
  )
);

create index booking_training_retentions_pending_idx
  on scheduling.booking_training_retentions (deadline_at, retention_id)
  where state = 'PENDING';

create table scheduling.booking_training_retention_confirmations (
  confirmation_id uuid primary key,
  retention_id uuid not null references scheduling.booking_training_retentions(retention_id),
  actor_user_id uuid not null references identity.users(user_id),
  required_role text not null
    check (required_role in ('ATHLETE_LOW', 'ATHLETE_HIGH', 'COACH_OR_HOST')),
  decision text not null check (decision in ('ACCEPT', 'DECLINE')),
  decided_at timestamptz not null,
  policy_version text not null,
  unique (retention_id, actor_user_id),
  unique (retention_id, required_role)
);

create trigger booking_training_retention_confirmations_immutable
before update or delete on scheduling.booking_training_retention_confirmations
for each row execute function platform.reject_event_mutation();
