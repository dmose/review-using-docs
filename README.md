# review-using-docs

A Claude Code skill that reviews changed files with the relevant
module documentation loaded into context.

Docs are sourced from `mots.yaml` in mozilla-central.

## Install

```bash
claude plugin marketplace add dmose/review-using-docs
claude plugin install review-using-docs@review-using-docs-local
```

## Usage examples, from the Claude Code prompt:

As patch author, get a rough-draft automated review of your own local changes before submitting:
```
/review-using-docs the code on this branch
```

As a patch reviewer, get a rough-draft automated review to of a Phabricator
patch to (hopefully!) save time before you dig in further:
```
/review-using-docs D300426
```

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for notes on the bundled `moz` MCP
dependency and the promptfoo-based eval harness.
