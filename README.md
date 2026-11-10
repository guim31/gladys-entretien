# Maintenance reminders for Gladys Assistant

The recurring maintenance of the house — boiler service, ventilation filters,
chimney sweeping, vehicle inspection, descaling, smoke detector batteries… —
kept **in Gladys itself**, with no account, no cloud and no other server.

## Features

- **Tasks** created from the Configuration screen: thirteen suggested ones
  (boiler 1 year, chimney 1 year, vehicle inspection 2 years, ventilation
  filters 6 months…) or your own, every N days, weeks, months or years, with
  the last date done and a notice period.
- **One device per task**: days left, part of the period left (%), due soon,
  overdue, last done, next due date, kept in the history and usable in scene
  conditions.
- **Dashboard widget** "Upcoming maintenance": the next tasks by due date,
  late ones in red, due soon in orange, and a **Done** button (today or a
  given date). The count and the button can be hidden.
- **Scene triggers**: maintenance due soon, maintenance overdue (once per
  due date each).
- **Scene actions**: mark maintenance as done, read the tasks as one text
  (for a message or a spoken announcement).
- **Persistence** in one JSON file under `/data`: atomic writes, a backup of
  the previous version, versioned schema, an unreadable file kept aside.
- Four languages: English, French, German, Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later.
- Nothing else.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-entretien`
   (or install **Maintenance reminders** from the catalog once it is
   listed).
2. In **Configuration**, click **Create or change a task**: a suggested task
   or a name and a period, and the last date it was done.
3. Open the **Discovery** tab and add the task, then put the **Upcoming
   maintenance** widget on a dashboard.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The tasks live in `/data/tasks.json` (schema version 1), the only writable
path of the sandboxed container. Every change runs alone, on a copy of the
tasks, is written to a temporary file flushed to disk and renamed over
`tasks.json` (the previous version is copied to `tasks.json.bak` first), and
only then is sent to Gladys: states, widget refresh. A change that cannot be
written changes nothing and is reported to the user.

Dates are local `YYYY-MM-DD` strings in the time zone of Gladys (`TZ`): a
task is due `every` units after the last time it was done; a month or a year
later keeps the day of the month or takes the last day of a shorter month
(31 January + 1 month = 28 February, 29 February + 1 year = 28 February).

Each task gets a random id at its creation: the device external id is built
from it, never from the name. The devices are published with
`should_poll: false`; a minute timer of the container follows the date,
fires the reminders (remembered in the file, so a restart does not repeat
them) and republishes the states that changed, plus a 12-hour heartbeat.

The due dates are not entries of the Gladys calendar: a calendar integration
has no devices, and a device integration cannot write calendar events
(Gladys 5.3). The device features, the widget and the scenes cover the use.

## Tested, and what was not

- **Tested** (`npm test`, 80+ tests): the period arithmetic (month ends,
  29 February, time zones, daylight saving time), the reminders (once per
  due date, across restarts, retried when Gladys refuses), "done" from the
  widget, the scenes and the Configuration screen, the persistence (restart,
  truncated file, backup, concurrent changes, failed write), the widget
  content against the SDK's `validateWidgetContent`, the conformity of the
  devices with the feature table of the Gladys core, the four languages.
- **Tested in the Docker image**, with the constraints of the Gladys sandbox
  (read-only rootfs, all capabilities dropped, 256 MB): the image starts,
  fails cleanly without Gladys, and the tasks written in the volume survive
  a restart of the container.
- **Not tested**: a real Gladys instance. Feedback welcome.

## Limitations

- 100 tasks, a period of ten years at most, one date per task (no time of
  day).
- No entries in the Gladys calendar (see above), no import from another
  service.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and a temporary `/data`. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- The idea follows the maintenance and chore trackers of the Home Assistant
  community (such as the Home Maintenance custom integration); no code was
  copied.
- The architecture, the persistence and the conformity tests follow
  [gladys-local-lists](https://github.com/guim31/gladys-local-lists) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Home Assistant
or the Open Home Foundation.

## License

Apache-2.0
