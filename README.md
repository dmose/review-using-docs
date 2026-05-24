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

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for notes on the bundled `moz` MCP
dependency and the promptfoo-based eval harness.
