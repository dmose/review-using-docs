# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `review-using-docs` skill that maps changed files to modules via `/mots.yaml`,
  loads each module's documentation from `includes` paths, and performs the
  review with those docs in context.
- Output-based canary eval (`eval/`) with fixtures, runner (`run.sh`), and
  grader (`grade.py`). Supports `--mode skill`, `--mode plugin`, `--fixture`,
  and `--self-test`. Plugin state is scoped per-fixture so the eval does not
  touch `~/.claude/`.
- Marketplace + plugin packaging (`.claude-plugin/marketplace.json`,
  `review-using-docs/.claude-plugin/`) so the skill can be installed via
  `claude plugin marketplace add` / `claude plugin install`.
- `moz` MCP server dependency declared in the plugin's `.mcp.json`, making
  the plugin self-contained while deduping cleanly against a project-scope
  `moz` declaration in a Firefox checkout.

### Changed

- Restructured the repository as a marketplace + plugin layout and unified
  the eval runner around a single `run.sh` driving both skill-direct and
  plugin-install modes.
- Eval provider now invokes `claude -p --output-format stream-json --verbose`
  and parses the NDJSON event stream, exposing `tool_use` invocations in
  `metadata.toolCalls`. Fixtures can assert on tool calls via a new
  `tool_calls` field in `expected.json`, closing the false-positive gap where
  substring-only assertions could pass on model narration alone.

### Fixed

- Skill now reads documentation paths from each module's `includes` field
  (filtering for entries whose path contains `docs` outside `docshell`)
  rather than a non-existent `docs:` field.
- Eval fixture's `mots.yaml` shape aligned with the real `mots.yaml`
  schema used by mozilla-central.

[Unreleased]: https://github.com/dmose/review-using-docs/commits/main
