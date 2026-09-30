alter table scheduling.sessions
  add column window_opened_at timestamptz,
  add column actual_start_at timestamptz,
  add column actual_end_at timestamptz;

alter table scheduling.sessions
  drop constraint sessions_state_check;

update scheduling.sessions
set state = case
    when state = 'READY_FOR_COACH' and scheduled_start_at > clock_timestamp() then 'SCHEDULED'
    when state = 'COMPLETED' then 'ENDED'
    else state
  end,
  window_opened_at = case
    when state = 'READY_FOR_COACH' and scheduled_start_at <= clock_timestamp()
      then scheduled_start_at
    when state = 'COMPLETED' then scheduled_start_at
    else null
  end,
  actual_start_at = case when state = 'COMPLETED' then scheduled_start_at else null end,
  actual_end_at = case when state = 'COMPLETED' then scheduled_end_at else null end;

alter table scheduling.sessions
  add constraint sessions_state_check check (
    state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS', 'ENDED', 'CANCELLED')
  ),
  add constraint sessions_lifecycle_timestamps_check check (
    (state = 'SCHEDULED'
      and window_opened_at is null and actual_start_at is null and actual_end_at is null)
    or (state = 'READY_FOR_COACH'
      and window_opened_at is not null and actual_start_at is null and actual_end_at is null)
    or (state = 'IN_PROGRESS'
      and window_opened_at is not null and actual_start_at is not null and actual_end_at is null)
    or (state = 'ENDED'
      and window_opened_at is not null and actual_start_at is not null
      and actual_end_at is not null and actual_end_at >= actual_start_at)
    or state = 'CANCELLED'
  );

drop index scheduling.sessions_coach_ready_idx;

create index sessions_coach_actionable_idx
  on scheduling.sessions (coach_user_id, scheduled_start_at, session_id)
  where state in ('SCHEDULED', 'READY_FOR_COACH', 'IN_PROGRESS');

create table scheduling.attendance (
  attendance_id uuid not null unique,
  session_id uuid not null references scheduling.sessions(session_id),
  athlete_user_id uuid not null references identity.users(user_id),
  status text not null check (status in ('PRESENT', 'LATE', 'NO_SHOW')),
  arrival_at timestamptz,
  recorded_by uuid not null references identity.users(user_id),
  recorded_at timestamptz not null,
  reason_code text,
  comment text,
  version bigint not null check (version = 1),
  primary key (session_id, athlete_user_id),
  constraint attendance_arrival_shape_check check (
    (status in ('PRESENT', 'LATE') and arrival_at is not null and reason_code is null)
    or (status = 'NO_SHOW' and arrival_at is null and reason_code = 'ABSENCE_PREVENTED_SESSION')
  ),
  constraint attendance_comment_length_check check (
    comment is null or length(btrim(comment)) between 1 and 500
  )
);

create index attendance_completed_training_idx
  on scheduling.attendance (athlete_user_id, recorded_at desc, session_id)
  where status in ('PRESENT', 'LATE');
