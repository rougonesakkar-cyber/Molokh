import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';
import type { TaskList } from 'graphile-worker';

export interface OutboxJobPayload {
  readonly messageId: string;
  readonly eventId: string;
  readonly topic: string;
  readonly payload: unknown;
}

export interface TaskDependencies {
  readonly onRuntimeProbe: (message: string) => void;
  readonly onOutboxEvent: (message: OutboxJobPayload) => Promise<void> | void;
  readonly onTimer: (payload: TimerCommandPayload) => Promise<void> | void;
  readonly onChatRetentionCleanup: () => Promise<void> | void;
  readonly onGuestCoachExpirySweep: () => Promise<void> | void;
}

function parseOutboxJobPayload(payload: unknown): OutboxJobPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('Outbox job payload must be an object');
  }
  const value = payload as Record<string, unknown>;
  for (const field of ['messageId', 'eventId', 'topic'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      throw new TypeError(`Outbox job payload field ${field} is required`);
    }
  }
  return {
    messageId: value.messageId as string,
    eventId: value.eventId as string,
    topic: value.topic as string,
    payload: value.payload,
  };
}

export function createTaskList(dependencies: TaskDependencies): TaskList {
  return {
    runtime_probe: async (payload) => {
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? String(payload.message)
          : 'worker-ready';
      dependencies.onRuntimeProbe(message);
    },
    deliver_outbox_event: async (payload) =>
      dependencies.onOutboxEvent(parseOutboxJobPayload(payload)),
    process_timer: async (payload) => dependencies.onTimer(parseTimerCommandPayload(payload)),
    cleanup_chat_payloads: async () => dependencies.onChatRetentionCleanup(),
    expire_guest_coach_grants: async () => dependencies.onGuestCoachExpirySweep(),
  };
}
