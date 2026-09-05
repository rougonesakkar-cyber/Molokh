import { describe, expect, it, vi } from 'vitest';

import { createTaskList } from '../src/tasks.js';

describe('worker task registry', () => {
  it('exposes an executable runtime probe without infrastructure', async () => {
    const onRuntimeProbe = vi.fn();
    const tasks = createTaskList({
      onRuntimeProbe,
      onOutboxEvent: vi.fn(),
      onTimer: vi.fn(),
    });

    await tasks.runtime_probe?.({ message: 'ready' }, {} as never);

    expect(onRuntimeProbe).toHaveBeenCalledWith('ready');
  });

  it('validates and forwards an outbox event', async () => {
    const onOutboxEvent = vi.fn();
    const tasks = createTaskList({
      onRuntimeProbe: vi.fn(),
      onOutboxEvent,
      onTimer: vi.fn(),
    });
    const payload = {
      messageId: 'message-1',
      eventId: 'event-1',
      topic: 'platform.probe.v1',
      payload: { value: 1 },
    };

    await tasks.deliver_outbox_event?.(payload, {} as never);

    expect(onOutboxEvent).toHaveBeenCalledWith(payload);
    await expect(
      tasks.deliver_outbox_event?.({ eventId: 'event-1' }, {} as never),
    ).rejects.toThrow('messageId');
  });
});
