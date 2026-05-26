# TODO list
- [x] Workaround lack of OMC doc info with hardcoding
- [x] Make skill recognize schemas as worth reading
- [x] EDD reviews from phab
  - [x] add moz-mcp dependency
  - [x] add eval for phab usage
  - [x] manually check phab usage

## Documentation
- [x] How & when to use
- [x] Document auto-update
- [x] Must run inside Firefox tree, even when reviewing phab
- [x] Feedback on Slack please!

## Infra
- [x] Add CHANGELOG.md
- [x] Add dev docs to DEVELOPMENT.md
- [x] Create develop branch
- [x] Create versioned two-branch setup with release scriptage like compare
- [x] Do a release

## Testing
- [x] finish configuring mac snapshot
- [x] hardwire in this module's docs
- [x] verify release install

## Deploy
- [ ] Post to Slack
- [ ] ?create google doc with two example reviews x multiple outputs each?

## LATER:
### quality
- [ ] Dig into using existing review evals
- [ ] Check competitiveness with /code-review in CC
- [ ] Module choice
  - [ ] Force specific module?
  - [ ] Allow multiple?  Eval quality gate?
- [ ] Investigate using together with custom-module-reviewer
### dependencies
- [ ] merge OMC mots patch
  - [x] check & update patch
  - [ ] wait for review
  - [ ] merge into mozilla-central
  - [ ] remove Module Overrides entirely from this skill
-[ ] Make it run outside of firefox tree
-[ ] Consider ditching promptfoo entirely
### support other agents (Codex? OpenCode?)

