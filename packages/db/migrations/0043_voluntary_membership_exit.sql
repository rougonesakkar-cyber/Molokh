create table community.voluntary_membership_exits (
  exit_id uuid primary key,
  membership_id uuid not null references community.community_memberships(membership_id),
  competition_id uuid not null references competition.competitions(competition_id),
  user_id uuid not null references identity.users(user_id),
  departing_status text not null check (
    departing_status in ('ORDINARY', 'CHAMPION', 'CONTENDER')
  ),
  consequence text not null check (
    consequence in (
      'ORDINARY_EXIT', 'CHAMPION_SUCCESSION',
      'CHAMPION_VACANCY', 'CONTENDER_VACANCY'
    )
  ),
  state text not null check (state in ('PREVIEWED', 'CONFIRMED')),
  before_membership_version bigint not null check (before_membership_version > 0),
  after_membership_version bigint check (after_membership_version > before_membership_version),
  before_champion_user_id uuid references identity.users(user_id),
  before_contender_user_id uuid references identity.users(user_id),
  before_status_version bigint not null check (before_status_version >= 0),
  after_champion_user_id uuid references identity.users(user_id),
  after_contender_user_id uuid references identity.users(user_id),
  after_status_version bigint check (after_status_version > before_status_version),
  after_phase text check (
    after_phase in ('FOUNDING_OPEN', 'CONTENDER_VACANT_OPEN')
  ),
  confirmation_token_hash text not null check (
    confirmation_token_hash ~ '^[0-9a-f]{64}$'
  ),
  preview_event_id uuid not null,
  confirm_event_id uuid,
  previewed_at timestamptz not null,
  preview_expires_at timestamptz not null check (preview_expires_at > previewed_at),
  confirmed_at timestamptz,
  closed_challenge_count integer not null default 0 check (closed_challenge_count >= 0),
  invalidated_queue_entry_count integer not null default 0 check (
    invalidated_queue_entry_count >= 0
  ),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint voluntary_membership_exit_status_shape_check check (
    (
      departing_status = 'ORDINARY'
      and consequence = 'ORDINARY_EXIT'
      and after_phase is null
      and after_champion_user_id is null
      and after_contender_user_id is null
      and after_status_version is null
    ) or (
      departing_status in ('CHAMPION', 'CONTENDER')
      and consequence <> 'ORDINARY_EXIT'
      and after_phase is not null
      and after_status_version is not null
    )
  ),
  constraint voluntary_membership_exit_state_shape_check check (
    (
      state = 'PREVIEWED'
      and after_membership_version is null
      and confirm_event_id is null
      and confirmed_at is null
      and closed_challenge_count = 0
      and invalidated_queue_entry_count = 0
    ) or (
      state = 'CONFIRMED'
      and after_membership_version is not null
      and confirm_event_id is not null
      and confirmed_at is not null
    )
  )
);

create index voluntary_membership_exits_history_idx
  on community.voluntary_membership_exits
  (membership_id, previewed_at desc, exit_id);

create function community.guard_voluntary_membership_exit_update()
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
    old.confirmation_token_hash, old.preview_event_id,
    old.previewed_at, old.preview_expires_at, old.created_at
  ) is distinct from row(
    new.membership_id, new.competition_id, new.user_id,
    new.departing_status, new.consequence,
    new.before_membership_version, new.before_champion_user_id,
    new.before_contender_user_id, new.before_status_version,
    new.after_champion_user_id, new.after_contender_user_id,
    new.after_status_version, new.after_phase,
    new.confirmation_token_hash, new.preview_event_id,
    new.previewed_at, new.preview_expires_at, new.created_at
  ) then
    raise exception 'voluntary Membership exit preview facts are immutable';
  end if;
  return new;
end;
$$;

create trigger voluntary_membership_exits_guard_update
before update on community.voluntary_membership_exits
for each row execute function community.guard_voluntary_membership_exit_update();

create trigger voluntary_membership_exits_reject_delete
before delete on community.voluntary_membership_exits
for each row execute function platform.reject_event_mutation();
