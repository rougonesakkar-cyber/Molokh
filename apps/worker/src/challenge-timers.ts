import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function challengeTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  const optionalChallenge = topic === 'competition.challenge.created.v1';
  const mandatoryChallenge = topic === 'competition.challenge.mandatory-response-timer.v1';
  const schedulingChallenge = topic === 'competition.challenge.accepted.v1';
  const genesisChallenge = topic === 'competition.genesis.response-timer.v1'
    || topic === 'competition.genesis.accepted.v1';
  if (!optionalChallenge && !mandatoryChallenge && !schedulingChallenge && !genesisChallenge) {
    return null;
  }
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    if (topic === 'competition.genesis.accepted.v1') return null;
    throw new TypeError('Challenge outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  const expectedCommand = optionalChallenge
    ? 'EXPIRE_OPTIONAL_CHALLENGE'
    : mandatoryChallenge
      ? 'EXPIRE_MANDATORY_CHALLENGE'
      : schedulingChallenge
        ? 'EXPIRE_CHALLENGE_SCHEDULING'
        : 'EXPIRE_GENESIS_CHALLENGE';
  if (timer.commandType !== expectedCommand || timer.aggregateType !== 'Challenge') {
    throw new TypeError('Challenge outbox timer does not match its topic');
  }
  return timer;
}
