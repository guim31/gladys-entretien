// -----------------------------------------------------------------------------
// Calendar arithmetic: periods across month ends and leap years, local dates
// across time zones and daylight saving time, the dates users type.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPeriod, daysBetween, formatDate, localDate, parseDate } from '../src/tasks/dates.js';
import { taskStatus, validPeriod } from '../src/tasks/model.js';

test('a month later keeps the day, or takes the last day of a shorter month', () => {
  assert.equal(addPeriod('2026-01-31', 1, 'months'), '2026-02-28');
  assert.equal(addPeriod('2028-01-31', 1, 'months'), '2028-02-29');
  assert.equal(addPeriod('2026-03-31', 1, 'months'), '2026-04-30');
  assert.equal(addPeriod('2026-08-31', 6, 'months'), '2027-02-28');
  assert.equal(addPeriod('2026-11-15', 2, 'months'), '2027-01-15');
  assert.equal(addPeriod('2026-12-31', 1, 'months'), '2027-01-31');
  assert.equal(addPeriod('2026-05-10', 120, 'months'), '2036-05-10');
});

test('29 February plus a year is 28 February, plus four years 29 February', () => {
  assert.equal(addPeriod('2028-02-29', 1, 'years'), '2029-02-28');
  assert.equal(addPeriod('2028-02-29', 4, 'years'), '2032-02-29');
  assert.equal(addPeriod('2027-02-28', 1, 'years'), '2028-02-28');
});

test('days and weeks cross months, years and leap days', () => {
  assert.equal(addPeriod('2026-12-25', 10, 'days'), '2027-01-04');
  assert.equal(addPeriod('2028-02-27', 2, 'days'), '2028-02-29');
  assert.equal(addPeriod('2026-02-20', 2, 'weeks'), '2026-03-06');
  assert.equal(daysBetween('2028-02-01', '2028-03-01'), 29);
  assert.equal(daysBetween('2026-11-09', '2026-11-01'), -8);
});

test('the daylight saving change does not shift a day', () => {
  // Paris goes to summer time on 29 March 2026: 28 → 30 March is 2 days.
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
});

test('the local date follows the time zone of Gladys', () => {
  // 23:30 UTC on 31 December 2026.
  const now = Date.UTC(2026, 11, 31, 23, 30);
  assert.equal(localDate(now, 'UTC'), '2026-12-31');
  assert.equal(localDate(now, 'Europe/Paris'), '2027-01-01');
  assert.equal(localDate(now, 'America/Montreal'), '2026-12-31');
  assert.equal(localDate(now, 'Pacific/Auckland'), '2027-01-01');
  // Summer time: 22:30 UTC on 30 June is already 1 July in Paris.
  assert.equal(localDate(Date.UTC(2026, 5, 30, 22, 30), 'Europe/Paris'), '2026-07-01');
});

test('the dates users type', () => {
  const today = '2026-11-09';
  assert.equal(parseDate('2026-03-14', today), '2026-03-14');
  assert.equal(parseDate('2026-3-4', today), '2026-03-04');
  assert.equal(parseDate('14/03/2026', today), '2026-03-14');
  assert.equal(parseDate(' 14.03.2026 ', today), '2026-03-14');
  assert.equal(parseDate('14-03-2026', today), '2026-03-14');
  assert.equal(parseDate('29/02/2028', today), '2028-02-29');
  assert.equal(parseDate('-7', today), '2026-11-02');
  assert.equal(parseDate('-0', today), today);
  assert.equal(parseDate('', today), null);
  assert.equal(parseDate(undefined, today), null);
  for (const wrong of ['29/02/2026', '31/04/2026', '2026-13-01', 'yesterday', '14/03/26', '+3']) {
    assert.throws(() => parseDate(wrong, today), RangeError, wrong);
  }
});

test('dates are shown the way each language writes them', () => {
  assert.equal(formatDate('2026-03-14', 'fr'), '14/03/2026');
  assert.equal(formatDate('2026-03-14', 'de'), '14.03.2026');
  assert.equal(formatDate('2026-03-14', 'es'), '14/03/2026');
  assert.equal(formatDate('2026-03-14', 'en'), '03/14/2026');
  assert.equal(formatDate('nope', 'fr'), '');
});

test('periods: 1 to 120 units, ten years at most', () => {
  assert.ok(validPeriod(1, 'days'));
  assert.ok(validPeriod(120, 'months'));
  assert.ok(validPeriod(10, 'years'));
  assert.ok(!validPeriod(11, 'years'));
  assert.ok(!validPeriod(0, 'days'));
  assert.ok(!validPeriod(1.5, 'months'));
  assert.ok(!validPeriod(1, 'decades'));
});

test('the status of a task: due soon within the notice, overdue the day after', () => {
  const task = { last_done: '2025-11-20', every: 1, unit: 'years', notice_days: 30 };
  assert.deepEqual(taskStatus(task, '2026-10-20'), {
    due: '2026-11-20',
    daysLeft: 31,
    periodDays: 365,
    overdue: false,
    soon: false,
    life: 8,
  });
  assert.equal(taskStatus(task, '2026-10-21').soon, true);
  const dueDay = taskStatus(task, '2026-11-20');
  assert.equal(dueDay.soon && !dueDay.overdue && dueDay.daysLeft === 0 && dueDay.life === 0, true);
  const late = taskStatus(task, '2026-11-21');
  assert.equal(late.overdue && !late.soon && late.daysLeft === -1, true);
  assert.equal(taskStatus(task, '2025-11-20').life, 100);
});
