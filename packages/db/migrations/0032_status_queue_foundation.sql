alter table competition.competitions
  drop constraint if exists competitions_phase_check;

update competition.competitions
set phase = case phase
  when 'CHAMPION_ESTABLISHED' then 'CONTENDER_VACANT_OPEN'
  when 'FULLY_ESTABLISHED' then 'RUNNING'
  else phase
end;

alter table competition.competitions
  add constraint competitions_phase_check check (
    phase in (
      'FOUNDING_OPEN', 'FOUNDING_CHALLENGE', 'RUNNING',
      'CONTENDER_VACANT_OPEN', 'CONTENDER_GENESIS', 'CLOSED'
    )
  );

create table competition.challenge_queue_entries (
  queue_entry_id uuid primary key,
  competition_id uuid not null references competition.competitions(competition_id),
  initiator_user_id uuid not null references identity.users(user_id),
  target_status text not null check (target_status in ('CHAMPION', 'CONTENDER')),
  kind text not null check (
    kind in ('DIRECT_STATUS', 'GENESIS_CANDIDATE', 'PREBOOKED_CONVERSION')
  ),
  state text not null check (
    state in (
      'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED',
      'ACTIVATED', 'CONSUMED', 'WITHDRAWN', 'INVALIDATED', 'EXPIRED'
    )
  ),
  bound_holder_user_id uuid references identity.users(user_id),
  linked_challenge_id uuid references competition.challenges(challenge_id),
  source_type text check (source_type in ('DIRECT', 'BOOKING', 'GROUP_PLAN')),
  source_id uuid,
  submitted_at timestamptz not null default clock_timestamp(),
  reconfirmation_deadline_at timestamptz,
  decided_at timestamptz,
  terminal_reason text,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint challenge_queue_reconfirmation_shape_check check (
    (state = 'RECONFIRMATION_REQUIRED' and reconfirmation_deadline_at is not null)
    or (state <> 'RECONFIRMATION_REQUIRED' and reconfirmation_deadline_at is null)
  ),
  constraint challenge_queue_terminal_shape_check check (
    (state in ('CONSUMED', 'WITHDRAWN', 'INVALIDATED', 'EXPIRED') and decided_at is not null)
    or (state not in ('CONSUMED', 'WITHDRAWN', 'INVALIDATED', 'EXPIRED') and decided_at is null)
  ),
  constraint challenge_queue_direct_source_check check (
    (kind = 'PREBOOKED_CONVERSION' and source_type in ('BOOKING', 'GROUP_PLAN') and source_id is not null)
    or (kind <> 'PREBOOKED_CONVERSION' and source_type = 'DIRECT' and source_id is null)
  )
);

create unique index challenge_queue_one_live_intent_uq
  on competition.challenge_queue_entries (competition_id, initiator_user_id, target_status)
  where state in (
    'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
  );

create index challenge_queue_fifo_idx
  on competition.challenge_queue_entries (
    competition_id, target_status, submitted_at, queue_entry_id
  )
  where state in (
    'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
  );

create index challenge_queue_initiator_history_idx
  on competition.challenge_queue_entries (
    initiator_user_id, submitted_at desc, queue_entry_id
  );
