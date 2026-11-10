// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle and
// one line per change asked by the user. The minute timer, the widget and
// the scene readings write nothing.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOILER, DAY, createAll, createWorld, taskIds } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record = (...args) =>
    lines.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  return { lines, clear: () => lines.splice(0) };
}

test('the minute timer, the widget and the readings write nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  await createAll(w);
  assert.ok(logs.lines.some((text) => text.includes('4 task(s) loaded')));
  logs.clear();
  for (let i = 0; i < 3; i += 1) {
    w.clock.advance(DAY);
    await w.hub.tick();
  }
  await w.fake.widgetGet('upcoming', { settings: {}, language: 'en', units: 'metric' });
  await w.fake.sceneAction('read_tasks', {});
  await w.fake.action('show_tasks', {});
  assert.deepEqual(logs.lines, []);
});

test('one line per change asked by the user', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  logs.clear();
  await w.fake.sceneAction('mark_done', { task: taskIds(w.gladys, BOILER).device });
  assert.equal(logs.lines.length, 1);
  assert.match(logs.lines[0], /Task "Chaudière" done \(scene\)/);
});
