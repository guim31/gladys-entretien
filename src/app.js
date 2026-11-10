// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the hub, so index.js stays a few lines and the tests drive the
// very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { TasksHub } from './hub.js';
import { sceneActions } from './scenes.js';
import { TaskStore } from './store.js';
import { formatDate } from './tasks/dates.js';
import { taskStatus } from './tasks/model.js';
import { allLanguages, INIT_FAILED, perLanguage, UserError } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'entretien-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, now, timeZone, timers
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new TasksHub({
    gladys,
    store: options.store ?? new TaskStore(),
    now: options.now,
    timeZone: options.timeZone,
    timers: options.timers ?? true,
  });

  // Resolved once the tasks are loaded; every handler waits for it, so a
  // command arriving during the start is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      if (!hub.loaded) {
        throw new Error('The tasks are not loaded yet: see the integration logs');
      }
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): send again what Gladys may have lost.
        await hub.resync(config);
        return;
      }
      await hub.start(config);
      started = true;
    } catch (err) {
      if (started) {
        // The tasks are loaded and work: the next reconnection resynchronizes.
        logger.warn(`Resynchronization failed: ${err.message}`);
      } else {
        // Tried again at the next connection.
        logger.error('Initialization failed', err);
        await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
      }
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.publishDevices()));
  // The devices are published with should_poll: false; this only serves a
  // Gladys that would poll anyway.
  gladys.onPoll(whenReady(() => hub.publishStates()));
  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady(() => hub.onDeviceChanged()));
  gladys.onDeviceDeleted(whenReady(() => hub.onDeviceChanged()));
  gladys.onConfigUpdated(whenReady((config) => hub.reconfigure(normalizeConfig(config))));

  // Configuration actions: the answer is shown under the button, in the four
  // languages (the Configuration screen shows the user's one).
  const configurationAction = (fn) =>
    whenReady(async (fields = {}) => {
      try {
        return await fn(fields);
      } catch (err) {
        throw err instanceof UserError ? new Error(err.localized(hub.config.language)) : err;
      }
    });
  gladys.onAction(
    'create_task',
    configurationAction(async (fields) => {
      const { task, created } = await hub.saveTask(fields);
      const { due } = taskStatus(task, hub.today());
      return perLanguage(created ? 'created' : 'updated', (language) => ({
        name: task.name,
        date: formatDate(due, language),
      }));
    }),
  );
  gladys.onAction(
    'mark_done',
    configurationAction(async ({ name, date }) => {
      const { task } = await hub.markDone({ name: name ?? '', date, source: 'configuration' });
      const { due } = taskStatus(task, hub.today());
      return perLanguage('done', (language) => ({
        name: task.name,
        date: formatDate(due, language),
      }));
    }),
  );
  gladys.onAction(
    'delete_task',
    configurationAction(async ({ name }) => {
      const task = await hub.deleteTask({ name });
      return allLanguages('deleted', { name: task.name });
    }),
  );
  gladys.onAction(
    'show_tasks',
    configurationAction(async () =>
      Object.fromEntries(
        ['en', 'fr', 'de', 'es'].map((language) => [language, hub.summary(language)]),
      ),
    ),
  );

  for (const [key, handler] of Object.entries(sceneActions(hub))) {
    gladys.onSceneAction(key, whenReady(handler));
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, context = {}) =>
        widget.action(hub, { actionKey, params, ...context }),
      ),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
