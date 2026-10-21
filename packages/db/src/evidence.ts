import {
  EvidenceConflictError,
  EvidencePermissionDeniedError,
  EvidenceValidationError,
  assertExpectedVersion,
  canAccessEvidenceOriginal,
  evidenceMaximumAggregateBytes,
  evidenceMaximumAttachments,
  evidenceStateForScan,
  normalizeEvidenceSubmission,
  type CommandEnvelope,
  type EvidenceAttachmentState,
  type EvidenceScanOutcome,
  type EvidenceScopeType,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface TrustedEvidenceObject {
  readonly storageReceiptId: string;
  readonly originalFileName: string;
  readonly declaredMimeType: string;
  readonly detectedMimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number | null;
  readonly objectReference: string;
  readonly checksumSha256: string;
  readonly encryptionKeyReference: string;
}

export interface SubmitEvidenceAttachmentPayload {
  readonly scopeType: EvidenceScopeType;
  readonly scopeId: string;
  readonly expectedScopeVersion: number;
  readonly object: TrustedEvidenceObject;
}

export interface RecordEvidenceScanPayload {
  readonly attachmentId: string;
  readonly outcome: EvidenceScanOutcome;
  readonly reasonCode: string | null;
  readonly scanProviderReference: string;
}

export interface EvidenceEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface EvidenceAttachmentProjection {
  readonly attachmentId: string;
  readonly scopeType: EvidenceScopeType;
  readonly scopeId: string;
  readonly submitterUserId: string;
  readonly state: EvidenceAttachmentState;
  readonly fileName: string;
  readonly mediaKind: 'IMAGE' | 'AUDIO' | 'VIDEO';
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number | null;
  readonly submittedAt: string;
  readonly scannedAt: string | null;
  readonly canAccessOriginal: boolean;
  readonly version: number;
}

export interface EvidenceUploadPreparation {
  readonly scopeType: EvidenceScopeType;
  readonly scopeId: string;
  readonly scopeVersion: number;
  readonly attachmentCount: number;
  readonly aggregateSizeBytes: number;
  readonly maximumAttachments: number;
  readonly maximumAggregateBytes: number;
}

export interface EvidenceOriginalAccess {
  readonly attachmentId: string;
  readonly scopeType: EvidenceScopeType;
  readonly scopeId: string;
  readonly objectReference: string;
  readonly encryptionKeyReference: string;
  readonly fileName: string;
  readonly mimeType: string;
}

interface ScopeRow {
  readonly scope_type: EvidenceScopeType;
  readonly scope_id: string;
  readonly state: string;
  readonly version: string;
  readonly appellant_or_reporter_user_id: string;
  readonly subject_user_id: string | null;
  readonly pair_low_id: string | null;
  readonly pair_high_id: string | null;
  readonly coach_user_id: string | null;
}

interface AttachmentRow {
  readonly attachment_id: string;
  readonly scope_type: EvidenceScopeType;
  readonly scope_id: string;
  readonly submitter_user_id: string;
  readonly state: EvidenceAttachmentState;
  readonly original_file_name: string;
  readonly detected_mime_type: string;
  readonly media_kind: 'IMAGE' | 'AUDIO' | 'VIDEO';
  readonly size_bytes: string;
  readonly duration_seconds: string | null;
  readonly object_reference: string;
  readonly encryption_key_reference: string;
  readonly submitted_at: Date;
  readonly scanned_at: Date | null;
  readonly version: string;
}

async function hasCentralGrant(
  database: Kysely<Database> | Transaction<Database>, userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`select exists (
    select 1 from community.role_grants
    where user_id = ${userId}::uuid and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
  ) as allowed`.execute(database);
  return result.rows[0]?.allowed === true;
}

async function readScope(
  database: Kysely<Database> | Transaction<Database>,
  scopeType: EvidenceScopeType,
  scopeId: string,
  lock = false,
): Promise<ScopeRow | undefined> {
  if (scopeType === 'RESULT_APPEAL') {
    const result = await sql<ScopeRow>`
      select 'RESULT_APPEAL'::text as scope_type, appeal.appeal_id as scope_id,
        appeal.state, appeal.version::text as version,
        appeal.appellant_user_id as appellant_or_reporter_user_id,
        null::uuid as subject_user_id, challenge.pair_low_id, challenge.pair_high_id,
        result.coach_user_id
      from competition.appeals appeal
      join competition.challenges challenge on challenge.challenge_id = appeal.challenge_id
      join competition.results result on result.result_id = appeal.result_id
      where appeal.appeal_id = ${scopeId}::uuid
      ${lock ? sql`for update of appeal` : sql``}
    `.execute(database);
    return result.rows[0];
  }
  const result = await sql<ScopeRow>`
    select 'SAFETY_CASE'::text as scope_type, moderation_case.case_id as scope_id,
      moderation_case.state, moderation_case.version::text as version,
      moderation_case.reporter_user_id as appellant_or_reporter_user_id,
      moderation_case.subject_user_id, session.pair_low_id, session.pair_high_id,
      session.coach_user_id
    from governance.moderation_cases moderation_case
    join scheduling.sessions session on session.session_id = moderation_case.session_id
    where moderation_case.case_id = ${scopeId}::uuid and moderation_case.case_type = 'SAFETY'
    ${lock ? sql`for update of moderation_case` : sql``}
  `.execute(database);
  return result.rows[0];
}

function scopeIsOpen(row: ScopeRow): boolean {
  return row.scope_type === 'RESULT_APPEAL'
    ? ['SUBMITTED', 'UNDER_REVIEW'].includes(row.state)
    : ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW'].includes(row.state);
}

async function assertScopeParticipant(
  database: Kysely<Database> | Transaction<Database>, row: ScopeRow, actorUserId: string,
): Promise<boolean> {
  const central = await hasCentralGrant(database, actorUserId);
  const participants = [row.appellant_or_reporter_user_id, row.subject_user_id,
    row.pair_low_id, row.pair_high_id, row.coach_user_id].filter(Boolean);
  if (!central && !participants.includes(actorUserId)) throw new EvidencePermissionDeniedError();
  return central;
}

async function scopeUsage(
  database: Kysely<Database> | Transaction<Database>, scopeType: EvidenceScopeType, scopeId: string,
): Promise<{ readonly count: number; readonly bytes: number }> {
  const result = await sql<{ readonly attachment_count: string; readonly aggregate_bytes: string }>`
    select count(*)::text as attachment_count,
      coalesce(sum(size_bytes), 0)::text as aggregate_bytes
    from governance.evidence_attachments
    where scope_type = ${scopeType} and scope_id = ${scopeId}::uuid
  `.execute(database);
  return { count: Number(result.rows[0]?.attachment_count ?? '0'),
    bytes: Number(result.rows[0]?.aggregate_bytes ?? '0') };
}

async function attachmentRow(
  database: Kysely<Database> | Transaction<Database>, attachmentId: string, lock = false,
): Promise<AttachmentRow | undefined> {
  const result = await sql<AttachmentRow>`
    select attachment_id, scope_type, scope_id, submitter_user_id, state,
      original_file_name, detected_mime_type, media_kind, size_bytes::text,
      duration_seconds::text, object_reference, encryption_key_reference,
      submitted_at, scanned_at, version::text
    from governance.evidence_attachments
    where attachment_id = ${attachmentId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0];
}

function projection(row: AttachmentRow, viewerUserId: string, viewerIsCentral: boolean): EvidenceAttachmentProjection {
  return {
    attachmentId: row.attachment_id, scopeType: row.scope_type, scopeId: row.scope_id,
    submitterUserId: row.submitter_user_id, state: row.state,
    fileName: row.original_file_name, mediaKind: row.media_kind,
    mimeType: row.detected_mime_type, sizeBytes: Number(row.size_bytes),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    submittedAt: row.submitted_at.toISOString(), scannedAt: row.scanned_at?.toISOString() ?? null,
    canAccessOriginal: canAccessEvidenceOriginal({ state: row.state, viewerUserId,
      submitterUserId: row.submitter_user_id, viewerIsCentral }),
    version: Number(row.version),
  };
}

export async function prepareEvidenceUpload(
  database: Kysely<Database>, scopeType: EvidenceScopeType, scopeId: string,
  actorUserId: string,
): Promise<EvidenceUploadPreparation> {
  const row = await readScope(database, scopeType, scopeId);
  if (!row) throw new EvidencePermissionDeniedError();
  if (!scopeIsOpen(row)) throw new EvidenceConflictError('EVIDENCE_SCOPE_CLOSED');
  await assertScopeParticipant(database, row, actorUserId);
  const usage = await scopeUsage(database, scopeType, scopeId);
  if (usage.count >= evidenceMaximumAttachments || usage.bytes >= evidenceMaximumAggregateBytes) {
    throw new EvidenceConflictError('EVIDENCE_LIMIT_EXCEEDED');
  }
  return { scopeType, scopeId, scopeVersion: Number(row.version), attachmentCount: usage.count,
    aggregateSizeBytes: usage.bytes, maximumAttachments: evidenceMaximumAttachments,
    maximumAggregateBytes: evidenceMaximumAggregateBytes };
}

export async function submitEvidenceAttachment(
  database: Kysely<Database>, command: CommandEnvelope<SubmitEvidenceAttachmentPayload>,
  ids: EvidenceEffectIds, now?: () => Date,
): Promise<ExecutedCommand<EvidenceAttachmentProjection>> {
  if (!command.actor.id || command.commandType !== 'SUBMIT_EVIDENCE_ATTACHMENT'
    || command.aggregateType !== 'EvidenceAttachment' || command.expectedVersion !== 0) {
    throw new EvidencePermissionDeniedError();
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const scope = await readScope(transaction, command.payload.scopeType, command.payload.scopeId, true);
      if (!scope) throw new EvidencePermissionDeniedError();
      if (!scopeIsOpen(scope)) throw new EvidenceConflictError('EVIDENCE_SCOPE_CLOSED');
      await assertScopeParticipant(transaction, scope, command.actor.id!);
      assertExpectedVersion(Number(scope.version), command.payload.expectedScopeVersion);
      const usage = await scopeUsage(transaction, command.payload.scopeType, command.payload.scopeId);
      const normalized = normalizeEvidenceSubmission({
        declaredMimeType: command.payload.object.declaredMimeType,
        detectedMimeType: command.payload.object.detectedMimeType,
        sizeBytes: command.payload.object.sizeBytes,
        durationSeconds: command.payload.object.durationSeconds,
        existingCount: usage.count, existingAggregateBytes: usage.bytes,
      });
      if (!/^[0-9a-f]{64}$/.test(command.payload.object.checksumSha256)
        || command.payload.object.originalFileName.trim().length < 1
        || command.payload.object.originalFileName.trim().length > 255
        || command.payload.object.objectReference.trim().length === 0
        || command.payload.object.encryptionKeyReference.trim().length === 0
        || command.payload.object.storageReceiptId.trim().length === 0) {
        throw new EvidenceValidationError('EVIDENCE_INPUT_INVALID');
      }
      const submittedAt = context.occurredAt.toISOString();
      await sql`
        insert into governance.evidence_attachments (
          attachment_id, scope_type, scope_id, appeal_id, moderation_case_id,
          submitter_user_id, state, original_file_name, declared_mime_type,
          detected_mime_type, media_kind, size_bytes, duration_seconds,
          object_reference, checksum_sha256, encryption_key_reference,
          storage_receipt_id, submitted_at, version
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.scopeType}, ${command.payload.scopeId}::uuid,
          ${command.payload.scopeType === 'RESULT_APPEAL' ? command.payload.scopeId : null}::uuid,
          ${command.payload.scopeType === 'SAFETY_CASE' ? command.payload.scopeId : null}::uuid,
          ${command.actor.id}::uuid, 'PENDING_SCAN',
          ${command.payload.object.originalFileName.trim()}, ${normalized.declaredMimeType},
          ${normalized.detectedMimeType}, ${normalized.mediaKind}, ${normalized.sizeBytes},
          ${normalized.durationSeconds}, ${command.payload.object.objectReference},
          ${command.payload.object.checksumSha256}, ${command.payload.object.encryptionKeyReference},
          ${command.payload.object.storageReceiptId}, ${submittedAt}::timestamptz,
          ${context.nextVersion}
        )
      `.execute(transaction);
      const created = (await attachmentRow(transaction, command.aggregateId))!;
      const response = projection(created, command.actor.id!, false);
      const publicPayload = { attachmentId: command.aggregateId,
        scopeType: command.payload.scopeType, scopeId: command.payload.scopeId,
        state: 'PENDING_SCAN', mediaKind: normalized.mediaKind, sizeBytes: normalized.sizeBytes,
        submittedAt };
      return { responseStatus: 201, response,
        event: { eventId: ids.eventId, eventName: 'EvidenceAttachmentSubmitted', schemaVersion: 1,
          transitionId: 'EVI-01', payload: publicPayload, metadata: { policyVersion: 'evidence-mvp-v1' } },
        audit: { auditId: ids.auditId, action: 'SUBMIT_EVIDENCE_ATTACHMENT',
          transitionId: 'EVI-01', reasonCode: null, beforeState: null, afterState: 'PENDING_SCAN',
          metadata: { scopeType: command.payload.scopeType, scopeId: command.payload.scopeId,
            storageReceiptId: command.payload.object.storageReceiptId } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'governance.evidence.submitted.v1',
          payload: publicPayload }],
      };
    } });
}

export async function recordEvidenceScan(
  database: Kysely<Database>, command: CommandEnvelope<RecordEvidenceScanPayload>,
  ids: EvidenceEffectIds, now?: () => Date,
): Promise<ExecutedCommand<EvidenceAttachmentProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.actor.id !== null
    || command.commandType !== 'RECORD_EVIDENCE_SCAN'
    || command.aggregateType !== 'EvidenceAttachment'
    || command.aggregateId !== command.payload.attachmentId) {
    throw new EvidencePermissionDeniedError();
  }
  return executeCriticalCommand(database, { command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await attachmentRow(transaction, command.aggregateId, true);
      if (!row) throw new EvidenceConflictError('EVIDENCE_NOT_FOUND');
      assertExpectedVersion(Number(row.version), command.expectedVersion);
      if (row.state !== 'PENDING_SCAN') throw new EvidenceConflictError('EVIDENCE_SCAN_STATE_INVALID');
      const state = evidenceStateForScan(command.payload.outcome);
      const reasonCode = command.payload.reasonCode?.trim() || null;
      if (state === 'QUARANTINED' && !reasonCode) {
        throw new EvidenceValidationError('EVIDENCE_INPUT_INVALID');
      }
      const scannedAt = context.occurredAt.toISOString();
      await sql`
        update governance.evidence_attachments
        set state = ${state}, scan_outcome = ${command.payload.outcome},
          scan_reason_code = ${state === 'QUARANTINED' ? reasonCode : null},
          scan_provider_reference = ${command.payload.scanProviderReference},
          scanned_at = ${scannedAt}::timestamptz, version = ${context.nextVersion}
        where attachment_id = ${row.attachment_id}::uuid and state = 'PENDING_SCAN'
          and version = ${Number(row.version)}
      `.execute(transaction);
      const updated = (await attachmentRow(transaction, row.attachment_id))!;
      const response = projection(updated, '', true);
      const publicPayload = { attachmentId: row.attachment_id, scopeType: row.scope_type,
        scopeId: row.scope_id, state, scannedAt };
      const accepted = state === 'AVAILABLE';
      return { responseStatus: 200, response,
        event: { eventId: ids.eventId,
          eventName: accepted ? 'EvidenceAttachmentAccepted' : 'EvidenceAttachmentQuarantined',
          schemaVersion: 1, transitionId: accepted ? 'EVI-02' : 'EVI-03',
          payload: publicPayload, metadata: { policyVersion: 'evidence-mvp-v1' } },
        audit: { auditId: ids.auditId, action: 'RECORD_EVIDENCE_SCAN',
          transitionId: accepted ? 'EVI-02' : 'EVI-03', reasonCode,
          beforeState: 'PENDING_SCAN', afterState: state,
          metadata: { scanProviderReference: command.payload.scanProviderReference,
            scanOutcome: command.payload.outcome } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: accepted ? 'governance.evidence.available.v1' : 'governance.evidence.quarantined.v1',
          payload: publicPayload }],
      };
    } });
}

export async function listEvidenceAttachmentsForViewer(
  database: Kysely<Database>, scopeType: EvidenceScopeType, scopeId: string, viewerUserId: string,
): Promise<readonly EvidenceAttachmentProjection[]> {
  const scope = await readScope(database, scopeType, scopeId);
  if (!scope) throw new EvidencePermissionDeniedError();
  const central = await assertScopeParticipant(database, scope, viewerUserId);
  const result = await sql<AttachmentRow>`
    select attachment_id, scope_type, scope_id, submitter_user_id, state,
      original_file_name, detected_mime_type, media_kind, size_bytes::text,
      duration_seconds::text, object_reference, encryption_key_reference,
      submitted_at, scanned_at, version::text
    from governance.evidence_attachments
    where scope_type = ${scopeType} and scope_id = ${scopeId}::uuid
      and (${central} or submitter_user_id = ${viewerUserId}::uuid)
    order by submitted_at, attachment_id
  `.execute(database);
  return result.rows.map((row) => projection(row, viewerUserId, central));
}

export async function readEvidenceOriginalAccess(
  database: Kysely<Database>, scopeType: EvidenceScopeType, scopeId: string,
  attachmentId: string, viewerUserId: string,
): Promise<EvidenceOriginalAccess> {
  const row = await attachmentRow(database, attachmentId);
  if (!row || row.scope_type !== scopeType || row.scope_id !== scopeId) {
    throw new EvidenceConflictError('EVIDENCE_NOT_FOUND');
  }
  const central = await hasCentralGrant(database, viewerUserId);
  if (!canAccessEvidenceOriginal({ state: row.state, viewerUserId,
    submitterUserId: row.submitter_user_id, viewerIsCentral: central })) {
    throw new EvidencePermissionDeniedError();
  }
  return { attachmentId, scopeType: row.scope_type, scopeId: row.scope_id,
    objectReference: row.object_reference,
    encryptionKeyReference: row.encryption_key_reference,
    fileName: row.original_file_name, mimeType: row.detected_mime_type };
}
