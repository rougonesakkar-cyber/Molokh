import { createHash } from 'node:crypto';

import { type Kysely, sql } from 'kysely';

import type { Database } from './index.js';

export type ChatRetentionRecordClass = 'PERSONAL_CHAT' | 'SERVICE_CHAT';

export interface ChatRetentionCleanupIds {
  readonly runId: string;
  readonly auditId: string;
  readonly requestId: string;
}

export interface ChatRetentionCleanupResult {
  readonly recordClass: ChatRetentionRecordClass;
  readonly policyVersion: string;
  readonly retentionSeconds: number;
  readonly cutoffAt: string;
  readonly deletedCount: number;
  readonly payloadSetSha256: string | null;
}

interface PolicyRow {
  readonly policy_version: string;
  readonly retention_seconds: string;
}

interface CandidateRow {
  readonly revision_id: string;
  readonly payload_text: string;
}

function scopeFor(recordClass: ChatRetentionRecordClass): string {
  return recordClass === 'PERSONAL_CHAT' ? 'PERSONAL_MATCH' : 'CHALLENGE_SERVICE';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function cleanupExpiredChatPayloads(
  database: Kysely<Database>,
  recordClass: ChatRetentionRecordClass,
  ids: ChatRetentionCleanupIds,
  options: { readonly limit?: number; readonly now?: () => Date } = {},
): Promise<ChatRetentionCleanupResult> {
  const limit = options.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new TypeError('Chat retention cleanup limit must be an integer from 1 to 1000');
  }
  const occurredAt = (options.now ?? (() => new Date()))();
  if (Number.isNaN(occurredAt.getTime())) throw new TypeError('Cleanup time must be valid');
  const scope = scopeFor(recordClass);

  return database.transaction().execute(async (transaction) => {
    const policyResult = await sql<PolicyRow>`
      select policy_version, retention_seconds::text
      from platform.retention_policy_versions
      where record_class = ${recordClass}
        and effective_at <= ${occurredAt.toISOString()}::timestamptz
        and retention_seconds is not null
      order by effective_at desc, created_at desc, policy_id desc
      limit 1
    `.execute(transaction);
    const policy = policyResult.rows[0];
    if (!policy) throw new Error(`No effective retention policy for ${recordClass}`);
    const retentionSeconds = Number(policy.retention_seconds);
    if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds <= 0) {
      throw new Error(`Invalid retention policy duration for ${recordClass}`);
    }
    const cutoffAt = new Date(occurredAt.getTime() - retentionSeconds * 1_000);

    const candidates = await sql<CandidateRow>`
      select revision.revision_id, revision.payload::text as payload_text
      from social.chat_message_revisions as revision
      join social.chat_messages as message on message.message_id = revision.message_id
      join social.chats as chat on chat.chat_id = message.chat_id
      where chat.scope = ${scope}
        and revision.payload is not null
        and not exists (
          select 1 from social.chat_messages as recent
          where recent.chat_id = chat.chat_id
            and recent.updated_at >= ${cutoffAt.toISOString()}::timestamptz
        )
        and not exists (
          select 1 from social.chat_message_reports as report
          where report.message_id = message.message_id
        )
      order by revision.created_at, revision.revision_id
      for update of chat, message, revision skip locked
      limit ${limit}
    `.execute(transaction);

    const retainedHashes: string[] = [];
    for (const candidate of candidates.rows) {
      const payloadSha256 = sha256(candidate.payload_text);
      const updated = await sql<{ readonly revision_id: string }>`
        update social.chat_message_revisions
        set payload = null, payload_sha256 = ${payloadSha256},
            payload_deleted_at = ${occurredAt.toISOString()}::timestamptz,
            retention_policy_version = ${policy.policy_version}
        where revision_id = ${candidate.revision_id}::uuid and payload is not null
        returning revision_id
      `.execute(transaction);
      if (updated.rows.length === 1) {
        retainedHashes.push(`${candidate.revision_id}:${payloadSha256}`);
      }
    }

    const payloadSetSha256 = retainedHashes.length > 0
      ? sha256(retainedHashes.sort().join('\n'))
      : null;
    if (retainedHashes.length > 0) {
      const metadata = {
        recordClass,
        scope,
        policyVersion: policy.policy_version,
        retentionSeconds,
        cutoffAt: cutoffAt.toISOString(),
        deletedCount: retainedHashes.length,
        payloadSetSha256,
      };
      await sql`
        insert into platform.audit_events (
          audit_id, action, actor_id, actor_type, actor_roles, actor_scope_ids,
          aggregate_type, aggregate_id, transition_id, request_id,
          correlation_id, causation_id, reason_code, before_state, after_state,
          occurred_at, metadata
        ) values (
          ${ids.auditId}::uuid, 'DELETE_RETAINED_CHAT_PAYLOADS', null, 'SYSTEM',
          '[]'::jsonb, '{}'::uuid[], 'RetentionCleanupRun', ${ids.runId}::uuid,
          null, ${ids.requestId}::uuid, null, null, 'RETENTION_EXPIRED',
          'PAYLOADS_AVAILABLE', 'PAYLOADS_DELETED',
          ${occurredAt.toISOString()}::timestamptz, ${JSON.stringify(metadata)}::jsonb
        )
      `.execute(transaction);
    }

    return {
      recordClass,
      policyVersion: policy.policy_version,
      retentionSeconds,
      cutoffAt: cutoffAt.toISOString(),
      deletedCount: retainedHashes.length,
      payloadSetSha256,
    };
  });
}
