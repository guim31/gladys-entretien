// -----------------------------------------------------------------------------
// Persistence under /data: the tasks survive a restart, concurrent changes
// are all written, an unreadable file falls back on the backup (and is kept
// for a repair), a failed write changes nothing, a hand edit is repaired.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStore } from '../src/store.js';
import { normalizeDocument } from '../src/tasks/model.js';
import { FILTERS, createWorld, emptyDataDir, fixtureDataDir, taskIds } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const onDisk = (dir, name = 'tasks.json') => JSON.parse(readFileSync(join(dir, name), 'utf8'));

test('the tasks survive a restart of the container', async (t) => {
  const dataDir = emptyDataDir();
  const first = await createWorld({ dataDir });
  const created = await first.fake.action('create_task', { template: 'boiler', last_done: '-10' });
  assert.equal(created.success, true, created.error);
  const [device] = first.fake.discoveredDevices;
  await first.fake.sceneAction('mark_done', { task: device.external_id, date: '-2' });
  await first.app.stop();

  const second = await world(t, { dataDir });
  assert.deepEqual(
    second.fake.discoveredDevices.map((entry) => entry.external_id),
    [device.external_id],
    'same task, same device',
  );
  assert.deepEqual(second.hub.tasks[0].history, ['2026-11-07', '2026-10-30']);
  assert.equal(onDisk(dataDir).schema, 1);
});

test('twenty concurrent "done" are all written, in one valid file', async (t) => {
  const w = await world(t);
  const device = taskIds(w.gladys, FILTERS).device;
  const acks = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      w.fake.sceneAction('mark_done', { task: device, date: `-${i}` }),
    ),
  );
  assert.ok(acks.every((ack) => ack.success));
  await w.hub.store.flush();
  const task = onDisk(w.dataDir).tasks.find((entry) => entry.id === FILTERS);
  assert.equal(task.history.length, 20, 'the twenty most recent dates');
  assert.equal(task.last_done, '2026-11-09');
});

test('a truncated tasks.json is kept aside and the backup is read', async (t) => {
  const dataDir = fixtureDataDir();
  const good = readFileSync(join(dataDir, 'tasks.json'), 'utf8');
  writeFileSync(join(dataDir, 'tasks.json.bak'), good);
  writeFileSync(join(dataDir, 'tasks.json'), good.slice(0, 200));
  const w = await world(t, { dataDir });
  assert.equal(w.hub.tasks.length, 4);
  assert.equal(readFileSync(join(dataDir, 'tasks.json.corrupt'), 'utf8'), good.slice(0, 200));
  assert.equal(onDisk(dataDir).tasks.length, 4, 'written back at once');
  assert.equal(onDisk(dataDir, 'tasks.json.bak').tasks.length, 4, 'the backup stays good');
});

test('with no usable file at all, the integration starts empty and deletes nothing', async () => {
  const dataDir = emptyDataDir();
  writeFileSync(join(dataDir, 'tasks.json'), '{"schema":1,"tasks":');
  writeFileSync(join(dataDir, 'tasks.json.bak'), 'not json');
  const { document, source } = await new TaskStore(dataDir).load();
  assert.equal(source, 'reset');
  assert.deepEqual(document.tasks, []);
  assert.deepEqual(readdirSync(dataDir).sort(), [
    'tasks.json',
    'tasks.json.bak',
    'tasks.json.corrupt',
  ]);
});

test('a first start finds no file and creates none until a change', async () => {
  const dataDir = emptyDataDir();
  assert.equal((await new TaskStore(dataDir).load()).source, 'new');
  assert.deepEqual(readdirSync(dataDir), []);
});

test('a write that fails changes nothing and tells the user', async (t) => {
  const w = await world(t);
  const before = structuredClone(w.hub.document);
  t.mock.method(w.hub.store, 'save', async () => {
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  });
  const ack = await w.fake.sceneAction('mark_done', { task: taskIds(w.gladys, FILTERS).device });
  assert.equal(ack.success, false);
  assert.match(ack.error, /could not be saved/);
  assert.deepEqual(w.hub.document, before);
  t.mock.restoreAll();
  const retry = await w.fake.sceneAction('mark_done', { task: taskIds(w.gladys, FILTERS).device });
  assert.equal(retry.success, true, retry.error);
});

test('while tasks.json cannot be read, every command is refused and nothing is written', async (t) => {
  const dataDir = fixtureDataDir();
  const store = new TaskStore(dataDir);
  t.mock.method(store, 'load', async () => {
    throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
  });
  const w = await world(t, { store });
  const ack = await w.fake.action('create_task', { template: 'boiler' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /not loaded/);
  assert.ok(!existsSync(join(dataDir, 'tasks.json.bak')));
  store.load.mock.restore();
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.hub.tasks.length, 4);
});

test('a hand-edited file is repaired, unknown fields are kept', () => {
  const document = normalizeDocument(
    {
      schema: 1,
      note: 'kept',
      tasks: [
        { id: 'aaa', name: ' Chaudière ', every: 1, unit: 'years', last_done: '2026-02-30' },
        { id: 'aaa', name: 'chaudiere', every: 0, unit: 'years', history: ['2026-01-05', 'x'] },
        { name: '', every: 1, unit: 'days' },
        'nope',
        { name: 'Piscine', every: 2, unit: 'weeks', notice_days: -3, color: 'blue' },
      ],
    },
    '2026-11-09T09:00:00.000Z',
    '2026-11-09',
  );
  assert.equal(document.note, 'kept');
  assert.deepEqual(
    document.tasks.map((task) => [task.name, task.every, task.unit, task.last_done]),
    [
      ['Chaudière', 1, 'years', '2026-11-09'],
      ['chaudiere (2)', 1, 'years', '2026-01-05'],
      ['Piscine', 2, 'weeks', '2026-11-09'],
    ],
  );
  assert.equal(new Set(document.tasks.map((task) => task.id)).size, 3);
  assert.equal(document.tasks[2].notice_days, 7);
  assert.equal(document.tasks[2].color, 'blue');
});
