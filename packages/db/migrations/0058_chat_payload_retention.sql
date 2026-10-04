alter table social.chat_message_revisions
  alter column payload drop not null,
  add column payload_sha256 text,
  add column payload_deleted_at timestamptz,
  add column retention_policy_version text,
  add constraint chat_message_revision_payload_retention_shape_check check (
    (payload is not null and payload_sha256 is null and payload_deleted_at is null
      and retention_policy_version is null)
    or (payload is null and payload_sha256 ~ '^[0-9a-f]{64}$'
      and payload_deleted_at is not null and retention_policy_version is not null)
  );

create index chat_message_revisions_retention_pending_idx
  on social.chat_message_revisions (created_at, revision_id)
  where payload is not null;
