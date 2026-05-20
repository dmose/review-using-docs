# review-using-docs

A Claude Code skill that, when invoked on a code review task, first reads
`/mots.yaml` in the project root, maps each changed file to its module,
follows the module's `docs` field to load the relevant reference docs, and
*then* performs the code review with those docs in context.

Built for Firefox / mozilla-central, but works in any tree whose top-level
`mots.yaml` follows the same shape (modules with `includes` and `docs`).

## Install into a project

Symlink the skill directory into the project's `.claude/skills/`:

```bash
ln -s ~/s/llm-tools/review-using-docs/claude-skill/review-using-docs \
      <project>/.claude/skills/review-using-docs
```

Then in a Claude session inside `<project>`:

```
/review-using-docs review the changed files under <some/subdir>
```

## Eval

`eval/` contains an Option-2 (output-based canary) eval. The fixture's
reference doc contains a unique canary phrase
(`REVIEW_CONTRACT_STABLE_WIDGET_IDS`) plus an instruction to mention it when
a specific invariant is violated. The fixture patch violates that invariant.
The grader greps the model output for the canary, the offending file path,
and the offending change — the canary cannot plausibly appear unless the
model actually loaded the doc via `mots.yaml`.

Run it:

```bash
bash eval/run-eval.sh
```

Exits 0 with `PASSED: all assertions passed` on success. Override the Claude
invocation via `CLAUDE_CMD=…` if needed.
