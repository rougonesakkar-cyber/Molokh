create table competition.voluntary_status_releases (
  release_id uuid primary key,
  competition_id uuid not null references competition.competitions(competition_id),
  user_id uuid not null references identity.users(user_id),
  released_status text not null check (released_status in ('CHAMPION', 'CONTENDER')),
  consequence text not null check (
    consequence in ('CHAMPION_SUCCESSION', 'CHAMPION_VACANCY', 'CONTENDER_VACANCY')
  ),
  state text not null check (state in ('PREVIEWED', 'CONFIRMED')),
  before_champion_user_id uuid references identity.users(user_id),
  before_contender_user_id uuid references identity.users(user_id),
  before_status_version bigint not null check (before_status_version >= 0),
  after_champion_user_id uuid references identity.users(user_id),
  after_contender_user_id uuid references identity.users(user_id),
  after_phase text not null check (
    after_phase in ('FOUNDING_OPEN', 'CONTENDER_VACANT_OPEN')
  ),
  after_status_version bigint check (after_status_version > before_status_version),
  confirmation_token_hash text not null check (
    confirmation_token_hash ~ '^[0-9a-f]{64}$'
  ),
  preview_event_id uuid not null,
  confirm_event_id uuid,
  previewed_at timestamptz not null,
  preview_expires_at timestamptz not null check (preview_expires_at > previewed_at),
  confirmed_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint voluntary_status_release_before_holders_check check (
    before_champion_user_id is null or before_contender_user_id is null
    or before_champion_user_id <> before_contender_user_id
  ),
  constraint voluntary_status_release_after_holders_check check (
    after_champion_user_id is null or after_contender_user_id is null
    or after_champion_user_id <> after_contender_user_id
  ),
  constraint voluntary_status_release_state_shape_check check (
    (
      state = 'PREVIEWED' and after_status_version is null
      and confirm_event_id is null and confirmed_at is null
    ) or (
      state = 'CONFIRMED' and after_status_version is not null
      and confirm_event_id is not null and confirmed_at is not null
    )
  )
);

create index voluntary_status_release_history_idx
  on competition.voluntary_status_releases
  (competition_id, user_id, previewed_at desc, release_id);

create function competition.guard_voluntary_status_release_update()
returns trigger language plpgsql as $$
begin
  if old.state = 'CONFIRMED' then
    raise exception 'confirmed voluntary status release is immutable';
  end if;
  if row(
    old.competition_id, old.user_id, old.released_status, old.consequence,
    old.before_champion_user_id, old.before_contender_user_id,
    old.before_status_version, old.after_champion_user_id,
    old.after_contender_user_id, old.after_phase, old.confirmation_token_hash,
    old.preview_event_id, old.previewed_at, old.preview_expires_at, old.created_at
  ) is distinct from row(
    new.competition_id, new.user_id, new.released_status, new.consequence,
    new.before_champion_user_id, new.before_contender_user_id,
    new.before_status_version, new.after_champion_user_id,
    new.after_contender_user_id, new.after_phase, new.confirmation_token_hash,
    new.preview_event_id, new.previewed_at, new.preview_expires_at, new.created_at
  ) then
    raise exception 'voluntary status release preview facts are immutable';
  end if;
  return new;
end;
$$;

create trigger voluntary_status_releases_guard_update
before update on competition.voluntary_status_releases
for each row execute function competition.guard_voluntary_status_release_update();

create trigger voluntary_status_releases_reject_delete
before delete on competition.voluntary_status_releases
for each row execute function platform.reject_event_mutation();
