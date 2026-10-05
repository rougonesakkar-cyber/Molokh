alter table competition.challenges
  add column user_reschedule_count integer not null default 0
    check (user_reschedule_count between 0 and 2);

create table competition.challenge_reschedules (
  reschedule_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  booking_id uuid references scheduling.bookings(booking_id),
  initiated_by_user_id uuid not null references identity.users(user_id),
  fault_attribution text not null check (fault_attribution in ('A', 'B', 'MUTUAL', 'EXTERNAL')),
  fault_user_id uuid references identity.users(user_id),
  reason_code text not null check (length(reason_code) between 1 and 80),
  reason_note text check (reason_note is null or length(reason_note) between 1 and 500),
  created_at timestamptz not null,
  constraint challenge_reschedules_fault_shape_check check (
    (fault_attribution in ('A', 'B') and fault_user_id is not null)
    or (fault_attribution in ('MUTUAL', 'EXTERNAL') and fault_user_id is null)
  )
);

create index challenge_reschedules_challenge_time_idx
  on competition.challenge_reschedules (challenge_id, created_at, reschedule_id);

create trigger challenge_reschedules_immutable
before update or delete on competition.challenge_reschedules
for each row execute function platform.reject_event_mutation();
