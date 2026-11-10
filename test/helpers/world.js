// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a temporary /data, a manual
// clock and the Paris time zone, with the integration wired on top through
// registerHandlers. No timer runs: the tests call `world.hub.tick()`.
// -----------------------------------------------------------------------------

import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { TaskStore } from '../../src/store.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const TIME_ZONE = 'Europe/Paris';
// Monday 9 November 2026, 10:00 in Paris.
export const START = Date.UTC(2026, 10, 9, 9, 0, 0);
export const DAY = 86_400_000;
export const BASE_CONFIG = { language: 'en' };

// A realistic /data/tasks.json, on START: the boiler due in 11 days (notice
// 30: due soon), the ventilation filters 8 days late, the coffee machine
// descaling in 36 days, the vehicle inspection in March 2027.
export const FIXTURE_DIR = new URL('../fixtures/data/', import.meta.url);
export const BOILER = 'b01e2c3d4e5f';
export const FILTERS = 'f11a2b3c4d5e';
export const DESCALING = 'd33c4d5e6f70';
export const CAR = 'c44d5e6f7081';

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const emptyDataDir = () => mkdtempSync(join(tmpdir(), 'gladys-entretien-'));

/** A temporary /data holding the fixture tasks.json. */
export function fixtureDataDir() {
  const dir = emptyDataDir();
  cpSync(new URL('tasks.json', FIXTURE_DIR), join(dir, 'tasks.json'));
  return dir;
}

export async function createWorld({
  clock = createClock(),
  config = BASE_CONFIG,
  devices = [],
  dataDir = fixtureDataDir(),
  store,
  connect = true,
  timeZone = TIME_ZONE,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: store ?? new TaskStore(dataDir),
    timers: false,
    now: clock.now,
    timeZone,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, app, hub: app.hub, clock, dataDir };
}

export const taskIds = (gladys, id) => gladys.externalIds('task', id);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}
