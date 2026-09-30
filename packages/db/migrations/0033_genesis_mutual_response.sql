create table competition.genesis_candidate_responses (
  response_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  queue_entry_id uuid not null references competition.challenge_queue_entries(queue_entry_id),
  user_id uuid not null references identity.users(user_id),
  decision text not null check (decision in ('ACCEPT', 'DECLINE')),
  responded_at timestamptz not null,
  unique (challenge_id, user_id),
  unique (challenge_id, queue_entry_id)
);

create index genesis_candidate_responses_challenge_idx
  on competition.genesis_candidate_responses (challenge_id, responded_at, response_id);

create trigger genesis_candidate_responses_immutable
before update or delete on competition.genesis_candidate_responses
for each row execute function platform.reject_event_mutation();
