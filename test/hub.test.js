// -----------------------------------------------------------------------------
// The tasks hub against the SDK's fake Gladys: devices and states from the
// fixture, the reminders (once per due date, across restarts), "done" from
// every entry point, and the Configuration actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOILER,
  CAR,
  DAY,
  DESCALING,
  FILTERS,
  createAll,
  createClock,
  createWorld,
  emptyDataDir,
  fixtureDataDir,
  taskIds,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, id, key) => w.fake.lastState(taskIds(w.gladys, id).feature(key));
const onDisk = (dir) => JSON.parse(readFileSync(join(dir, 'tasks.json'), 'utf8'));
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('one device per task, published at start, states once added', async (t) => {
  const w = await world(t);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Chaudière', 'Filtres de VMC', 'Détartrage cafetière', 'Contrôle technique'],
  );
  assert.equal(w.fake.discoveredDevices[0].external_id, taskIds(w.gladys, BOILER).device);
  assert.equal(state(w, BOILER, 'days_left'), undefined, 'nothing before the device is added');
  await createAll(w);
  assert.equal(state(w, BOILER, 'days_left'), 11);
  assert.equal(state(w, BOILER, 'due_soon'), 1);
  assert.equal(state(w, BOILER, 'overdue'), 0);
  assert.equal(state(w, BOILER, 'life_remaining'), 3);
  assert.equal(state(w, BOILER, 'last_done'), '11/20/2025');
  assert.equal(state(w, BOILER, 'next_due'), '11/20/2026');
  assert.equal(state(w, FILTERS, 'days_left'), -8);
  assert.equal(state(w, FILTERS, 'overdue'), 1);
  assert.equal(state(w, FILTERS, 'due_soon'), 0);
  assert.equal(state(w, FILTERS, 'life_remaining'), 0);
  assert.equal(state(w, DESCALING, 'days_left'), 36);
  assert.equal(state(w, DESCALING, 'due_soon'), 0);
  assert.equal(state(w, CAR, 'next_due'), '03/14/2027');
});

test('the reminders fire once per due date, and not again after a restart', async () => {
  const dataDir = fixtureDataDir();
  const clock = createClock();
  const w = await createWorld({ dataDir, clock });
  // At start: the boiler enters its notice, the filters are late (their
  // "due soon" was sent before the fixture was written).
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => [event.key, event.data.task_name, event.data.days_left]),
    [
      ['task_due_soon', 'Chaudière', 11],
      ['task_overdue', 'Filtres de VMC', -8],
    ],
  );
  assert.deepEqual(events(w, 'task_due_soon')[0].data, {
    task: taskIds(w.gladys, BOILER).device,
    task_name: 'Chaudière',
    due: '2026-11-20',
    days_left: 11,
  });
  await w.hub.tick();
  assert.equal(w.fake.sceneEvents.length, 2, 'not twice');
  assert.equal(onDisk(dataDir).tasks[0].soon_notified_for, '2026-11-20');
  await w.app.stop();

  const again = await createWorld({ dataDir, clock });
  assert.equal(again.fake.sceneEvents.length, 0, 'remembered in the file');
  // 12 days later the boiler is late: one overdue event; the descaling
  // (due 15 December, notice 7) is not due soon yet.
  clock.advance(12 * DAY);
  await again.hub.tick();
  assert.deepEqual(
    again.fake.sceneEvents.map((event) => [event.key, event.data.task_name]),
    [['task_overdue', 'Chaudière']],
  );
  // 8 December: the descaling enters its notice.
  clock.advance(17 * DAY);
  await again.hub.tick();
  assert.deepEqual(events(again, 'task_due_soon').at(-1).data.task_name, 'Détartrage cafetière');
  await again.app.stop();
});

test('a reminder refused by Gladys is tried again at the next minute', async (t) => {
  const w = await world(t, { connect: false });
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  w.gladys.publishSceneEvent = async (...args) => {
    if (refuse) {
      throw new Error('429');
    }
    return original(...args);
  };
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(w.fake.sceneEvents.length, 0);
  refuse = false;
  await w.hub.tick();
  assert.equal(w.fake.sceneEvents.length, 2);
});

test('at local midnight the days left change and the widget is refreshed', async (t) => {
  // 9 November 2026, 23:59 in Paris (22:59 UTC).
  const clock = createClock(Date.UTC(2026, 10, 9, 22, 59));
  const w = await world(t, { clock });
  await createAll(w);
  assert.equal(state(w, DESCALING, 'days_left'), 36);
  const refreshes = w.fake.widgetRefreshes.length;
  clock.advance(60_000);
  await w.hub.tick();
  assert.equal(state(w, DESCALING, 'days_left'), 35);
  assert.equal(state(w, DESCALING, 'life_remaining'), 57);
  assert.ok(w.fake.widgetRefreshes.length > refreshes);
});

test('"done" from a scene starts the count again, the reminders are re-armed', async (t) => {
  const w = await world(t);
  await createAll(w);
  const device = taskIds(w.gladys, FILTERS).device;
  const ack = await w.fake.sceneAction('mark_done', { task: device });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    task_name: 'Filtres de VMC',
    last_done: '2026-11-09',
    next_due: '2027-05-09',
    days_left: 181,
  });
  assert.equal(state(w, FILTERS, 'overdue'), 0);
  assert.equal(state(w, FILTERS, 'life_remaining'), 100);
  const task = onDisk(w.dataDir).tasks.find((entry) => entry.id === FILTERS);
  assert.deepEqual(task.history, ['2026-11-09', '2026-05-01']);

  // Done on a past date; a future date or nonsense is refused.
  const past = await w.fake.sceneAction('mark_done', {
    task: taskIds(w.gladys, BOILER).device,
    date: '02/11/2026',
  });
  assert.equal(past.data.outputs.next_due, '2027-11-02');
  const future = await w.fake.sceneAction('mark_done', { task: device, date: '2026-12-01' });
  assert.equal(future.success, false);
  assert.match(future.error, /future/);
  const wrong = await w.fake.sceneAction('mark_done', { task: device, date: 'hier' });
  assert.match(wrong.error, /not understood/);
  const gone = await w.fake.sceneAction('mark_done', { task: 'ext:nope' });
  assert.match(gone.error, /no longer exists/);
});

test('an older date never moves the last time back, a correction in the form does', async (t) => {
  const w = await world(t);
  const device = taskIds(w.gladys, DESCALING).device;
  const ack = await w.fake.sceneAction('mark_done', { task: device, date: '2026-09-01' });
  assert.equal(ack.data.outputs.last_done, '2026-10-15');
  const fixed = await w.fake.action('create_task', {
    name: 'detartrage CAFETIERE',
    last_done: '2026-09-01',
  });
  assert.equal(fixed.success, true, fixed.error);
  assert.match(fixed.data.message.en, /changed, next due on 11\/01\/2026/);
  assert.equal(w.hub.tasks.find((task) => task.id === DESCALING).last_done, '2026-09-01');
});

test('read_tasks: what is due, as one text in the configured language', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  const ack = await w.fake.sceneAction('read_tasks', {});
  assert.deepEqual(ack.data.outputs, {
    overdue: 1,
    due_soon: 1,
    next_task: 'Filtres de VMC',
    next_due: '2026-11-01',
    next_days_left: -8,
    text: 'Filtres de VMC (retard de 8 j), Chaudière (dans 11 j)',
  });
  const all = await w.fake.sceneAction('read_tasks', { scope: 'all' });
  assert.match(all.data.outputs.text, /Détartrage cafetière \(15\/12\/2026\), Contrôle technique/);
  const empty = await createWorld({ dataDir: emptyDataDir(), config: { language: 'fr' } });
  t.after(() => empty.app.stop());
  const none = await empty.fake.sceneAction('read_tasks', {});
  assert.equal(none.data.outputs.text, 'Aucun entretien à prévoir.');
  assert.equal(none.data.outputs.next_task, '');
});

test('create_task: a suggested task, a task of your own, errors', async (t) => {
  const clock = createClock();
  const w = await world(t, { dataDir: emptyDataDir(), clock, config: { language: 'fr' } });
  const boiler = await w.fake.action('create_task', { template: 'boiler' });
  assert.equal(boiler.success, true, boiler.error);
  assert.match(
    boiler.data.message.fr,
    /« Entretien de la chaudière » créée, prochaine échéance le 09\/11\/2027/,
  );
  const [task] = w.hub.tasks;
  assert.deepEqual(
    [task.template, task.every, task.unit, task.notice_days, task.last_done],
    ['boiler', 1, 'years', 30, '2026-11-09'],
  );

  const own = await w.fake.action('create_task', {
    name: '  Poêle   à granulés ',
    every: '3',
    unit: 'months',
    last_done: '-30',
    notice_days: 10,
  });
  assert.equal(own.success, true, own.error);
  assert.equal(w.hub.tasks[1].name, 'Poêle à granulés');
  assert.equal(w.hub.tasks[1].last_done, '2026-10-10');
  assert.equal(w.fake.discoveredDevices.length, 2);

  const named = await w.fake.action('create_task', { template: 'chimney', name: 'Cheminée salon' });
  assert.equal(w.hub.tasks[2].name, 'Cheminée salon', named.error);

  const refused = {
    emptyName: {},
    badPeriod: { name: 'Sans période' },
    badUnit: { name: 'X', every: 1, unit: 'decades' },
    tooLong: { name: 'X', every: 11, unit: 'years' },
    badEvery: { name: 'X', every: '1,5', unit: 'days' },
    badNotice: { template: 'boiler', name: 'Y', notice_days: 400 },
    badTemplate: { template: 'rocket' },
    badDate: { template: 'gutters', last_done: '31/02/2026' },
  };
  for (const [label, fields] of Object.entries(refused)) {
    const ack = await w.fake.action('create_task', fields);
    assert.equal(ack.success, false, label);
    assert.ok(ack.error.length > 0, label);
  }
  assert.equal(w.hub.tasks.length, 3, 'nothing created by a refused form');
  const errorFr = await w.fake.action('create_task', { name: 'Sans période' });
  assert.match(errorFr.error, /Indiquez la période/);
});

test('mark_done, delete_task and show_tasks from the Configuration screen', async (t) => {
  const w = await world(t);
  const shown = await w.fake.action('show_tasks', {});
  assert.equal(
    shown.data.message.en,
    'Filtres de VMC: 11/01/2026, 8 d late · Chaudière: 11/20/2026, in 11 d · ' +
      'Détartrage cafetière: 12/15/2026, in 36 d · Contrôle technique: 03/14/2027, in 125 d',
  );
  const done = await w.fake.action('mark_done', { name: 'filtres de vmc', date: '' });
  assert.equal(done.success, true, done.error);
  assert.equal(done.data.message.fr, '« Filtres de VMC » fait, prochaine fois le 09/05/2027.');
  const missing = await w.fake.action('delete_task', { name: 'Piscine' });
  assert.match(missing.error, /No task is named "Piscine"/);
  const deleted = await w.fake.action('delete_task', { name: 'Contrôle technique' });
  assert.equal(deleted.success, true);
  assert.equal(w.fake.discoveredDevices.length, 3);
  const empty = await createWorld({ dataDir: emptyDataDir() });
  t.after(() => empty.app.stop());
  assert.match((await empty.fake.action('show_tasks', {})).data.message.en, /No task yet/);
});

test('the name given in Gladys is used in events, scenes and the widget', async (t) => {
  const w = await world(t);
  await createAll(w);
  const device = w.fake.devices.find(
    (entry) => entry.external_id === taskIds(w.gladys, CAR).device,
  );
  await w.fake.deviceUpdated({ ...device, name: 'CT Clio' });
  const ack = await w.fake.action('mark_done', { name: 'CT Clio' });
  assert.equal(ack.success, true, ack.error);
  const read = await w.fake.sceneAction('read_tasks', { scope: 'all' });
  assert.match(read.data.outputs.text, /CT Clio/);
});

test('a new language rewrites the dates of the text features', async (t) => {
  const w = await world(t);
  await createAll(w);
  await w.fake.configUpdated({ language: 'de' });
  assert.equal(state(w, BOILER, 'next_due'), '20.11.2026');
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Verbleibende Tage');
});

test('a device added later gets its states at once', async (t) => {
  const w = await world(t, { dataDir: emptyDataDir() });
  await w.fake.action('create_task', { template: 'descaling' });
  const [device] = w.fake.discoveredDevices;
  w.fake.states.length = 0;
  await w.fake.deviceCreated(device);
  assert.equal(w.fake.lastState(`${device.external_id}:days_left`), 61);
  assert.ok(w.fake.widgetRefreshes.length > 0);
});
