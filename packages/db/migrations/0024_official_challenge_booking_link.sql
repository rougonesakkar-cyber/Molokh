alter table scheduling.bookings
  add column challenge_id uuid references competition.challenges(challenge_id);

alter table scheduling.bookings
  add constraint bookings_purpose_challenge_shape_check check (
    (purpose = 'TRAINING' and challenge_id is null)
    or (purpose = 'OFFICIAL_CHALLENGE' and challenge_id is not null)
  );

create unique index bookings_one_active_request_per_challenge_uq
  on scheduling.bookings (challenge_id)
  where challenge_id is not null
    and state in ('SELECTING', 'HOST_CONFIRMATION_PENDING');

create index bookings_challenge_history_idx
  on scheduling.bookings (challenge_id, created_at desc, booking_id)
  where challenge_id is not null;

alter table scheduling.sessions
  add column challenge_id uuid references competition.challenges(challenge_id);

alter table scheduling.sessions
  add constraint sessions_purpose_challenge_shape_check check (
    (purpose = 'TRAINING' and challenge_id is null)
    or (purpose = 'OFFICIAL_CHALLENGE' and challenge_id is not null)
  );

create index sessions_challenge_history_idx
  on scheduling.sessions (challenge_id, created_at desc, session_id)
  where challenge_id is not null;
