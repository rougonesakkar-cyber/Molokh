alter table competition.challenge_queue_entries
  add column single_candidate_deadline_at timestamptz;

update competition.challenge_queue_entries
set single_candidate_deadline_at = single_candidate_since_at + interval '3 days'
where single_candidate_since_at is not null;

create index challenge_queue_single_candidate_deadline_idx
  on competition.challenge_queue_entries (single_candidate_deadline_at, queue_entry_id)
  where kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
    and single_candidate_since_at is not null;
