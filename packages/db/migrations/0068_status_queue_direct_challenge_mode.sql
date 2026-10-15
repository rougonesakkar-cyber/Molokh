alter table competition.challenge_queue_entries
  add column direct_challenge_mode text;

update competition.challenge_queue_entries
set direct_challenge_mode = case target_status
  when 'CHAMPION' then 'MANDATORY_TITLE'
  else 'MANDATORY_CONTENDER'
end
where kind = 'DIRECT_STATUS';

alter table competition.challenge_queue_entries
  add constraint challenge_queue_direct_challenge_mode_check check (
    (kind = 'DIRECT_STATUS' and direct_challenge_mode in (
      'MANDATORY_CONTENDER', 'OPTIONAL_TITLE', 'MANDATORY_TITLE'
    ))
    or (kind <> 'DIRECT_STATUS' and direct_challenge_mode is null)
  );
