import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../src/poller.js';

test('reads at the configured interval, whatever the Gladys pace', async () => {
  let now = 0;
  const reads = [];
  const poll = createPoller(
    async (key) => reads.push([key, now]),
    () => now,
  );
  for (let minute = 0; minute <= 10; minute += 1) {
    now = minute * 60_000 + 7; // Gladys ticks drift a little
    await poll('a', 300);
  }
  assert.deepEqual(
    reads.map(([, at]) => Math.round(at / 60_000)),
    [0, 5, 10],
  );
});

test('a failed read is retried at the next poll', async () => {
  let fail = true;
  let count = 0;
  const poll = createPoller(async () => {
    count += 1;
    if (fail) {
      throw new Error('down');
    }
  });
  await assert.rejects(poll('a', 300), /down/);
  fail = false;
  assert.equal(await poll('a', 300), true);
  assert.equal(count, 2);
});

test('two polls of the same inverter never overlap', async () => {
  let release;
  const poll = createPoller(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = poll('a', 60);
  assert.equal(await poll('a', 60), false);
  release();
  assert.equal(await first, true);
});
