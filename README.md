# review-using-docs

A Claude Code skill that, when invoked on a code review task, first reads
`/mots.yaml` in the project root, maps each changed file to its module,
scans each module's `includes` for documentation paths (entries whose path
contains `docs` outside `docshell`), loads those reference docs, and *then*
performs the code review with those docs in context.

Built for Firefox / mozilla-central, but works in any tree whose top-level
`mots.yaml` follows the same shape (modules with `includes` paths that
identify their docs by containing `docs` outside `docshell`).

## Install

```bash
claude plugin marketplace add dmose/review-using-docs
claude plugin install review-using-docs@review-using-docs-local
```

(If the `owner/repo` shorthand isn't supported by your `claude` version, use
the full URL: `claude plugin marketplace add https://github.com/dmose/review-using-docs.git`.)

To uninstall:

```bash
claude plugin uninstall review-using-docs@review-using-docs-local
claude plugin marketplace remove review-using-docs-local
```

## Usage

In a Claude session inside the project you want to review:

```
/review-using-docs review the changed files under <some/subdir>
```

## MCP dependency: `moz`

The plugin declares a `moz` MCP server (HTTP, pointing at
`https://mcp-dev.moz.tools/mcp`) in `review-using-docs/.mcp.json`. This
makes the plugin self-contained: installing it in a fresh repo gives the
skill access to `moz` with no extra setup.

If you're using the plugin inside a Firefox checkout that *also* declares
`moz` at project scope, the two declarations dedupe automatically.
Claude Code's [scope precedence](https://code.claude.com/docs/en/mcp#scope-hierarchy-and-precedence)
is `local > project > user > plugin > claude.ai connectors`, and plugin
entries match by endpoint — so a project-scope `moz` at the same URL
wins and the plugin's entry is silently dropped. No conflict, nothing
for the user to disable.

The dependency is declared in a separate `.mcp.json` (not inline in
`plugin.json`) because inline `mcpServers` is currently dropped during
manifest parsing
([anthropics/claude-code#16143](https://github.com/anthropics/claude-code/issues/16143)).

## Eval

`eval/` contains an output-based canary eval. The fixture's reference doc
contains a unique canary phrase (`REVIEW_CONTRACT_STABLE_WIDGET_IDS`) plus
an instruction to mention it when a specific invariant is violated. The
fixture patch violates that invariant. The grader greps the model output
for the canary, the offending file path, and the offending change — the
canary cannot plausibly appear unless the model actually loaded the doc
via `mots.yaml`.

```bash
bash eval/run.sh                  # default: skill-direct x all fixtures + plugin-install x smoke fixture
bash eval/run.sh --mode skill     # skill-direct on every fixture
bash eval/run.sh --mode plugin    # plugin-install on every fixture (slower; catches packaging regressions)
bash eval/run.sh --fixture NAME   # scope to one fixture
bash eval/run.sh --self-test      # exercise the runner's helpers against a mock claude
```

Exits 0 with `Total: N runs, 0 failure(s)` on success. Plugin state is
scoped per-fixture via `CLAUDE_CODE_PLUGIN_CACHE_DIR` + `--scope local`, so
the eval does not touch `~/.claude/`.

Override the Claude invocation via `CLAUDE_CMD=…` and preserve work dirs
for inspection with `KEEP_WORK_DIR=1`.

To add a new eval, drop a directory under `eval/fixtures/<name>/` containing
`mots.yaml`, `prompt.txt`, `patch.diff`, `expected.json`, and `browser/`.
`bash eval/run.sh` picks it up automatically.
