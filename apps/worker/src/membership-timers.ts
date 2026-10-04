import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function membershipTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  const expectedCommand = topic === 'community.membership.request-reminder-timer.v1'
    ? 'REMIND_MEMBERSHIP_REQUEST'
    : topic === 'community.membership.request-escalation-timer.v1'
      ? 'ESCALATE_MEMBERSHIP_REQUEST'
      : null;
  if (!expectedCommand) return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Membership outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (
    timer.commandType !== expectedCommand
    || timer.aggregateType !== 'CommunityMembership'
  ) {
    throw new TypeError('Membership outbox timer does not match its topic');
  }
  return timer;
}
