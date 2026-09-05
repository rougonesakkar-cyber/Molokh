import { randomUUID } from 'node:crypto';

import {
  claimInboxEvent,
  claimOutboxBatch,
  createDatabase,
  markOutboxPublished,
  outboxRetryDelayMilliseconds,
  releaseOutboxFailure,
} from '@molokh/db';
import { run } from 'graphile-worker';
import pino from 'pino';

import { startOutboxPolling } from './outbox-dispatcher.js';
import { createTaskList } from './tasks.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the worker');
}

const logger = pino({ name: 'molokh-worker' });
const database = createDatabase(connectionString);
const taskList = createTaskList({
  onRuntimeProbe: (message) => logger.info({ message }, 'runtime probe'),
  onOutboxEvent: async (message) => {
    const claimed = await claimInboxEvent(database, `outbox:${message.topic}`, message.eventId);
    if (!claimed) {
      logger.info(
        { eventId: message.eventId, messageId: message.messageId, topic: message.topic },
        'duplicate outbox event ignored',
      );
      return;
    }
    logger.info(
      { eventId: message.eventId, messageId: message.messageId, topic: message.topic },
      'outbox event delivered to local sink',
    );
  },
});
const runner = await run({
  connectionString,
  concurrency: 2,
  pollInterval: 1_000,
  taskList,
});
const outboxWorkerId = `outbox-${process.pid}-${randomUUID()}`;
const outboxPolling = startOutboxPolling({
  workerId: outboxWorkerId,
  batchSize: 20,
  pollIntervalMilliseconds: 1_000,
  retryDelay: outboxRetryDelayMilliseconds,
  store: {
    claim: (workerId, batchSize) =>
      claimOutboxBatch(database, { workerId, batchSize }),
    markPublished: (messageId, workerId) =>
      markOutboxPublished(database, messageId, workerId),
    releaseFailure: (messageId, workerId, errorMessage, retryDelayMilliseconds) =>
      releaseOutboxFailure(
        database,
        messageId,
        workerId,
        errorMessage,
        retryDelayMilliseconds,
      ),
  },
  deliver: async (message) => {
    await runner.addJob(
      'deliver_outbox_event',
      {
        messageId: message.messageId,
        eventId: message.eventId,
        topic: message.topic,
        payload: message.payload,
      },
      {
        jobKey: `outbox:${message.messageId}`,
        jobKeyMode: 'unsafe_dedupe',
        maxAttempts: 10,
      },
    );
  },
  onError: (error) => logger.error({ err: error }, 'outbox polling failed'),
});

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await outboxPolling.stop();
  await runner.stop();
  await database.destroy();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
