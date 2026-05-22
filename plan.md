# Consolidate evals + reshape repo as marketplace+plugin

## Context

Two eval scripts (`eval/run-eval.sh`, `eval/run-plugin-eval.sh`) test the
`review-using-docs` skill against the same fixture via different install
paths. Adding more fixtures over time would mean touching each script.

The plugin eval also synthesizes its own plugin and marketplace bundle from
templates under `eval/marketplace-source/` and `eval/plugin-source/` — those
templates are effectively authoritative but live under `eval/`, so the eval
is grading a distribution shape it invents itself rather than the shape this
repo will actually ship.

User intends to add more fixtures over time; adding one should be a
zero-code-change drop-in.

Goals:
- Reshape repo as a marketplace containing one plugin so manifests live at
  authoritative locations and end users can install via
  `claude plugin marketplace add` against the GitHub repo.
- Replace both eval scripts with a single `eval/run.sh` that auto-discovers
  fixtures under `eval/fixtures/*/` and supports both install modes.
- Apply fixes from the multi-LLM plan review (notably: per-fixture state
  hygiene, marketplace description/homepage corrections, github-based
  README install).

## Target shape

```
/                                          # repo root = marketplace
├── README.md
├── .claude-plugin/
│   └── marketplace.json                   # was eval/marketplace-source/.claude-plugin/marketplace.json
├── review-using-docs/                     # the plugin
│   ├── .claude-plugin/
│   │   └── plugin.json                    # was eval/plugin-source/.claude-plugin/plugin.json
│   └── skills/
│       └── review-using-docs/
│           └── SKILL.md                   # was claude-skill/review-using-docs/SKILL.md
└── eval/
    ├── grade.py                           # unchanged
    ├── run.sh                             # NEW: replaces run-eval.sh + run-plugin-eval.sh
    └── fixtures/
        └── basic-doc-selection/           # unchanged
```

Deleted: `claude-skill/`, `eval/marketplace-source/`, `eval/plugin-source/`,
`eval/run-eval.sh`, `eval/run-plugin-eval.sh`.

## Implementation

### Step 1 — Restructure repo

- `git mv claude-skill/review-using-docs/SKILL.md review-using-docs/skills/review-using-docs/SKILL.md` (preserve history; `claude-skill/` is tracked). Create needed parent dirs first.
- Move untracked `eval/marketplace-source/.claude-plugin/marketplace.json` → `.claude-plugin/marketplace.json` (plain `mv`).
- Move untracked `eval/plugin-source/.claude-plugin/plugin.json` → `review-using-docs/.claude-plugin/plugin.json` (plain `mv`).
- `rm -rf claude-skill/ eval/marketplace-source/ eval/plugin-source/` once moves are done.

**Manifest content updates (not "moved unchanged"):**

- `.claude-plugin/marketplace.json`: rewrite `description` (current text references `eval/run-plugin-eval.sh`, a file we're deleting). New text describes the marketplace as the authoritative distribution channel for the plugin.
- `review-using-docs/.claude-plugin/plugin.json`: fix `homepage` from `https://github.com/dmosedale/llm-tools/tree/main/review-using-docs` (wrong owner + monorepo path) to `https://github.com/dmose/review-using-docs` (actual repo per `git remote -v`).
- Marketplace name (`review-using-docs-local`) is kept as-is for this revision — the `-local` suffix is mildly misleading once distributed publicly, but renaming changes the install ID and breaks any existing local users; flagged for a follow-up decision rather than fixed here.

### Step 2 — Build `eval/run.sh`

Single entrypoint replacing both old scripts.

**CLI:**
- `bash eval/run.sh` — default `--mode both`: skill-direct × every fixture + plugin-install × `SMOKE_FIXTURE` (smoke test for distribution path)
- `bash eval/run.sh --mode skill` — skill-direct × every fixture
- `bash eval/run.sh --mode plugin` — plugin-install × every fixture (use this periodically to catch packaging regressions on newer fixtures)
- `bash eval/run.sh --fixture NAME` — scope to one fixture; respects `--mode` (in `both` mode, runs both skill and plugin for that fixture)
- `bash eval/run.sh --self-test` — helper-level tests against a mock `claude`

**Per-fixture state hygiene (review finding H1):**

Each fixture×mode invocation must own its own state. Concretely:
- Each invocation computes its own `work_dir="${TMPDIR}/review-using-docs-eval-$mode-$fixture-$$"`. The `WORK_DIR` env override from `run-plugin-eval.sh` is dropped (it was single-run safe; with iteration it collides). Honor `KEEP_WORK_DIR=1` per fixture for debugging.
- No `trap … RETURN` across the run loop. Each fixture runs inside its own subshell `( … )` so failures don't poison subsequent fixtures; cleanup is an explicit final step in the subshell.
- `CLAUDE_CODE_PLUGIN_CACHE_DIR` is set inline (`CLAUDE_CODE_PLUGIN_CACHE_DIR=$work_dir/plugin-cache claude plugin …`), never `export`ed at script scope, so skill-mode runs don't inherit a plugin cache.

**Run aggregation:**
- Continue-on-error: a fixture×mode failure records the failure and proceeds to the next; runner exits non-zero iff any failed. Bash `set -e` is *not* used at the loop level; individual setup commands inside a fixture still fail fast for that fixture.
- Final summary line per pair: `[skill] <fixture> PASS|FAIL`, `[plugin] <fixture> PASS|FAIL`, followed by a count.

**Fixture discovery (review finding M8):**
- Enumerate via `find eval/fixtures -mindepth 1 -maxdepth 1 -type d -print0 | sort -z`, not bash glob (avoids the literal-pattern-on-empty footgun).
- For each candidate, validate required files (`mots.yaml`, `prompt.txt`, `patch.diff`, `expected.json`, `browser/`, `docs/`); if missing, **skip with a warning** rather than abort (lets WIP fixtures coexist).
- If zero valid fixtures found, exit non-zero with a clear message.

**Mode internals:**
- `run_skill_mode <fixture>`: stage fixture → init git + apply patch → `mkdir -p $work_dir/.claude/skills/review-using-docs && cp <skill-src> …` → run `claude -p` → grade.
- `run_plugin_mode <fixture>`: stage fixture → init git + apply patch → `claude plugin validate $REPO_ROOT` + `claude plugin validate $REPO_ROOT/review-using-docs` (review finding M1: `marketplace add` is not a substitute for explicit validate) → `(cd $work_dir && CLAUDE_CODE_PLUGIN_CACHE_DIR=$work_dir/plugin-cache claude plugin marketplace add $REPO_ROOT --scope local && CLAUDE_CODE_PLUGIN_CACHE_DIR=$work_dir/plugin-cache claude plugin install review-using-docs@review-using-docs-local --scope local)` → if `enabledPlugins` is not already populated by install, write it (current `enable_plugin` helper; **verify during implementation** whether install populates it on its own — if so, drop the helper, per review finding M4) → run `claude -p` → grade. **No** marketplace cleanup needed: `--scope local` writes registration to `$work_dir/.claude/settings.local.json`, which dies with `$work_dir`.
- Preserve env-var hooks: `CLAUDE_CMD`, `GRADE_CMD`. Drop `WORK_DIR` (replaced by per-fixture compute). Keep `KEEP_WORK_DIR=1`.

**Self-test updates (review finding M9):**
- Drop `test_create_plugin_bundle_writes_self_contained_manifests` (no synthesis anymore).
- **Add** `test_authoritative_manifests_have_expected_fields`: reads `.claude-plugin/marketplace.json` + `review-using-docs/.claude-plugin/plugin.json`; asserts `name`, `plugins[0].source`, `plugins[0].name`, and absence of the old stale description string. Catches manifest typos without needing a real `claude` run.
- Keep `test_enable_plugin_merges_local_settings`.
- Refactor `test_run_eval_stages_installs_invokes_and_grades`: assert `claude plugin marketplace add` is invoked with `$REPO_ROOT`; assert both `skill` and `plugin` modes complete against the mock claude.

### Step 3 — Update `README.md`

Replace the symlink install section with the GitHub install flow:

```bash
# Install
claude plugin marketplace add dmose/review-using-docs
claude plugin install review-using-docs@review-using-docs-local

# Uninstall (the inverse)
claude plugin uninstall review-using-docs@review-using-docs-local
claude plugin marketplace remove review-using-docs-local
```

(GitHub-shorthand syntax `owner/repo` per the claude plugin CLI; fall back to
`https://github.com/dmose/review-using-docs.git` if the shorthand is not
supported — **verify during implementation**.)

Then under `## Usage`: in a Claude session inside a project, `/review-using-docs review the changed files under <some/subdir>`.

Collapse the two eval sections into one section describing `bash eval/run.sh`
and its flags. Keep `CLAUDE_CMD` and `KEEP_WORK_DIR` mentions.

## Critical files

- New: `eval/run.sh`
- Moved: `claude-skill/review-using-docs/SKILL.md` → `review-using-docs/skills/review-using-docs/SKILL.md` (via `git mv`)
- Moved + content-edited: `eval/marketplace-source/.claude-plugin/marketplace.json` → `.claude-plugin/marketplace.json` (description rewrite); `eval/plugin-source/.claude-plugin/plugin.json` → `review-using-docs/.claude-plugin/plugin.json` (homepage fix)
- Deleted: `eval/run-eval.sh`, `eval/run-plugin-eval.sh`, `eval/marketplace-source/`, `eval/plugin-source/`, `claude-skill/`
- Edited: `README.md`
- Untouched: `eval/grade.py`, `eval/fixtures/`, `.claude/` session notes (historical), `.claude-octopus/`

## Verification

1. `claude plugin validate "$(pwd)"` and `claude plugin validate "$(pwd)/review-using-docs"` both pass after the move.
2. `bash eval/run.sh` — runs skill-direct × all fixtures + plugin-install × `basic-doc-selection`; exit 0; summary lists all `PASS`.
3. `bash eval/run.sh --mode skill` — exit 0 on `basic-doc-selection`.
4. `bash eval/run.sh --mode plugin` — exit 0 on `basic-doc-selection`.
5. `bash eval/run.sh --fixture basic-doc-selection` — equivalent to #2 scoped to one fixture.
6. `bash eval/run.sh --self-test` — including the new manifest-content test.
7. Manual end-user install smoke test in a fresh scratch dir:
   - `claude plugin marketplace add dmose/review-using-docs` (or full URL if shorthand unsupported)
   - `claude plugin install review-using-docs@review-using-docs-local`
   - Confirm the skill activates in a Claude session
   - Clean up: `claude plugin uninstall review-using-docs@review-using-docs-local && claude plugin marketplace remove review-using-docs-local`
8. `git status` — only the intended adds/moves/deletes appear; `git log --follow review-using-docs/skills/review-using-docs/SKILL.md` shows pre-move history (i.e. `git mv` worked).

Both current evals pass on `basic-doc-selection` (verified during planning).
After the refactor the same fixture should continue to pass under both modes.

## Adding future fixtures

Drop a new directory under `eval/fixtures/<name>/` containing `mots.yaml`,
`prompt.txt`, `patch.diff`, `expected.json`, `browser/`, `docs/`. No script
edits needed; `bash eval/run.sh` picks it up under skill-direct mode.

To exercise the plugin-install path on a new fixture, run
`bash eval/run.sh --mode plugin` or `bash eval/run.sh --mode plugin --fixture <name>`. The default `both` mode keeps `basic-doc-selection` as the
plugin smoke fixture for speed; change the `SMOKE_FIXTURE` constant in
`eval/run.sh` to rotate.

## Review findings handled vs. deferred

Addressed in this revision (from the multi-LLM plan review):
- **H1** (multi-fixture state hygiene): explicit per-fixture work_dir compute, no global trap, plugin-cache env scoped inline.
- **H2** (marketplace registration cleanup): the `--scope local` model already confines registration to `$work_dir/.claude/settings.local.json`; the original review finding was based on `--scope user` semantics. For end users, README documents the explicit uninstall + marketplace remove steps.
- **H3** (README install path): replaced author-local path with `claude plugin marketplace add dmose/review-using-docs`.
- **M1** (`marketplace add` doesn't validate deeply): keep explicit `claude plugin validate` calls in both plan verification and plugin-mode run.
- **M4** (install may already enable plugin): mark as a verify-during-implementation point; drop the helper if install handles it.
- **M6** (path-reference cleanup): `git mv` preserves history; manifest content updates (description, homepage) handled explicitly above.
- **M7** (stale marketplace description): rewritten as part of the move; marketplace rename flagged as a future decision.
- **M8** (fixture discovery edge cases): use `find … -type d -print0 | sort -z`; skip-with-warning on missing files; explicit empty-set check.
- **M9** (self-test loses manifest coverage): new `test_authoritative_manifests_have_expected_fields`.
- **L1** (`--fixture` semantics under `both`): clarified — runs both modes for the named fixture.
- **L2** (fail-fast vs continue-on-error): continue-on-error specified.
- **L3** (hardcoded absolute paths in verification): use `"$(pwd)"`.
- **L4** (manual smoke test cleanup): full uninstall + marketplace remove documented.
- **L5** (plugin.json homepage): fixed to `dmose/review-using-docs`.

Deferred (real findings, accepted as trade-offs or out-of-scope for this revision):
- **M2** (default `both` doesn't exercise plugin path for new fixtures): accepted as the cost of fast default loop; mitigated by documenting `--mode plugin` for periodic full coverage.
- **M3** (skill mode bypasses real plugin discovery): accepted — skill mode is a fast smoke test for skill *behavior*, not distribution mechanics.
- **M5** (`git apply patch.diff` fragile for unusual fixtures): documented as a known constraint; revisit when a real fixture needs it.
- **L6** (repo's `.claude/` near `marketplace add`): leave for implementation-time verification; likely benign.
- **Marketplace rename** (`-local` suffix): flagged for a separate decision; not changed here to avoid breaking install IDs mid-refactor.
