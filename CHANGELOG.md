# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- README feedback prompt reworded from "What's confusing?" to "What's
  puzzling or unclear?".

## [0.2.0] - 2026-05-26

### Changed

- README feedback section reformatted with prompting questions and
  pointed at the `#fxms-review-experiments` Slack channel (previously
  `#fxms-auto-review`).

## [0.1.1] - 2026-05-25

### Added

- `bin/release.mjs` release script that bumps the plugin and marketplace
  versions in lockstep, rewrites the `## [Unreleased]` section in
  `CHANGELOG.md` to a versioned heading with a GitHub compare link, commits,
  tags `vX.Y.Z`, and pushes `develop`, `main`, and the tag. Hardened against
  partial failures: all new file contents are computed in memory before any
  write, preflight checks confirm `plugin.json` `name` and
  `marketplace.json` `source` align, and a stale `vX.Y.Z` tag that isn't an
  ancestor of `develop` prompts before linking.
- `Module Overrides` section in the `review-using-docs` skill that supplements
  `/mots.yaml` `includes` for modules whose upstream mots.yaml patch is still
  in review. Initial entry covers `inproduct_messaging` (ASRouter,
  about:welcome, messaging-system schemas, and UITour docs); remove when
  those paths appear under `inproduct_messaging` in `/mots.yaml`.
- `review-using-docs` skill that maps changed files to modules via `/mots.yaml`,
  loads each module's documentation from `includes` paths, and performs the
  review with those docs in context.
- Output-based canary eval driven by [promptfoo](https://www.promptfoo.dev/),
  with a strict-typed TypeScript provider (`providers/claude-cli.ts`) that
  stages each fixture in a tmp git repo and shells out to `claude -p`.
  Fixture-derived test cases come from `tests/generate.ts`; npm scripts cover
  the default skill-direct run, plugin-install across all fixtures
  (`eval:plugin`), and a self-test against a mock `claude` shim
  (`eval:selftest`). Plugin state is scoped per-fixture via
  `CLAUDE_CODE_PLUGIN_CACHE_DIR` + `--scope local` so the eval does not touch
  `~/.claude/`. `node:test` suite (`tests/provider.test.ts`) covers provider
  edge cases.
- Marketplace + plugin packaging (`.claude-plugin/marketplace.json`,
  `review-using-docs/.claude-plugin/`) so the skill can be installed via
  `claude plugin marketplace add` / `claude plugin install`.
- `moz` MCP server dependency declared in the plugin's `.mcp.json`, making
  the plugin self-contained while deduping cleanly against a project-scope
  `moz` declaration in a Firefox checkout.

### Changed

- Restructured the repository as a marketplace + plugin layout.
- Split developer-only docs (MCP dependency notes, eval harness) out of the
  README into `DEVELOPMENT.md`; README now focuses on install and usage.
- Reframed the README intro around the user-facing value (review with
  module docs in context), replaced the long technical description with
  concrete usage examples for patch-author and patch-reviewer flows, added
  a feedback link to the `#fxms-auto-review` Slack channel, and surfaced
  the third-party marketplace auto-update opt-in steps.
- `DEVELOPMENT.md` now documents how to link a working dev tree into a
  local Firefox checkout via `claude plugin marketplace add --scope local`.
- Eval provider now invokes `claude -p --output-format stream-json --verbose`
  and parses the NDJSON event stream, exposing `tool_use` invocations in
  `metadata.toolCalls`. Fixtures can assert on tool calls via a new
  `tool_calls` field in `expected.json`, closing the false-positive gap where
  substring-only assertions could pass on model narration alone.

### Fixed

- Skill now reads reference-material paths (documentation and schemas) from
  each module's `includes` field (filtering for entries matching the regex
  `docs(?!hell)|schemas?`) rather than a non-existent `docs:` field.
- Eval fixture's `mots.yaml` shape aligned with the real `mots.yaml`
  schema used by mozilla-central.

### Build

- Repo-level `.npmrc` sets `omit=optional`, skipping promptfoo's optional
  cloud-provider SDKs (AWS, Azure, GCP auth, IBM, Playwright, Sharp, swc,
  HuggingFace, etc.). Drops `npm install` footprint from ~692 to ~416
  packages.

[Unreleased]: https://github.com/dmose/review-using-docs/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dmose/review-using-docs/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/dmose/review-using-docs/releases/tag/v0.1.1
