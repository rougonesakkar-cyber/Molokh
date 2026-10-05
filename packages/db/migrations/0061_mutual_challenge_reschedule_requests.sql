create table competition.challenge_mutual_reschedule_requests (
  request_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  booking_id uuid references scheduling.bookings(booking_id),
  session_id uuid references scheduling.sessions(session_id),
  proposed_by_user_id uuid not null references identity.users(user_id),
  confirmed_by_user_id uuid references identity.users(user_id),
  reason_code text not null check (length(reason_code) between 1 and 80),
  reason_note text check (reason_note is null or length(reason_note) between 1 and 500),
  state text not null check (state in ('PROPOSED', 'CONFIRMED')),
  challenge_version_at_proposal bigint not null check (challenge_version_at_proposal > 0),
  booking_version_at_proposal bigint check (booking_version_at_proposal is null or booking_version_at_proposal > 0),
  session_version_at_proposal bigint check (session_version_at_proposal is null or session_version_at_proposal > 0),
  slot_version_at_proposal bigint check (slot_version_at_proposal is null or slot_version_at_proposal > 0),
  proposed_at timestamptz not null,
  confirmed_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint challenge_mutual_reschedule_resource_shape_check check (
    (booking_id is null and session_id is null and booking_version_at_proposal is null
      and session_version_at_proposal is null and slot_version_at_proposal is null)
    or (booking_id is not null and session_id is null and booking_version_at_proposal is not null
      and session_version_at_proposal is null and slot_version_at_proposal is null)
    or (booking_id is not null and session_id is not null and booking_version_at_proposal is not null
      and session_version_at_proposal is not null and slot_version_at_proposal is not null)
  ),
  constraint challenge_mutual_reschedule_confirmation_shape_check check (
    (state = 'PROPOSED' and confirmed_by_user_id is null and confirmed_at is null and version = 1)
    or (state = 'CONFIRMED' and confirmed_by_user_id is not null
      and confirmed_by_user_id <> proposed_by_user_id and confirmed_at is not null and version = 2)
  ),
  unique (challenge_id, challenge_version_at_proposal)
);

create index challenge_mutual_reschedule_requests_challenge_idx
  on competition.challenge_mutual_reschedule_requests (
    challenge_id, challenge_version_at_proposal desc, proposed_at desc
  );
