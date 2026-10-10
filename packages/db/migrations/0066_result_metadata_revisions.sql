create table competition.result_metadata_revisions (
  revision_id uuid primary key,
  result_id uuid not null references competition.results(result_id),
  source_result_version bigint not null check (source_result_version > 0),
  result_version bigint not null check (result_version > source_result_version),
  before_method_code text,
  after_method_code text,
  before_method_text text,
  after_method_text text,
  before_score_payload jsonb,
  after_score_payload jsonb,
  before_method_payload jsonb,
  after_method_payload jsonb,
  revised_by uuid not null references identity.users(user_id),
  revised_at timestamptz not null,
  unique (result_id, result_version),
  constraint result_metadata_revision_changes_value_check check (
    row(before_method_code, before_method_text, before_score_payload, before_method_payload)
      is distinct from
    row(after_method_code, after_method_text, after_score_payload, after_method_payload)
  )
);

create index result_metadata_revisions_result_order_idx
  on competition.result_metadata_revisions (result_id, result_version desc);

create trigger result_metadata_revisions_immutable
before update or delete on competition.result_metadata_revisions
for each row execute function platform.reject_event_mutation();
