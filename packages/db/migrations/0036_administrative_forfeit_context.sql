alter table competition.results
  alter column competitive_snapshot_id drop not null,
  alter column recorded_by drop not null;

alter table competition.results
  drop constraint results_session_origin_shape_check;

alter table competition.results
  add constraint results_session_origin_shape_check check (
    (
      origin = 'SESSION'
      and session_id is not null
      and competitive_snapshot_id is not null
      and venue_id is not null
      and coach_user_id is not null
      and recorded_by is not null
    )
    or (
      origin = 'ADMINISTRATIVE_FORFEIT'
      and session_id is null
      and competitive_snapshot_id is null
      and venue_id is null
      and coach_user_id is null
    )
  );

alter table competition.status_transitions
  alter column competitive_snapshot_id drop not null;
