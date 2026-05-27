# review-using-docs

An experimental time-saving Claude Code skill that code-reviews
changes with relevant module documentation loaded into context to
help catch module-specific issues.

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

## PLEASE GIVE FEEDBACK!

* What's working well?
* What could be better?
* What's puzzling or unclear?

[**#fxms-review-experiments**](https://mozilla.enterprise.slack.com/archives/C0B5UQ806MR)
channel on Slack

## Known issues
* This plugin may fail when run outside of a Firefox source tree.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for notes on the bundled `moz` MCP
dependency and the promptfoo-based eval harness.
