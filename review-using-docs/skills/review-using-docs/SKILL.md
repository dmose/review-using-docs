---
name: review-using-docs
description: Use this skill when reviewing changed files in a directory and relevant documentation should be selected from /mots.yaml before performing a normal code review.
---

# Review Using Docs

Use this skill when the user asks for a code review that should consult documentation first.

## Workflow

1. Identify the review scope.
   - Determine the requested directory, files, or patch range.
   - Get the changed file list from the active VCS.
   - Limit the review to changed files inside the requested scope unless the user asks for a broader review.

2. Map changed files to Mots modules.
   - Read `/mots.yaml`.
   - Match each changed file against module `includes` and `excludes`.
   - If multiple modules match, choose the most specific matching module.
   - Record the mapping from changed file to module name and `machine_name`.

3. Select reference docs from Mots.
   - For each matched module, read its `docs` field.
   - Treat links in `docs` as the reference sources for the review.
   - Deduplicate docs across modules.
   - Prefer local repository documentation when a `docs` entry clearly maps to a local file or directory.
   - Use external docs URLs from `docs` when no local equivalent is available.
   - Do not substitute nearby README files, generated Mots pages, or `meta.url` entries unless the matched module has no usable `docs` field.

4. Read docs before reviewing code.
   - Extract expected behavior, architecture, invariants, API contracts, ownership boundaries, and testing expectations.
   - Track which docs informed which files or modules.
   - If a matched module has no usable `docs` entries, say so briefly and continue with ordinary review.

5. Review the changed code normally.
   - Prioritize correctness, regressions, edge cases, API contract mismatches, missing tests, maintainability, and security or privacy risks.
   - Compare implementation and tests against the docs from `/mots.yaml`.
   - Use docs as reference sources, not unquestionable truth.
   - Flag stale or misleading docs only when the mismatch creates real engineering risk.

6. Report findings.
   - Findings first, ordered by severity.
   - Include precise file and line references.
   - Mention the relevant doc reference when it supports a finding.
   - Include open questions or assumptions.
   - Keep any summary brief and secondary.

## Firefox Notes

- Follow repository search guidance from `AGENTS.md`.
- Use `searchfox-cli` for Firefox source discovery outside local changed files.
- Use narrow local commands for changed-file discovery and reading selected docs.
- `/mots.yaml` is the source of module path metadata and review documentation links.
- The `docs` field in matched modules is the source of truth for reference material.
