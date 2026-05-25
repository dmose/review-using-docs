# review-using-docs

A Claude Code skill that reviews changed files with the relevant
module documentation loaded into context.

Docs are sourced from `mots.yaml` in mozilla-central.

## Install

```bash
claude plugin marketplace add dmose/review-using-docs
claude plugin install review-using-docs@review-using-docs-local
```

After install, enable auto-update for this marketplace through the UI to receive future updates (third-party marketplaces are opted out by default):

1. Start `claude`
2. Run `/plugin` to open the plugin manager
3. Select `Marketplaces`
4. Choose `review-using-docs-local` from the list
5. Select `Enable auto-update`

If you have issues see the [Claude Code Docs Page](https://code.claude.com/docs/en/discover-plugins#configure-auto-updates) for more details.

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
