export const competitiveSessionReconciliationTopics = new Set([
  'competition.result.recorded.v1',
  'competition.result.finalized.v1',
  'competition.appeal.decided.v1',
  'competition.integrity-case.decided.v1',
  'competition.technical-correction.approved.v1',
  'competition.status-released.v1',
  'competition.status-vacancy.single-promoted.v1',
]);

export function competitionIdFromCompetitiveSessionEvent(
  topic: string,
  payload: unknown,
): string | null {
  if (
    !competitiveSessionReconciliationTopics.has(topic)
    || typeof payload !== 'object'
    || payload === null
  ) return null;
  const value = (payload as Record<string, unknown>).competitionId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
