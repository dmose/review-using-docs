# review-using-docs

A Claude Code skill that reviews changed files with the relevant
module documentation loaded into context.

Docs are sourced from `mots.yaml` in mozilla-central.

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
