# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-10

### Added

- Maintenance tasks created from the Configuration screen: thirteen suggested
  ones (boiler service, chimney sweeping, vehicle inspection, ventilation
  filters, vacuum cleaner filter, descaling, smoke detector batteries…) or
  your own, every N days, weeks, months or years, with a notice period.
- One device per task: days left, period left, due soon, overdue, last done
  and next due date.
- The "Upcoming maintenance" dashboard widget, with a Done button.
- Scene triggers "Maintenance due soon" and "Maintenance overdue", scene
  actions "Mark maintenance as done" and "Read the maintenance tasks".
- Tasks stored in `/data/tasks.json`, with atomic writes and a backup.
- English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-entretien/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-entretien/releases/tag/v1.0.0
