create table community.membership_removal_cases (
  case_id uuid primary key,
  membership_id uuid not null references community.community_memberships(membership_id),
  community_id uuid not null references community.communities(community_id),
  competition_id uuid not null references competition.competitions(competition_id),
  subject_user_id uuid not null references identity.users(user_id),
  requested_by uuid not null references identity.users(user_id),
  subject_status text not null check (subject_status in ('ORDINARY', 'CHAMPION', 'CONTENDER')),
  state text not null check (
    state in (
      'REMOVED_APPEALABLE', 'UNDER_REVIEW', 'APPEALED',
      'CONFIRMED', 'REJECTED', 'OVERTURNED'
    )
  ),
  request_reason text not null check (length(btrim(request_reason)) between 10 and 1000),
  request_event_id uuid not null,
  requested_at timestamptz not null,
  appeal_deadline_at timestamptz,
  appeal_reason text check (appeal_reason is null or length(btrim(appeal_reason)) between 10 and 1000),
  appealed_at timestamptz,
  appeal_event_id uuid,
  reviewed_by uuid references identity.users(user_id),
  decision_reason text check (decision_reason is null or length(btrim(decision_reason)) between 10 and 1000),
  decision_event_id uuid,
  decided_at timestamptz,
  before_membership_version bigint not null check (before_membership_version > 0),
  after_membership_version bigint check (after_membership_version > before_membership_version),
  before_champion_user_id uuid references identity.users(user_id),
  before_contender_user_id uuid references identity.users(user_id),
  before_status_version bigint not null check (before_status_version >= 0),
  after_champion_user_id uuid references identity.users(user_id),
  after_contender_user_id uuid references identity.users(user_id),
  after_status_version bigint check (after_status_version > before_status_version),
  replacement_membership_id uuid references community.community_memberships(membership_id),
  cancelled_challenge_count integer not null default 0 check (cancelled_challenge_count >= 0),
  cancelled_booking_count integer not null default 0 check (cancelled_booking_count >= 0),
  invalidated_queue_entry_count integer not null default 0 check (invalidated_queue_entry_count >= 0),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint membership_removal_appeal_shape_check check (
    (
      subject_status = 'ORDINARY'
      and appeal_deadline_at is not null
    ) or (
      subject_status in ('CHAMPION', 'CONTENDER')
      and appeal_deadline_at is null
    )
  ),
  constraint membership_removal_appealed_shape_check check (
    (state <> 'APPEALED')
    or (appeal_reason is not null and appealed_at is not null and appeal_event_id is not null)
  ),
  constraint membership_removal_decision_shape_check check (
    (state not in ('CONFIRMED', 'REJECTED', 'OVERTURNED'))
    or (
      reviewed_by is not null and decision_reason is not null
      and decision_event_id is not null and decided_at is not null
    )
  )
);

create unique index membership_removal_one_live_case_uq
  on community.membership_removal_cases (membership_id)
  where state in ('REMOVED_APPEALABLE', 'UNDER_REVIEW', 'APPEALED');

create index membership_removal_central_queue_idx
  on community.membership_removal_cases (requested_at, case_id)
  where state in ('UNDER_REVIEW', 'APPEALED');

create index membership_removal_subject_history_idx
  on community.membership_removal_cases (subject_user_id, requested_at desc, case_id);

create table competition.process_holds (
  hold_id uuid primary key,
  aggregate_type text not null check (aggregate_type in ('CHALLENGE', 'MEMBERSHIP', 'COMPETITION')),
  aggregate_id uuid not null,
  reason text not null check (
    reason in (
      'COMMUNITY_PAUSE', 'SAFETY', 'STATUS_REVIEW', 'SYSTEM_OUTAGE',
      'ACCOUNT_ACCESS', 'DUPLICATE_ACCOUNT', 'CENTRAL'
    )
  ),
  state text not null check (state in ('ACTIVE', 'RELEASED')),
  deadline_policy text not null check (deadline_policy in ('PAUSE', 'CONTINUE')),
  source_case_id uuid references community.membership_removal_cases(case_id),
  created_by uuid not null references identity.users(user_id),
  released_by uuid references identity.users(user_id),
  started_at timestamptz not null,
  released_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint process_holds_release_shape_check check (
    (state = 'ACTIVE' and released_by is null and released_at is null)
    or (state = 'RELEASED' and released_by is not null and released_at is not null)
  )
);

create unique index process_holds_one_active_reason_uq
  on competition.process_holds (aggregate_type, aggregate_id, reason)
  where state = 'ACTIVE';

create index process_holds_source_case_idx
  on competition.process_holds (source_case_id)
  where source_case_id is not null;

create trigger membership_removal_cases_reject_delete
before delete on community.membership_removal_cases
for each row execute function platform.reject_event_mutation();

create trigger process_holds_reject_delete
before delete on competition.process_holds
for each row execute function platform.reject_event_mutation();
