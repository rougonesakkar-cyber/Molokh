create table scheduling.sessions (
  session_id uuid primary key,
  booking_id uuid not null unique references scheduling.bookings(booking_id),
  venue_id uuid not null references community.venues(venue_id),
  coach_user_id uuid not null references identity.users(user_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  purpose text not null check (purpose in ('TRAINING', 'OFFICIAL_CHALLENGE')),
  state text not null check (
    state in ('READY_FOR_COACH', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OPERATIONAL_FAILURE')
  ),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  commercial_terms_snapshot jsonb not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint sessions_distinct_ordered_pair_check check (pair_low_id < pair_high_id),
  constraint sessions_valid_interval_check check (scheduled_end_at > scheduled_start_at)
);

create index sessions_coach_ready_idx
  on scheduling.sessions (coach_user_id, scheduled_start_at, session_id)
  where state = 'READY_FOR_COACH';

create index sessions_pair_upcoming_idx
  on scheduling.sessions (pair_low_id, pair_high_id, scheduled_start_at, session_id)
  where state in ('READY_FOR_COACH', 'IN_PROGRESS');
