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

`eval/` contains an output-based canary eval driven by
[promptfoo](https://www.promptfoo.dev/). Each fixture stages a synthetic
working tree, runs the real `claude` CLI against it (via
`providers/claude-cli.ts`), and grades the response with assertions
declared in the fixture's `expected.json`. The provider invokes Claude
with `--output-format stream-json --verbose` so assertions can target
both the final assistant text and the underlying tool invocations.

The canonical fixture (`basic-doc-selection`) puts a unique canary phrase
(`REVIEW_CONTRACT_STABLE_WIDGET_IDS`) in a reference doc and a violating
change in the patch. The canary cannot plausibly appear in the review
unless the model actually loaded the doc via `mots.yaml`.

```bash
npm run eval            # default: skill-direct x all fixtures + plugin-install x smoke fixture
npm run eval:plugin     # plugin-install on every fixture (slower; catches packaging regressions)
npm run eval:selftest   # exercise the provider end-to-end against a mock `claude` shim
npm test                # unit tests for the provider + stream-json parser
```

To scope a run to one fixture, pass a filter through to promptfoo:

```bash
NODE_OPTIONS='--import tsx' npx promptfoo eval -c promptfooconfig.ts \
  --filter-pattern '^basic-doc-selection$'
```

Plugin state is scoped per-fixture via `CLAUDE_CODE_PLUGIN_CACHE_DIR` +
`--scope local`, so the eval does not touch `~/.claude/`.

Override the Claude invocation via `CLAUDE_CMD=…` and preserve work dirs
for inspection with `KEEP_WORK_DIR=1`.

### Adding a fixture

Drop a directory under `eval/fixtures/<name>/` containing `mots.yaml`,
`prompt.txt`, `patch.diff`, `expected.json`, and `browser/`. The test
generator (`tests/generate.ts`) picks it up automatically.

`expected.json` supports three assertion families:

```json
{
  "required_substrings": ["..."],
  "forbidden_substrings": ["..."],
  "tool_calls": [
    { "name": "mcp__moz__get_phabricator_revision", "input_contains": "291014" }
  ]
}
```

`tool_calls` asserts on the actual `tool_use` events captured from the
stream-json output, not on text mentions of the tool name — use it when
you want to verify the model genuinely invoked a tool with the expected
input.
