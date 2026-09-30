alter table competition.challenge_queue_entries
  add column single_candidate_since_at timestamptz;

alter table competition.challenge_queue_entries
  add constraint challenge_queue_single_candidate_window_check check (
    single_candidate_since_at is null
    or (kind = 'GENESIS_CANDIDATE' and state = 'WAITING')
  );

create index challenge_queue_single_candidate_window_idx
  on competition.challenge_queue_entries (single_candidate_since_at, queue_entry_id)
  where kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
    and single_candidate_since_at is not null;
