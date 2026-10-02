import { createHash } from 'node:crypto';

import {
  deriveProvisionalStatusTransition,
  type ChallengeStake,
  type ResultOutcomeCode,
} from '@molokh/core';
import { type Transaction, sql } from 'kysely';

import type { Database } from './index.js';

interface ReplayCheckpointRow {
  readonly competition_id: string;
  readonly applied_at: Date;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string;
}

interface ReplayTransitionRow {
  readonly transition_id: string;
  readonly result_id: string;
  readonly effective_stake: ChallengeStake;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly recorded_winner_user_id: string | null;
  readonly recorded_loser_user_id: string | null;
  readonly result_state: string;
  readonly appeal_decision: string | null;
  readonly appeal_outcome_code: ResultOutcomeCode | null;
  readonly appeal_winner_user_id: string | null;
  readonly appeal_loser_user_id: string | null;
  readonly integrity_disposition: string | null;
  readonly integrity_outcome_code: ResultOutcomeCode | null;
  readonly integrity_winner_user_id: string | null;
  readonly integrity_loser_user_id: string | null;
}

export interface CompetitionStatusReplay {
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
  readonly replayHash: string;
  readonly journal: readonly Readonly<Record<string, unknown>>[];
}

export async function replayCompetitionStatusExcludingResults(input: {
  readonly transaction: Transaction<Database>;
  readonly sourceTransitionId: string;
  readonly excludedResultIds: readonly string[];
}): Promise<CompetitionStatusReplay> {
  const checkpointResult = await sql<ReplayCheckpointRow>`
    select competition_id, applied_at, before_champion_user_id,
      before_contender_user_id, before_status_version::text
    from competition.status_transitions
    where transition_id = ${input.sourceTransitionId}::uuid
  `.execute(input.transaction);
  const checkpoint = checkpointResult.rows[0];
  if (!checkpoint) throw new TypeError('Status replay checkpoint is required');

  const transitions = await sql<ReplayTransitionRow>`
    select transition.transition_id, result.result_id,
      coalesce(snapshot.effective_stake, challenge.stake) as effective_stake,
      result.recorded_outcome_code,
      result.winner_user_id as recorded_winner_user_id,
      result.loser_user_id as recorded_loser_user_id,
      result.state as result_state,
      appeal_decision.decision as appeal_decision,
      appeal_decision.effective_outcome_code as appeal_outcome_code,
      appeal_decision.effective_winner_user_id as appeal_winner_user_id,
      appeal_decision.effective_loser_user_id as appeal_loser_user_id,
      integrity_decision.effective_disposition as integrity_disposition,
      integrity_decision.effective_outcome_code as integrity_outcome_code,
      integrity_decision.effective_winner_user_id as integrity_winner_user_id,
      integrity_decision.effective_loser_user_id as integrity_loser_user_id
    from competition.status_transitions as transition
    join competition.results as result on result.result_id = transition.source_result_id
    join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
    left join scheduling.session_competitive_snapshots as snapshot
      on snapshot.snapshot_id = result.competitive_snapshot_id
    left join competition.appeal_decisions as appeal_decision
      on appeal_decision.result_id = result.result_id
    left join competition.integrity_decisions as integrity_decision
      on integrity_decision.result_id = result.result_id
    where transition.competition_id = ${checkpoint.competition_id}::uuid
      and transition.applied_at >= ${checkpoint.applied_at.toISOString()}::timestamptz
    order by transition.applied_at, transition.transition_id
  `.execute(input.transaction);

  const excluded = new Set(input.excludedResultIds);
  let championUserId = checkpoint.before_champion_user_id;
  let contenderUserId = checkpoint.before_contender_user_id;
  let replayVersion = Number(checkpoint.before_status_version);
  const journal: Array<Readonly<Record<string, unknown>>> = [];
  for (const transition of transitions.rows) {
    let outcome: ResultOutcomeCode | null = null;
    let winnerUserId: string | null = null;
    let loserUserId: string | null = null;
    if (!excluded.has(transition.result_id)) {
      if (transition.integrity_disposition) {
        const removed = ['ANNUL', 'REPEAT'].includes(transition.integrity_disposition);
        outcome = removed ? null : transition.integrity_outcome_code;
        winnerUserId = removed ? null : transition.integrity_winner_user_id;
        loserUserId = removed ? null : transition.integrity_loser_user_id;
      } else if (transition.appeal_decision) {
        const removed = ['ANNUL', 'REPEAT'].includes(transition.appeal_decision);
        outcome = removed ? null : transition.appeal_outcome_code;
        winnerUserId = removed ? null : transition.appeal_winner_user_id;
        loserUserId = removed ? null : transition.appeal_loser_user_id;
      } else if (!['ANNULLED', 'REPEAT_ORDERED'].includes(transition.result_state)) {
        outcome = transition.recorded_outcome_code;
        winnerUserId = transition.recorded_winner_user_id;
        loserUserId = transition.recorded_loser_user_id;
      }
    }
    if (outcome !== null) {
      const derived = deriveProvisionalStatusTransition({
        stake: transition.effective_stake, outcomeCode: outcome,
        winnerUserId, loserUserId,
        snapshot: { championUserId, contenderUserId, statusVersion: replayVersion },
      });
      championUserId = derived.after.championUserId;
      contenderUserId = derived.after.contenderUserId;
      replayVersion = derived.after.statusVersion;
    }
    journal.push({ transitionId: transition.transition_id, resultId: transition.result_id,
      included: outcome !== null, outcomeCode: outcome, winnerUserId,
      championUserId, contenderUserId });
  }
  const replayHash = createHash('sha256').update(JSON.stringify({
    competitionId: checkpoint.competition_id,
    sourceTransitionId: input.sourceTransitionId,
    excludedResultIds: [...excluded].sort(), championUserId, contenderUserId, journal,
  })).digest('hex');
  return { championUserId, contenderUserId, replayHash, journal };
}
