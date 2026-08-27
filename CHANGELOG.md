# Changelog

## [0.1.1] - 2026-08-27

### Added

- Operators can use the Admin console comfortably across mobile, tablet, and desktop widths.
- Operators can open the navigation from a mobile menu and move between Admin workflows without losing context.
- Responsive browser coverage now checks Stores, Inbox, Queue, Posts, Users, and Settings at four viewport sizes.

### Changed

- Inbox switches between the conversation list and detail view on compact screens.
- Queue keeps its wide five-column workflow inside a local horizontal scroll area instead of widening the page.
- Store controls and cards reflow to fit narrow screens while preserving usable touch targets.

### Fixed

- Desktop sidebar labels no longer render as a broken inline row.
- Store cards and mobile controls no longer create page-level horizontal overflow.
- Removed unused-variable lint warnings from the publish route and media store.
