alter table competition.challenges
  add column scheduling_extension_count integer not null default 0
    check (scheduling_extension_count between 0 and 1);
