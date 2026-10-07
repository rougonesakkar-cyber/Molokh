import {
  COMMUNITY_CONFIGURATION_POLICY_VERSION,
  CommunityConfigurationConflictError,
  assertCommunityPairCooldownChange,
  type CommandEnvelope,
  type CommunityState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface ChangeCommunityPairCooldownPayload {
  readonly communityId: string;
  readonly pairCooldownDays: number;
}

export interface CommunityConfigurationEffectIds {
  readonly configurationId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface CommunityConfigurationProjection {
  readonly communityId: string;
  readonly configurationId: string;
  readonly configurationVersion: number;
  readonly pairCooldownDays: number;
  readonly noShowGraceMinutes: number;
  readonly rulesetRef: string;
  readonly rulesetAckMode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly effectiveAt: string;
  readonly version: number;
}

interface CommunityConfigurationRow {
  readonly community_id: string;
  readonly venue_id: string;
  readonly state: CommunityState;
  readonly community_version: string;
  readonly configuration_id: string;
  readonly configuration_version: number;
  readonly pair_cooldown_days: number;
  readonly no_show_grace_minutes: number;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly central_approval_id: string | null;
  readonly effective_at: Date;
}

async function configurationRow(
  database: Kysely<Database> | Transaction<Database>,
  communityId: string,
  lock = false,
): Promise<CommunityConfigurationRow | null> {
  const result = await sql<CommunityConfigurationRow>`
    select community.community_id, community.venue_id, community.state,
      community.version::text as community_version,
      configuration.configuration_id, configuration.configuration_version,
      configuration.pair_cooldown_days, configuration.no_show_grace_minutes,
      configuration.ruleset_ref, configuration.ruleset_ack_mode,
      configuration.central_approval_id, configuration.effective_at
    from community.communities as community
    join community.community_configuration_versions as configuration
      on configuration.configuration_id = community.configuration_id
    where community.community_id = ${communityId}::uuid
    ${lock ? sql`for update of community` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function actorCanManageConfiguration(
  database: Kysely<Database> | Transaction<Database>,
  actorUserId: string,
  communityId: string,
  venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1
      from community.role_grants as role_grant
      join identity.users as actor on actor.user_id = role_grant.user_id
      where role_grant.user_id = ${actorUserId}::uuid
        and actor.account_state = 'ACTIVE'
        and role_grant.state = 'ACTIVE'
        and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
        and (
          (role_grant.role = 'CENTRAL_ADMIN' and role_grant.scope_type = 'GLOBAL'
            and role_grant.scope_id is null)
          or
          (role_grant.role in ('PRIMARY_ADMIN', 'GYM_ADMIN') and (
            (role_grant.scope_type = 'VENUE' and role_grant.scope_id = ${venueId}::uuid)
            or (role_grant.scope_type = 'COMMUNITY'
              and role_grant.scope_id = ${communityId}::uuid)
          ))
        )
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

function projection(row: CommunityConfigurationRow): CommunityConfigurationProjection {
  return {
    communityId: row.community_id,
    configurationId: row.configuration_id,
    configurationVersion: row.configuration_version,
    pairCooldownDays: row.pair_cooldown_days,
    noShowGraceMinutes: row.no_show_grace_minutes,
    rulesetRef: row.ruleset_ref,
    rulesetAckMode: row.ruleset_ack_mode,
    effectiveAt: row.effective_at.toISOString(),
    version: Number(row.community_version),
  };
}

export async function changeCommunityPairCooldown(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangeCommunityPairCooldownPayload>,
  ids: CommunityConfigurationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<CommunityConfigurationProjection>> {
  if (
    command.actor.type !== 'USER'
    || command.actor.id === null
    || command.commandType !== 'CHANGE_COMMUNITY_PAIR_COOLDOWN'
    || command.aggregateType !== 'Community'
    || command.aggregateId !== command.payload.communityId
  ) {
    throw new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_ADMIN_REQUIRED');
  }
  const actorUserId = command.actor.id;
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const current = await configurationRow(transaction, command.payload.communityId, true);
      if (!current) {
        throw new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_INVALID_STATE');
      }
      assertCommunityPairCooldownChange({
        actorCanManage: await actorCanManageConfiguration(
          transaction, actorUserId, current.community_id, current.venue_id,
        ),
        currentState: current.state,
        currentPairCooldownDays: current.pair_cooldown_days,
        nextPairCooldownDays: command.payload.pairCooldownDays,
      });
      const configurationVersion = current.configuration_version + 1;
      await sql`
        insert into community.community_configuration_versions (
          configuration_id, community_id, configuration_version,
          pair_cooldown_days, no_show_grace_minutes, ruleset_ref,
          ruleset_ack_mode, central_approval_id, created_by, effective_at
        ) values (
          ${ids.configurationId}::uuid, ${current.community_id}::uuid,
          ${configurationVersion}, ${command.payload.pairCooldownDays},
          ${current.no_show_grace_minutes}, ${current.ruleset_ref},
          ${current.ruleset_ack_mode}, ${current.central_approval_id}::uuid,
          ${actorUserId}::uuid, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update community.communities
        set configuration_id = ${ids.configurationId}::uuid,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${current.community_id}::uuid
      `.execute(transaction);
      const updated = await configurationRow(transaction, current.community_id);
      if (!updated) {
        throw new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_INVALID_STATE');
      }
      const response = projection(updated);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'CommunityConfigurationChanged',
          schemaVersion: 1,
          transitionId: 'CO-06',
          payload: {
            communityId: response.communityId,
            configurationId: response.configurationId,
            configurationVersion: response.configurationVersion,
            pairCooldownDays: response.pairCooldownDays,
            effectiveAt: response.effectiveAt,
          },
          metadata: { policyVersion: COMMUNITY_CONFIGURATION_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CHANGE_COMMUNITY_PAIR_COOLDOWN',
          transitionId: 'CO-06',
          reasonCode: null,
          beforeState: `CONFIGURATION_V${current.configuration_version}`,
          afterState: `CONFIGURATION_V${configurationVersion}`,
          metadata: {
            previousConfigurationId: current.configuration_id,
            configurationId: response.configurationId,
            previousPairCooldownDays: current.pair_cooldown_days,
            pairCooldownDays: response.pairCooldownDays,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'community.configuration.changed.v1',
          payload: {
            communityId: response.communityId,
            configurationId: response.configurationId,
            configurationVersion: response.configurationVersion,
            pairCooldownDays: response.pairCooldownDays,
            effectiveAt: response.effectiveAt,
          },
        }],
      };
    },
  });
}
