alter table scheduling.group_offerings
  add column coach_user_id uuid references identity.users(user_id);

update scheduling.group_plans
set offering_snapshot = offering_snapshot || jsonb_build_object('coachUserId', null)
where not (offering_snapshot ? 'coachUserId');

create index group_offerings_coach_start_idx
  on scheduling.group_offerings (coach_user_id, start_at, group_offering_id)
  where coach_user_id is not null and state = 'PUBLISHED';

create table scheduling.group_plan_official_conversions (
  conversion_id uuid primary key,
  group_plan_id uuid not null references scheduling.group_plans(group_plan_id),
  competition_id uuid not null references competition.competitions(competition_id),
  requested_by_user_id uuid not null references identity.users(user_id),
  coach_user_id uuid not null references identity.users(user_id),
  state text not null check (
    state in ('PENDING_CONFIRMATION', 'CONVERTED', 'DECLINED', 'EXPIRED', 'INVALIDATED')
  ),
  confirmation_deadline_at timestamptz not null,
  challenge_id uuid unique references competition.challenges(challenge_id),
  booking_id uuid unique references scheduling.bookings(booking_id),
  session_id uuid unique references scheduling.sessions(session_id),
  terminal_reason text,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  constraint group_plan_official_conversions_terminal_shape_check check (
    (state = 'PENDING_CONFIRMATION' and decided_at is null)
    or (state <> 'PENDING_CONFIRMATION' and decided_at is not null)
  ),
  constraint group_plan_official_conversions_resource_shape_check check (
    (state = 'CONVERTED' and challenge_id is not null and booking_id is not null and session_id is not null)
    or (state <> 'CONVERTED' and challenge_id is null and booking_id is null and session_id is null)
  )
);

create unique index group_plan_official_conversions_one_live_plan_uq
  on scheduling.group_plan_official_conversions (group_plan_id)
  where state = 'PENDING_CONFIRMATION';

create index group_plan_official_conversions_pending_idx
  on scheduling.group_plan_official_conversions (confirmation_deadline_at, conversion_id)
  where state = 'PENDING_CONFIRMATION';

create table scheduling.group_plan_conversion_confirmations (
  confirmation_id uuid primary key,
  conversion_id uuid not null references scheduling.group_plan_official_conversions(conversion_id),
  actor_user_id uuid not null references identity.users(user_id),
  required_role text not null check (
    required_role in ('ATHLETE_LOW', 'ATHLETE_HIGH', 'COACH')
  ),
  decision text not null check (decision in ('ACCEPT', 'DECLINE')),
  ruleset_acknowledged boolean not null default false,
  decided_at timestamptz not null,
  policy_version text not null,
  unique (conversion_id, actor_user_id),
  unique (conversion_id, required_role)
);

create trigger group_plan_conversion_confirmations_immutable
before update or delete on scheduling.group_plan_conversion_confirmations
for each row execute function platform.reject_event_mutation();
