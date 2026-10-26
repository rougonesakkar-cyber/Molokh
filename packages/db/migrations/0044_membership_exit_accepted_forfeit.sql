alter table community.voluntary_membership_exits
  add column obligation_challenge_id uuid references competition.challenges(challenge_id),
  add column obligation_challenge_version bigint check (obligation_challenge_version > 0),
  add column obligation_challenge_state text check (
    obligation_challenge_state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
  ),
  add column obligation_stake text check (
    obligation_stake in ('NONE', 'CONTENDER', 'TITLE', 'GENESIS_CHAMPION', 'GENESIS_CONTENDER')
  ),
  add column opponent_user_id uuid references identity.users(user_id),
  add column result_id uuid references competition.results(result_id),
  add column appeal_waiver_id uuid references competition.appeal_waivers(waiver_id),
  add column cooldown_id uuid references competition.pair_cooldowns(cooldown_id);

alter table community.voluntary_membership_exits
  drop constraint voluntary_membership_exits_consequence_check,
  add constraint voluntary_membership_exits_consequence_check check (
    consequence in (
      'ORDINARY_EXIT', 'CHAMPION_SUCCESSION', 'CHAMPION_VACANCY',
      'CONTENDER_VACANCY', 'ACCEPTED_CHALLENGE_FORFEIT'
    )
  ),
  drop constraint voluntary_membership_exits_after_phase_check,
  add constraint voluntary_membership_exits_after_phase_check check (
    after_phase in ('FOUNDING_OPEN', 'FOUNDING_CHALLENGE', 'RUNNING',
      'CONTENDER_VACANT_OPEN', 'CONTENDER_GENESIS')
  ),
  drop constraint voluntary_membership_exit_status_shape_check,
  add constraint voluntary_membership_exit_status_shape_check check (
    (
      consequence = 'ORDINARY_EXIT'
      and departing_status = 'ORDINARY'
      and after_phase is null
      and after_champion_user_id is null
      and after_contender_user_id is null
      and after_status_version is null
    ) or (
      consequence in ('CHAMPION_SUCCESSION', 'CHAMPION_VACANCY', 'CONTENDER_VACANCY')
      and departing_status in ('CHAMPION', 'CONTENDER')
      and after_phase is not null
      and after_status_version is not null
    ) or (
      consequence = 'ACCEPTED_CHALLENGE_FORFEIT'
      and obligation_challenge_id is not null
      and obligation_challenge_version is not null
      and obligation_challenge_state is not null
      and obligation_stake is not null
      and opponent_user_id is not null
      and ((after_phase is null and after_status_version is null)
        or (after_phase is not null and after_status_version is not null))
    )
  ),
  drop constraint voluntary_membership_exit_state_shape_check,
  add constraint voluntary_membership_exit_state_shape_check check (
    (
      state = 'PREVIEWED'
      and after_membership_version is null
      and confirm_event_id is null
      and confirmed_at is null
      and result_id is null
      and appeal_waiver_id is null
      and cooldown_id is null
      and closed_challenge_count = 0
      and invalidated_queue_entry_count = 0
    ) or (
      state = 'CONFIRMED'
      and after_membership_version is not null
      and confirm_event_id is not null
      and confirmed_at is not null
      and (
        (consequence <> 'ACCEPTED_CHALLENGE_FORFEIT'
          and result_id is null and appeal_waiver_id is null and cooldown_id is null)
        or
        (consequence = 'ACCEPTED_CHALLENGE_FORFEIT'
          and result_id is not null and appeal_waiver_id is not null and cooldown_id is not null)
      )
    )
  );

alter table competition.appeal_waivers
  drop constraint appeal_waivers_reason_context_check,
  add constraint appeal_waivers_reason_context_check check (
    reason_context in ('EARLY_UNLOCK', 'VOLUNTARY_RESIGNATION')
  );

create unique index voluntary_membership_exits_result_uq
  on community.voluntary_membership_exits (result_id)
  where result_id is not null;

create unique index voluntary_membership_exits_waiver_uq
  on community.voluntary_membership_exits (appeal_waiver_id)
  where appeal_waiver_id is not null;

create or replace function community.guard_voluntary_membership_exit_update()
returns trigger language plpgsql as $$
begin
  if old.state = 'CONFIRMED' then
    raise exception 'confirmed voluntary Membership exit is immutable';
  end if;
  if row(
    old.membership_id, old.competition_id, old.user_id,
    old.departing_status, old.consequence,
    old.before_membership_version, old.before_champion_user_id,
    old.before_contender_user_id, old.before_status_version,
    old.after_champion_user_id, old.after_contender_user_id,
    old.after_status_version, old.after_phase,
    old.obligation_challenge_id, old.obligation_challenge_version,
    old.obligation_challenge_state, old.obligation_stake, old.opponent_user_id,
    old.confirmation_token_hash, old.preview_event_id,
    old.previewed_at, old.preview_expires_at, old.created_at
  ) is distinct from row(
    new.membership_id, new.competition_id, new.user_id,
    new.departing_status, new.consequence,
    new.before_membership_version, new.before_champion_user_id,
    new.before_contender_user_id, new.before_status_version,
    new.after_champion_user_id, new.after_contender_user_id,
    new.after_status_version, new.after_phase,
    new.obligation_challenge_id, new.obligation_challenge_version,
    new.obligation_challenge_state, new.obligation_stake, new.opponent_user_id,
    new.confirmation_token_hash, new.preview_event_id,
    new.previewed_at, new.preview_expires_at, new.created_at
  ) then
    raise exception 'voluntary Membership exit preview facts are immutable';
  end if;
  return new;
end;
$$;
