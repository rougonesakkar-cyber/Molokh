alter table scheduling.bookings
  add constraint bookings_match_or_official_challenge_check check (
    match_id is not null or challenge_id is not null
  );
