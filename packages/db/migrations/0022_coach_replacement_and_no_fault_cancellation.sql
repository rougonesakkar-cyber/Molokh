alter table scheduling.bookings
  add column coach_replaced_at timestamptz,
  add column coach_replaced_by uuid references identity.users(user_id),
  add column cancelled_at timestamptz,
  add column cancel_actor uuid references identity.users(user_id),
  add column cancel_reason text;

alter table scheduling.sessions
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references identity.users(user_id),
  add column cancellation_reason_code text;

create table scheduling.booking_coach_replacements (
  replacement_id uuid primary key,
  booking_id uuid not null references scheduling.bookings(booking_id),
  session_id uuid not null references scheduling.sessions(session_id),
  venue_id uuid not null references community.venues(venue_id),
  old_coach_user_id uuid not null references identity.users(user_id),
  new_coach_user_id uuid not null references identity.users(user_id),
  replaced_by uuid not null references identity.users(user_id),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  commercial_terms_snapshot jsonb not null,
  created_at timestamptz not null,
  constraint booking_coach_replacement_distinct_coaches_check
    check (old_coach_user_id <> new_coach_user_id),
  constraint booking_coach_replacement_interval_check
    check (scheduled_end_at > scheduled_start_at)
);

create index booking_coach_replacements_booking_history_idx
  on scheduling.booking_coach_replacements (booking_id, created_at desc, replacement_id);

create table scheduling.session_coach_assignment_revisions (
  revision_id uuid primary key,
  session_id uuid not null references scheduling.sessions(session_id),
  booking_replacement_id uuid not null unique
    references scheduling.booking_coach_replacements(replacement_id),
  old_coach_user_id uuid not null references identity.users(user_id),
  new_coach_user_id uuid not null references identity.users(user_id),
  assigned_by uuid not null references identity.users(user_id),
  assigned_at timestamptz not null,
  constraint session_coach_revision_distinct_coaches_check
    check (old_coach_user_id <> new_coach_user_id)
);

create index session_coach_assignment_revisions_history_idx
  on scheduling.session_coach_assignment_revisions (session_id, assigned_at desc, revision_id);

alter table scheduling.bookings
  add constraint bookings_coach_replacement_shape_check check (
    (coach_replaced_at is null and coach_replaced_by is null)
    or (coach_replaced_at is not null and coach_replaced_by is not null)
  ),
  add constraint bookings_cancellation_audit_shape_check check (
    (cancelled_at is null and cancel_actor is null and cancel_reason is null)
    or (cancelled_at is not null and cancel_reason is not null)
  );

alter table scheduling.sessions
  add constraint sessions_cancellation_audit_shape_check check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason_code is null)
    or (cancelled_at is not null and cancellation_reason_code is not null)
  );
