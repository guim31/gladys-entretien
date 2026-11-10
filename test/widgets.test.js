// -----------------------------------------------------------------------------
// The "upcoming" widget: valid content within the core budget, the settings,
// and its "Done" button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FILTERS, createAll, createWorld, emptyDataDir, taskIds } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('upcoming', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  assert.ok(tree.components.length <= 8);
  return tree;
}

const status = (data) => data.components.find((c) => c.type === 'status');

test('the next tasks by due date, overdue in red, due soon in orange', async (t) => {
  const w = await world(t);
  const data = await content(w, {}, 'fr');
  assert.deepEqual(data.components[0], {
    type: 'value',
    value: 2,
    label: 'À prévoir',
    icon: 'tool',
    color: 'danger',
  });
  assert.deepEqual(status(data).items, [
    { label: 'Filtres de VMC', value: 'retard de 8 j', icon: 'alert-circle', color: 'danger' },
    { label: 'Chaudière', value: 'dans 11 j', icon: 'clock', color: 'warning' },
    { label: 'Détartrage cafetière', value: '15/12/2026', icon: 'check-circle' },
    { label: 'Contrôle technique', value: '14/03/2027', icon: 'check-circle' },
  ]);
  const button = data.components.at(-1);
  assert.equal(button.label, 'Fait');
  assert.deepEqual(
    button.action.fields[0].options.map((option) => option.value),
    ['f11a2b3c4d5e', 'b01e2c3d4e5f', 'd33c4d5e6f70', 'c44d5e6f7081'],
  );
});

test('settings: only what is due, fewer rows, hidden tile and button', async (t) => {
  const w = await world(t);
  const soon = await content(w, { scope: 'soon', rows: '3' });
  assert.equal(status(soon).items.length, 2);
  const three = await content(w, { rows: '3' });
  assert.equal(status(three).items.length, 3);
  const bare = await content(w, { hide: ['tile', 'done'] });
  assert.deepEqual(
    bare.components.map((c) => c.type),
    ['status'],
  );
});

test('nothing due, no task: a short text', async (t) => {
  const w = await world(t);
  await w.fake.action('mark_done', { name: 'Filtres de VMC' });
  await w.fake.action('mark_done', { name: 'Chaudière' });
  const calm = await content(w, { scope: 'soon' });
  assert.equal(calm.components[0].value, 0);
  assert.equal(calm.components[1].text, 'Nothing due soon.');
  const empty = await world(t, { dataDir: emptyDataDir() });
  const none = await content(empty);
  assert.match(none.components[0].text, /No task yet/);
});

test('the Done button starts the count again and answers in four languages', async (t) => {
  const w = await world(t);
  await createAll(w);
  const ack = await w.fake.widgetAction('upcoming', 'done', undefined, {
    values: { task: FILTERS, date: '' },
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.de, '„Filtres de VMC“ erledigt, nächstes Mal am 09.05.2027.');
  assert.equal(w.fake.lastState(taskIds(w.gladys, FILTERS).feature('overdue')), 0);
  const late = await w.fake.widgetAction('upcoming', 'done', undefined, {
    values: { task: FILTERS, date: '2030-01-01' },
  });
  assert.equal(late.success, false);
  const gone = await w.fake.widgetAction('upcoming', 'done', undefined, {
    values: { task: 'nope' },
  });
  assert.match(gone.error, /no longer exists/);
});
