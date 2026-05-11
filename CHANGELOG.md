# Changelog

All notable changes to `@clawapps/cli`.

## [1.1.0] — unreleased (pending Phase 2 PROD verification complete)

### Added
- `clawapps agent profile show` — read the user's auto-created assistant role from
  BE `GET /api/v1/agent/profile` (full `_agent_out` shape including agent-only
  fields `care_mode` / `allow_escalation`).
- `clawapps agent profile set <key=value>...` — update assistant profile via BE
  `PUT /api/v1/agent/profile`. Accepts `display_name`, `description`, `prompt`,
  `avatar_url`, `visibility`, `care_mode`, `tags` (comma-separated → array).
- `clawapps model set tier=fast|balanced|smart` — set opaque model tier preference.
  Implementation forwards `preferred_tier` to BE; BE runtime-gates by membership
  (free → fast only; pro_creator → fast/balanced; pro_developer → all).
- `clawapps-switch` shell helper (separate `/usr/local/bin/clawapps-switch`)
  documented as a dev-only multi-credential tool (not packaged in npm bundle).

### Changed
- `clawapps model list` no longer returns specific model IDs (claude-opus-4-7
  etc). Returns opaque `{info, configurable, tiers}` shape. Per security review
  R-21: clients must not see model identity.
- `clawapps model set` rejects `claude=` / `codex=` / `model=` keys with a clear
  error. The old keys are silently ignored by BE anyway (pydantic
  extra-ignore); the CLI now stops accepting them so users get an explicit
  signal to migrate to `tier=`.
- `clawapps model get` and `clawapps whoami` no longer surface
  `preferred_claude_model` / `preferred_codex_model`. `whoami.preferences` now
  exposes `{preferred_tier, effective_tier, preferred_language, timezone, city}`.
- Defense-in-depth: `lib/relay-client.ts` scrubs model identity fields from any
  BE response before returning to command code, protecting against BE schema
  regressions.

### Internal
- `lib/types.ts` `Preferences` interface dropped `preferred_*_model`, added
  `preferred_tier` / `effective_tier`.
- `lib/relay-client.ts` `scrubModelLeaks()` helper applied in `getMe()` +
  `setPreferences()`.

### Migration notes for end users
- Anyone with scripts calling `clawapps model set claude=...` should switch to
  `clawapps model set tier=fast|balanced|smart`. Old form now errors out instead
  of silently being ignored.
- `clawapps model list` output shape changed: `{claude:[...], codex:[...]}` →
  `{info, configurable, tiers}`. Scripts parsing the old shape need updating.

### Coordinated with
- cli-relay 3.0.0 (private) — must be deployed before this CLI version to support
  `/cli/v1/agent/profile` + `/cli/v1/membership/policy` + tier-aware
  `/cli/v1/preferences`. PROD CN-1 already running this build as of 2026-05-11.
- clawapps-api commits 6a8619d / 91402eb / d6f45cf / 5473146 / fe8aeb6 / 493a403
  / 0da1172 — PROD landed 2026-05-11.

---

## [1.0.2] — 2026-05 (last published)

Baseline at the start of the PROD cold-start reverse推演 round.

See git history for prior releases.
