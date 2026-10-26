import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function schedulingTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  const expected =
    topic === 'scheduling.slot.published.v1'
      ? { aggregateType: 'Slot', commandType: 'EXPIRE_SLOT' }
      : topic === 'scheduling.group-offering.published.v1'
        ? { aggregateType: 'GroupOffering', commandType: 'EXPIRE_GROUP_OFFERING' }
        : topic === 'scheduling.booking.selection-started.v1'
          ? { aggregateType: 'Booking', commandType: 'EXPIRE_BOOKING_SELECTION' }
          : topic === 'scheduling.booking.mutually-selected.v1'
            ? { aggregateType: 'Booking', commandType: 'EXPIRE_HOST_CONFIRMATION' }
            : topic === 'scheduling.group-plan.proposed.v1' ||
                topic === 'scheduling.group-plan.mutually-confirmed.v1'
              ? { aggregateType: 'GroupPlan', commandType: 'EXPIRE_GROUP_PLAN' }
              : topic === 'scheduling.session.scheduled.v1'
                ? { aggregateType: 'Session', commandType: 'OPEN_SESSION_WINDOW' }
                : topic === 'scheduling.session.coach-replaced.v1'
                  ? { aggregateType: 'Session', commandType: 'OPEN_SESSION_WINDOW' }
                  : topic === 'scheduling.booking.official-conversion-timer.v1'
                    ? {
                        aggregateType: 'BookingOfficialConversion',
                        commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION',
                      }
                    : topic === 'scheduling.group-plan.official-conversion-timer.v1'
                      ? {
                          aggregateType: 'GroupPlanOfficialConversion',
                          commandType: 'EXPIRE_GROUP_PLAN_OFFICIAL_CONVERSION',
                        }
                    : topic === 'scheduling.booking.solo-continuation-timer.v1'
                      ? {
                          aggregateType: 'BookingSoloContinuation',
                          commandType: 'EXPIRE_BOOKING_SOLO_CONTINUATION',
                        }
                      : topic === 'scheduling.booking.training-retention-timer.v1'
                        ? {
                            aggregateType: 'BookingTrainingRetention',
                            commandType: 'EXPIRE_BOOKING_TRAINING_RETENTION',
                          }
        : null;
  if (!expected) return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Scheduling outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (
    timer.commandType !== expected.commandType ||
    timer.aggregateType !== expected.aggregateType
  ) {
    throw new TypeError('Scheduling outbox timer does not match its topic');
  }
  return timer;
}
