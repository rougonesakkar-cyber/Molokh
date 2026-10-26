import {
  SCHEDULING_POLICY_VERSION,
  SchedulingPermissionDeniedError,
  assertEnforcementAppealReviewCanStart,
  assertExpectedVersion,
  normalizeEnforcementAppealRevocation,
  normalizeEnforcementAppealSubmission,
  type CommandEnvelope,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type OutboxDraft,
  type RelatedDomainEventDraft,
} from './platform-command.js';

export type EnforcementAppealState = 'SUBMITTED' | 'UNDER_REVIEW' | 'DECIDED_REVOKED';

export interface EnforcementAppealProjection {
  readonly appealId: string;
  readonly enforcementId: string;
  readonly subjectUserId: string;
  readonly state: EnforcementAppealState;
  readonly statement: string;
  readonly submittedAt: string;
  readonly appealDeadlineAt: string;
  readonly assignedReviewerUserId: string | null;
  readonly reviewStartedAt: string | null;
  readonly decisionReason: string | null;
  readonly decidedAt: string | null;
  readonly enforcementState: 'ACTIVE' | 'REVOKED';
  readonly enforcementVersion: number;
  readonly accountState: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly restrictionRemainsActive: boolean;
  readonly viewerCanStartReview: boolean;
  readonly viewerCanDecide: boolean;
  readonly version: number;
}

export interface ActiveEnforcementAppealContext {
  readonly enforcementId: string;
  readonly enforcementState: 'ACTIVE' | 'REVOKED';
  readonly appealDeadlineAt: string;
  readonly enforcementVersion: number;
  readonly accountState: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly restrictionRemainsActive: boolean;
  readonly appeal: EnforcementAppealProjection | null;
}

export interface SubmitEnforcementAppealPayload {
  readonly enforcementId: string;
  readonly expectedEnforcementVersion: number;
  readonly statement: string;
}

export interface StartEnforcementAppealReviewPayload {
  readonly appealId: string;
}

export interface RevokeEnforcementAppealPayload {
  readonly appealId: string;
  readonly reason: string;
}

export interface EnforcementAppealEffectIds {
  readonly appealId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

export interface EnforcementAppealReviewEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

export interface EnforcementAppealRevocationEffectIds {
  readonly eventId: string;
  readonly enforcementEventId: string;
  readonly holdEventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly enforcementOutboxMessageId: string;
  readonly holdOutboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
}

interface EnforcementRow {
  readonly enforcement_id: string;
  readonly subject_user_id: string;
  readonly enforcement_type: 'ACCOUNT_RESTRICTION';
  readonly enforcement_state: 'ACTIVE' | 'REVOKED';
  readonly appeal_deadline_at: Date;
  readonly enforcement_version: string;
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly applied_by_user_id: string;
  readonly reporter_user_id: string;
  readonly source_case_id: string;
}

interface AppealRow extends EnforcementRow {
  readonly appeal_id: string;
  readonly appeal_subject_user_id: string;
  readonly appeal_state: EnforcementAppealState;
  readonly statement: string;
  readonly submitted_at: Date;
  readonly assigned_reviewer_user_id: string | null;
  readonly review_started_at: Date | null;
  readonly decision_reason: string | null;
  readonly decided_at: Date | null;
  readonly appeal_version: string;
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

async function enforcementRow(
  database: Kysely<Database> | Transaction<Database>, enforcementId: string,
  lock = false,
): Promise<EnforcementRow | undefined> {
  const result = await sql<EnforcementRow>`
    select enforcement.enforcement_id, enforcement.subject_user_id,
      enforcement.enforcement_type, enforcement.state as enforcement_state,
      enforcement.appeal_deadline_at,
      enforcement.version::text as enforcement_version,
      subject.account_state, enforcement.applied_by_user_id,
      moderation_case.reporter_user_id, enforcement.source_case_id
    from governance.enforcements enforcement
    join identity.users subject on subject.user_id = enforcement.subject_user_id
    join governance.moderation_cases moderation_case
      on moderation_case.case_id = enforcement.source_case_id
    where enforcement.enforcement_id = ${enforcementId}::uuid
    ${lock ? sql`for update of enforcement, subject` : sql``}
  `.execute(database);
  return result.rows[0];
}

async function appealRows(
  database: Kysely<Database> | Transaction<Database>, appealId?: string,
  lock = false,
): Promise<readonly AppealRow[]> {
  const result = await sql<AppealRow>`
    select appeal.appeal_id, appeal.enforcement_id,
      appeal.subject_user_id as appeal_subject_user_id,
      appeal.state as appeal_state, appeal.statement, appeal.submitted_at,
      appeal.assigned_reviewer_user_id, appeal.review_started_at,
      appeal.decision_reason, appeal.decided_at,
      appeal.version::text as appeal_version,
      enforcement.subject_user_id, enforcement.enforcement_type,
      enforcement.state as enforcement_state, enforcement.appeal_deadline_at,
      enforcement.version::text as enforcement_version,
      subject.account_state, enforcement.applied_by_user_id,
      moderation_case.reporter_user_id, enforcement.source_case_id
    from governance.enforcement_appeals appeal
    join governance.enforcements enforcement
      on enforcement.enforcement_id = appeal.enforcement_id
    join identity.users subject on subject.user_id = enforcement.subject_user_id
    join governance.moderation_cases moderation_case
      on moderation_case.case_id = enforcement.source_case_id
    where (${appealId ?? null}::uuid is null or appeal.appeal_id = ${appealId ?? null}::uuid)
    order by appeal.submitted_at, appeal.appeal_id
    ${lock ? sql`for update of appeal, enforcement, subject` : sql``}
  `.execute(database);
  return result.rows;
}

function project(row: AppealRow, viewerUserId: string, viewerIsCentral: boolean): EnforcementAppealProjection {
  return {
    appealId: row.appeal_id,
    enforcementId: row.enforcement_id,
    subjectUserId: row.subject_user_id,
    state: row.appeal_state,
    statement: row.statement,
    submittedAt: row.submitted_at.toISOString(),
    appealDeadlineAt: row.appeal_deadline_at.toISOString(),
    assignedReviewerUserId: row.assigned_reviewer_user_id,
    reviewStartedAt: row.review_started_at?.toISOString() ?? null,
    decisionReason: row.decision_reason,
    decidedAt: row.decided_at?.toISOString() ?? null,
    enforcementState: row.enforcement_state,
    enforcementVersion: Number(row.enforcement_version),
    accountState: row.account_state,
    restrictionRemainsActive: row.enforcement_state === 'ACTIVE',
    viewerCanStartReview: viewerIsCentral && row.appeal_state === 'SUBMITTED'
      && ![row.subject_user_id, row.applied_by_user_id, row.reporter_user_id].includes(viewerUserId),
    viewerCanDecide: viewerIsCentral && row.appeal_state === 'UNDER_REVIEW'
      && row.assigned_reviewer_user_id === viewerUserId
      && ![row.subject_user_id, row.applied_by_user_id, row.reporter_user_id].includes(viewerUserId),
    version: Number(row.appeal_version),
  };
}

export async function readActiveEnforcementAppealForSubject(
  database: Kysely<Database>, subjectUserId: string,
): Promise<ActiveEnforcementAppealContext | null> {
  const result = await sql<{ readonly enforcement_id: string }>`
    select enforcement_id from governance.enforcements
    where subject_user_id = ${subjectUserId}::uuid
      and enforcement_type = 'ACCOUNT_RESTRICTION'
    order by applied_at desc, enforcement_id limit 1
  `.execute(database);
  const enforcementId = result.rows[0]?.enforcement_id;
  if (!enforcementId) return null;
  const enforcement = await enforcementRow(database, enforcementId);
  if (!enforcement || enforcement.subject_user_id !== subjectUserId) return null;
  const appeal = (await appealRows(database)).find((row) => row.enforcement_id === enforcementId);
  return {
    enforcementId,
    enforcementState: enforcement.enforcement_state,
    appealDeadlineAt: enforcement.appeal_deadline_at.toISOString(),
    enforcementVersion: Number(enforcement.enforcement_version),
    accountState: enforcement.account_state,
    restrictionRemainsActive: enforcement.enforcement_state === 'ACTIVE',
    appeal: appeal ? project(appeal, subjectUserId, false) : null,
  };
}

export async function listEnforcementAppealsForCentral(
  database: Kysely<Database>, centralUserId: string,
): Promise<readonly EnforcementAppealProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) {
    throw new SchedulingPermissionDeniedError();
  }
  return (await appealRows(database))
    .filter((row) => row.appeal_state === 'SUBMITTED' || row.appeal_state === 'UNDER_REVIEW')
    .map((row) => project(row, centralUserId, true));
}

async function independentCentralRecipient(
  transaction: Transaction<Database>, row: EnforcementRow,
): Promise<string> {
  const result = await sql<{ readonly user_id: string }>`
    select user_id from community.role_grants
    where role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null
      and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
      and user_id not in (
        ${row.subject_user_id}::uuid, ${row.applied_by_user_id}::uuid, ${row.reporter_user_id}::uuid
      )
    order by authorized_at, user_id limit 1
  `.execute(transaction);
  const recipient = result.rows[0]?.user_id;
  if (!recipient) throw new SchedulingPermissionDeniedError();
  return recipient;
}

export async function submitEnforcementAppeal(
  database: Kysely<Database>,
  command: CommandEnvelope<SubmitEnforcementAppealPayload>,
  ids: EnforcementAppealEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<EnforcementAppealProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'EnforcementAppeal'
    || command.commandType !== 'APPEAL_ENFORCEMENT'
    || command.aggregateId !== ids.appealId
    || command.payload.enforcementId.length === 0
    || command.expectedVersion !== 0
  ) throw new SchedulingPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const enforcement = await enforcementRow(transaction, command.payload.enforcementId, true);
      if (!enforcement) throw new SchedulingPermissionDeniedError();
      assertExpectedVersion(
        Number(enforcement.enforcement_version), command.payload.expectedEnforcementVersion,
      );
      const existing = (await appealRows(transaction)).find(
        (row) => row.enforcement_id === enforcement.enforcement_id,
      );
      const statement = normalizeEnforcementAppealSubmission({
        actorUserId: command.actor.id!,
        subjectUserId: enforcement.subject_user_id,
        accountState: enforcement.account_state,
        enforcementType: enforcement.enforcement_type,
        enforcementState: enforcement.enforcement_state,
        appealDeadlineAt: enforcement.appeal_deadline_at,
        occurredAt: context.occurredAt,
        appealExists: existing !== undefined,
        statement: command.payload.statement,
      });
      const centralRecipient = await independentCentralRecipient(transaction, enforcement);
      await sql`
        insert into governance.enforcement_appeals (
          appeal_id, enforcement_id, subject_user_id, state, statement, submitted_at, version
        ) values (
          ${ids.appealId}::uuid, ${enforcement.enforcement_id}::uuid,
          ${enforcement.subject_user_id}::uuid, 'SUBMITTED', ${statement},
          ${context.occurredAt.toISOString()}::timestamptz, ${context.nextVersion}
        )
      `.execute(transaction);
      const row = (await appealRows(transaction, ids.appealId))[0]!;
      const publicPayload = {
        appealId: ids.appealId,
        enforcementId: enforcement.enforcement_id,
        state: 'SUBMITTED',
        submittedAt: context.occurredAt.toISOString(),
        restrictionRemainsActive: true,
      };
      return {
        responseStatus: 201,
        response: project(row, command.actor.id!, false),
        event: {
          eventId: ids.eventId, eventName: 'EnforcementAppealSubmitted', schemaVersion: 1,
          transitionId: 'EA-01', payload: publicPayload,
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'APPEAL_ENFORCEMENT', transitionId: 'EA-01',
          reasonCode: null, beforeState: 'ACTIVE', afterState: 'SUBMITTED',
          metadata: { enforcementId: enforcement.enforcement_id },
        },
        outbox: [
          { messageId: ids.outboxMessageId,
            topic: 'governance.enforcement-appeal.submitted.v1', payload: publicPayload },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [{
              notificationId: ids.notificationId, recipientUserId: centralRecipient,
              category: 'SERVICE', renderKey: 'enforcement-appeal.submitted',
              actionTarget: { type: 'ACCOUNT', userId: enforcement.subject_user_id },
              payload: { appealId: ids.appealId, state: 'SUBMITTED' },
              deadlineAt: null,
            }] } },
        ],
      };
    },
  });
}

export async function startEnforcementAppealReview(
  database: Kysely<Database>,
  command: CommandEnvelope<StartEnforcementAppealReviewPayload>,
  ids: EnforcementAppealReviewEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<EnforcementAppealProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'EnforcementAppeal'
    || command.commandType !== 'START_ENFORCEMENT_APPEAL_REVIEW'
    || command.aggregateId !== command.payload.appealId
  ) throw new SchedulingPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new SchedulingPermissionDeniedError();
      assertExpectedVersion(Number(row.appeal_version), command.expectedVersion);
      assertEnforcementAppealReviewCanStart({
        state: row.appeal_state,
        actorIsCentral: await hasCentralGrant(transaction, command.actor.id!),
        reviewerUserId: command.actor.id!,
        subjectUserId: row.subject_user_id,
        originalDecisionMakerUserId: row.applied_by_user_id,
        reporterUserId: row.reporter_user_id,
      });
      await sql`
        update governance.enforcement_appeals
        set state = 'UNDER_REVIEW', assigned_reviewer_user_id = ${command.actor.id}::uuid,
          review_started_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid and state = 'SUBMITTED'
          and version = ${Number(row.appeal_version)}
      `.execute(transaction);
      const updated = (await appealRows(transaction, row.appeal_id))[0]!;
      const publicPayload = {
        appealId: row.appeal_id, enforcementId: row.enforcement_id,
        state: 'UNDER_REVIEW', reviewStartedAt: context.occurredAt.toISOString(),
        restrictionRemainsActive: true,
      };
      return {
        responseStatus: 200,
        response: project(updated, command.actor.id!, true),
        event: {
          eventId: ids.eventId, eventName: 'EnforcementAppealReviewStarted', schemaVersion: 1,
          transitionId: 'EA-02', payload: publicPayload,
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'START_ENFORCEMENT_APPEAL_REVIEW',
          transitionId: 'EA-02', reasonCode: null,
          beforeState: 'SUBMITTED', afterState: 'UNDER_REVIEW',
          metadata: { enforcementId: row.enforcement_id },
        },
        outbox: [
          { messageId: ids.outboxMessageId,
            topic: 'governance.enforcement-appeal.review-started.v1', payload: publicPayload },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [{
              notificationId: ids.notificationId, recipientUserId: row.subject_user_id,
              category: 'SERVICE', renderKey: 'enforcement-appeal.review-started',
              actionTarget: { type: 'ACCOUNT', userId: row.subject_user_id },
              payload: { appealId: row.appeal_id, state: 'UNDER_REVIEW',
                restrictionRemainsActive: true }, deadlineAt: null,
            }] } },
        ],
      };
    },
  });
}

export async function revokeEnforcementAppeal(
  database: Kysely<Database>,
  command: CommandEnvelope<RevokeEnforcementAppealPayload>,
  ids: EnforcementAppealRevocationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<EnforcementAppealProjection>> {
  if (
    !command.actor.id || command.aggregateType !== 'EnforcementAppeal'
    || command.commandType !== 'REVOKE_ENFORCEMENT_APPEAL'
    || command.aggregateId !== command.payload.appealId
  ) throw new SchedulingPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = (await appealRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new SchedulingPermissionDeniedError();
      assertExpectedVersion(Number(row.appeal_version), command.expectedVersion);
      const reason = normalizeEnforcementAppealRevocation({
        state: row.appeal_state,
        enforcementType: row.enforcement_type,
        enforcementState: row.enforcement_state,
        accountState: row.account_state,
        actorIsCentral: await hasCentralGrant(transaction, command.actor.id!),
        reviewerUserId: command.actor.id!,
        assignedReviewerUserId: row.assigned_reviewer_user_id,
        subjectUserId: row.subject_user_id,
        originalDecisionMakerUserId: row.applied_by_user_id,
        reporterUserId: row.reporter_user_id,
        reason: command.payload.reason,
      });
      const occurredAt = context.occurredAt.toISOString();
      const enforcementVersion = Number(row.enforcement_version) + 1;
      await sql`
        update governance.enforcements
        set state = 'REVOKED', revoked_by_user_id = ${command.actor.id}::uuid,
          revoked_at = ${occurredAt}::timestamptz, revocation_reason = ${reason},
          version = ${enforcementVersion}
        where enforcement_id = ${row.enforcement_id}::uuid and state = 'ACTIVE'
          and version = ${Number(row.enforcement_version)}
      `.execute(transaction);
      const otherRestriction = await sql<{ readonly exists: boolean }>`select exists (
        select 1 from governance.enforcements
        where subject_user_id = ${row.subject_user_id}::uuid
          and enforcement_type = 'ACCOUNT_RESTRICTION' and state = 'ACTIVE'
      ) as exists`.execute(transaction);
      if (otherRestriction.rows[0]?.exists !== true) {
        await sql`update identity.users set account_state = 'ACTIVE', version = version + 1
          where user_id = ${row.subject_user_id}::uuid and account_state = 'RESTRICTED'`
          .execute(transaction);
      }
      const releasedHolds = await sql<{
        readonly hold_id: string; readonly aggregate_id: string; readonly version: string;
      }>`
        update competition.process_holds
        set state = 'RELEASED', released_by = ${command.actor.id}::uuid,
          released_at = ${occurredAt}::timestamptz, version = version + 1,
          updated_at = ${occurredAt}::timestamptz
        where moderation_case_id = ${row.source_case_id}::uuid
          and reason = 'STATUS_REVIEW' and state = 'ACTIVE'
        returning hold_id, aggregate_id, version::text
      `.execute(transaction);
      if (releasedHolds.rows.length > 1) {
        throw new Error('Enforcement must not own more than one active STATUS_REVIEW hold');
      }
      await sql`
        update governance.enforcement_appeals
        set state = 'DECIDED_REVOKED', decision_reason = ${reason},
          decided_at = ${occurredAt}::timestamptz, version = ${context.nextVersion}
        where appeal_id = ${row.appeal_id}::uuid and state = 'UNDER_REVIEW'
          and assigned_reviewer_user_id = ${command.actor.id}::uuid
          and version = ${Number(row.appeal_version)}
      `.execute(transaction);
      const updated = (await appealRows(transaction, row.appeal_id))[0]!;
      const publicPayload = {
        appealId: row.appeal_id, enforcementId: row.enforcement_id,
        state: 'DECIDED_REVOKED', enforcementState: 'REVOKED',
        accountState: updated.account_state,
        restrictionRemainsActive: false,
        releasedStatusHoldCount: releasedHolds.rows.length,
        decidedAt: occurredAt,
      };
      const relatedEvents: RelatedDomainEventDraft[] = [{
        eventId: ids.enforcementEventId, eventName: 'EnforcementRevoked', schemaVersion: 1,
        aggregateType: 'Enforcement', aggregateId: row.enforcement_id,
        aggregateVersion: enforcementVersion, transitionId: 'EN-03',
        payload: { enforcementId: row.enforcement_id, state: 'REVOKED', decidedAt: occurredAt },
        metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
      }];
      const releasedHold = releasedHolds.rows[0];
      if (releasedHold) relatedEvents.push({
        eventId: ids.holdEventId, eventName: 'ProcessHoldReleased', schemaVersion: 1,
        aggregateType: 'ProcessHold', aggregateId: releasedHold.hold_id,
        aggregateVersion: Number(releasedHold.version), transitionId: 'EN-03',
        payload: { holdId: releasedHold.hold_id, aggregateId: releasedHold.aggregate_id,
          reason: 'STATUS_REVIEW', state: 'RELEASED', releasedAt: occurredAt },
        metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
      });
      const outbox: OutboxDraft[] = [
        { messageId: ids.outboxMessageId,
          topic: 'governance.enforcement-appeal.revoked.v1', payload: publicPayload },
        { messageId: ids.enforcementOutboxMessageId,
          topic: 'governance.enforcement.revoked.v1',
          payload: { enforcementId: row.enforcement_id, state: 'REVOKED', decidedAt: occurredAt },
          sourceEventId: ids.enforcementEventId },
        { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
          payload: { notifications: [{
            notificationId: ids.notificationId, recipientUserId: row.subject_user_id,
            category: 'SERVICE', renderKey: 'enforcement-appeal.revoked',
            actionTarget: { type: 'ACCOUNT', userId: row.subject_user_id },
            payload: { appealId: row.appeal_id, state: 'DECIDED_REVOKED',
              restrictionRemainsActive: false }, deadlineAt: null,
          }] } },
      ];
      if (releasedHold) outbox.push({
        messageId: ids.holdOutboxMessageId, topic: 'competition.process-hold.released.v1',
        payload: { holdId: releasedHold.hold_id, aggregateId: releasedHold.aggregate_id,
          reason: 'STATUS_REVIEW', state: 'RELEASED', releasedAt: occurredAt },
        sourceEventId: ids.holdEventId,
      });
      return {
        responseStatus: 200,
        response: project(updated, command.actor.id!, true),
        event: {
          eventId: ids.eventId, eventName: 'EnforcementAppealRevoked', schemaVersion: 1,
          transitionId: 'EA-04', payload: publicPayload,
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'REVOKE_ENFORCEMENT_APPEAL', transitionId: 'EA-04',
          reasonCode: 'APPEAL_REVOKED', beforeState: 'UNDER_REVIEW',
          afterState: 'DECIDED_REVOKED',
          metadata: { enforcementId: row.enforcement_id, protectedDecisionReason: reason },
        },
        outbox,
      };
    },
  });
}
