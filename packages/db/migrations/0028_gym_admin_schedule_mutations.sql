create table scheduling.booking_host_rejections (
  booking_id uuid primary key references scheduling.bookings(booking_id),
  rejected_by uuid not null references identity.users(user_id),
  reason_code text not null check (
    reason_code in (
      'COACH_UNAVAILABLE', 'VENUE_UNAVAILABLE', 'SCHEDULE_CHANGED', 'OTHER'
    )
  ),
  reason_note text,
  rejected_at timestamptz not null,
  constraint booking_host_rejections_note_length_check check (
    reason_note is null or length(btrim(reason_note)) between 1 and 500
  )
);

create index booking_host_rejections_rejected_at_idx
  on scheduling.booking_host_rejections (rejected_at desc, booking_id);
