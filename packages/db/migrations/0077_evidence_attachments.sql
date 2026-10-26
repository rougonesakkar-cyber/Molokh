create table governance.evidence_attachments (
  attachment_id uuid primary key,
  scope_type text not null check (scope_type in ('RESULT_APPEAL', 'SAFETY_CASE')),
  scope_id uuid not null,
  appeal_id uuid references competition.appeals(appeal_id),
  moderation_case_id uuid references governance.moderation_cases(case_id),
  submitter_user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('PENDING_SCAN', 'AVAILABLE', 'QUARANTINED')),
  original_file_name text not null check (length(btrim(original_file_name)) between 1 and 255),
  declared_mime_type text not null,
  detected_mime_type text not null,
  media_kind text not null check (media_kind in ('IMAGE', 'AUDIO', 'VIDEO')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  duration_seconds numeric(8,3),
  object_reference text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  encryption_key_reference text not null,
  storage_receipt_id text not null unique,
  scan_outcome text check (scan_outcome in ('CLEAN', 'MALWARE', 'CONTENT_REJECTED', 'TYPE_REJECTED', 'UNCERTAIN')),
  scan_reason_code text,
  scan_provider_reference text,
  scanned_at timestamptz,
  submitted_at timestamptz not null,
  version bigint not null check (version > 0),
  constraint evidence_attachment_scope_shape_check check (
    (scope_type = 'RESULT_APPEAL' and scope_id = appeal_id
      and appeal_id is not null and moderation_case_id is null)
    or (scope_type = 'SAFETY_CASE' and scope_id = moderation_case_id
      and appeal_id is null and moderation_case_id is not null)
  ),
  constraint evidence_attachment_duration_shape_check check (
    (media_kind = 'IMAGE' and duration_seconds is null)
    or (media_kind in ('AUDIO', 'VIDEO') and duration_seconds > 0 and duration_seconds <= 60)
  ),
  constraint evidence_attachment_scan_shape_check check (
    (state = 'PENDING_SCAN' and scan_outcome is null and scan_reason_code is null
      and scan_provider_reference is null and scanned_at is null)
    or (state = 'AVAILABLE' and scan_outcome = 'CLEAN' and scanned_at is not null)
    or (state = 'QUARANTINED' and scan_outcome in (
      'MALWARE', 'CONTENT_REJECTED', 'TYPE_REJECTED', 'UNCERTAIN'
    ) and scan_reason_code is not null and scanned_at is not null)
  )
);

create index evidence_attachments_scope_idx
  on governance.evidence_attachments (scope_type, scope_id, submitted_at, attachment_id);

create index evidence_attachments_scan_queue_idx
  on governance.evidence_attachments (submitted_at, attachment_id)
  where state = 'PENDING_SCAN';

create function governance.guard_evidence_attachment_mutation()
returns trigger language plpgsql as $$
begin
  if row(
    old.scope_type, old.scope_id, old.appeal_id, old.moderation_case_id,
    old.submitter_user_id, old.original_file_name, old.declared_mime_type,
    old.detected_mime_type, old.media_kind, old.size_bytes, old.duration_seconds,
    old.object_reference, old.checksum_sha256, old.encryption_key_reference,
    old.storage_receipt_id, old.submitted_at
  ) is distinct from row(
    new.scope_type, new.scope_id, new.appeal_id, new.moderation_case_id,
    new.submitter_user_id, new.original_file_name, new.declared_mime_type,
    new.detected_mime_type, new.media_kind, new.size_bytes, new.duration_seconds,
    new.object_reference, new.checksum_sha256, new.encryption_key_reference,
    new.storage_receipt_id, new.submitted_at
  ) then
    raise exception 'EvidenceAttachment source facts are immutable';
  end if;
  if old.state <> 'PENDING_SCAN' or new.state not in ('AVAILABLE', 'QUARANTINED')
    or new.version <> old.version + 1 then
    raise exception 'EvidenceAttachment scan transition is invalid';
  end if;
  return new;
end;
$$;

create trigger evidence_attachment_scan_transition_guard
before update on governance.evidence_attachments
for each row execute function governance.guard_evidence_attachment_mutation();

create trigger evidence_attachment_delete_rejected
before delete on governance.evidence_attachments
for each row execute function platform.reject_event_mutation();
