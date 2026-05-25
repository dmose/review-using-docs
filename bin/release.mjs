#!/usr/bin/env node

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const PLUGIN_NAME = "review-using-docs";
const MARKETPLACE_JSON = join(ROOT, ".claude-plugin", "marketplace.json");
const PLUGIN_JSON = join(ROOT, PLUGIN_NAME, ".claude-plugin", "plugin.json");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const REPO_URL = "https://github.com/dmose/review-using-docs";

function run(cmd, opts) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", ...opts }).trim();
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function bumpVersion(current, part) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function tagExists(tag) {
  try {
    run(`git rev-parse --verify --quiet refs/tags/${tag}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// --- Preflight checks ---

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch !== "develop") {
  die(`Must be on the develop branch (currently on ${branch})`);
}

const status = run("git status --porcelain");
if (status) {
  die("Working tree is not clean. Commit or stash changes first.");
}

run("git fetch origin");
const behind = run("git rev-list HEAD..origin/develop --count");
if (behind !== "0") {
  die("Local develop is behind origin/develop. Pull first.");
}

const mainAhead = run("git rev-list develop..origin/main --count");
if (mainAhead !== "0") {
  die("origin/main has commits not on develop. Rebase develop onto main first.");
}

const localMainDiverged = run("git rev-list origin/main..main --count");
if (localMainDiverged !== "0") {
  die("Local main has diverged from origin/main. Reconcile before releasing.");
}

const newOnDevelop = run("git log --oneline origin/main..develop");
if (!newOnDevelop) {
  die("No new commits on develop since last release. Nothing to release.");
}

// --- Determine version ---

const pluginJson = JSON.parse(readFileSync(PLUGIN_JSON, "utf8"));
const marketplaceJson = JSON.parse(readFileSync(MARKETPLACE_JSON, "utf8"));

const marketplaceEntry = marketplaceJson.plugins?.find(
  (p) => p.name === PLUGIN_NAME
);
if (!marketplaceEntry) {
  die(`Could not find plugin "${PLUGIN_NAME}" in ${MARKETPLACE_JSON}`);
}

if (pluginJson.version !== marketplaceEntry.version) {
  die(
    `Version mismatch: ${PLUGIN_JSON} has ${pluginJson.version}, ` +
      `${MARKETPLACE_JSON} has ${marketplaceEntry.version}. Reconcile first.`
  );
}

if (pluginJson.name !== PLUGIN_NAME) {
  die(
    `Plugin name mismatch: ${PLUGIN_JSON} has "${pluginJson.name}", ` +
      `expected "${PLUGIN_NAME}". Reconcile first.`
  );
}

if (typeof marketplaceEntry.source !== "string" || !marketplaceEntry.source) {
  die(
    `Missing or invalid marketplaceEntry.source in ${MARKETPLACE_JSON}.`
  );
}
const expectedSourceDir = join(ROOT, marketplaceEntry.source);
const expectedPluginJson = join(expectedSourceDir, ".claude-plugin", "plugin.json");
if (expectedPluginJson !== PLUGIN_JSON) {
  die(
    `marketplaceEntry.source ("${marketplaceEntry.source}") resolves to ` +
      `${expectedPluginJson}, not the expected ${PLUGIN_JSON}. Reconcile first.`
  );
}
if (!existsSync(expectedSourceDir) || !statSync(expectedSourceDir).isDirectory()) {
  die(
    `marketplaceEntry.source ("${marketplaceEntry.source}") does not resolve ` +
      `to a directory at ${expectedSourceDir}.`
  );
}

const currentVersion = pluginJson.version;

console.log(`\nCurrent version: ${currentVersion}`);
console.log(`\nCommits to release:\n${newOnDevelop}\n`);

const bumpType =
  process.argv[2] ||
  (await ask("Bump type (major / minor / patch) [patch]: ")) ||
  "patch";

if (!["major", "minor", "patch"].includes(bumpType)) {
  die(`Invalid bump type: ${bumpType}`);
}

const newVersion = bumpVersion(currentVersion, bumpType);
const confirm = await ask(`Release v${newVersion}? (y/n) [y]: `);
if (confirm && confirm.toLowerCase() !== "y") {
  console.log("Aborted.");
  process.exit(0);
}

// --- Compute new file contents in memory (no writes yet) ---
//
// All validation that could fail (CHANGELOG regex, link-form match,
// tagExists confirm) happens before any file is written. If any step here
// dies, the working tree is untouched and the operator can re-run after
// fixing the input. Writes are deferred to just before `git add` below.

pluginJson.version = newVersion;
const newPluginJsonContent = JSON.stringify(pluginJson, null, 2) + "\n";

marketplaceEntry.version = newVersion;
const newMarketplaceJsonContent = JSON.stringify(marketplaceJson, null, 2) + "\n";

let changelog = readFileSync(CHANGELOG, "utf8");

// Insert a new released section after [Unreleased]. The original section may
// be followed by either another `## [` heading (subsequent releases) or by
// the link-reference block at the bottom (first release).
const unreleasedRe = /(## \[Unreleased\])([\s\S]*?)(?=\n## \[|\n\[Unreleased\]:)/;
const match = changelog.match(unreleasedRe);
if (!match) {
  die("Could not find ## [Unreleased] section in CHANGELOG.md");
}

const unreleasedContent = match[2];
changelog = changelog.replace(
  unreleasedRe,
  `## [Unreleased]\n\n## [${newVersion}] - ${today()}${unreleasedContent}`
);

// Replace the Unreleased comparison link and add a link for the new version.
// The first-release case has the pre-tag form `${REPO_URL}/commits/main`;
// after that it's `${REPO_URL}/compare/v${currentVersion}...HEAD`.
const newUnreleasedLink = `[Unreleased]: ${REPO_URL}/compare/v${newVersion}...HEAD`;

// If a tag for the current version exists AND it is an ancestor of develop,
// the tag is healthy (it points at a commit on the release branch) — use the
// compare-link form silently, matching the pre-patch happy path. Only prompt
// when the tag exists but is NOT in develop's ancestry, which is the stale-
// tag case (e.g., left over from an aborted prior release pointing at
// unrelated history).
let useCompareForm = false;
if (tagExists(`v${currentVersion}`)) {
  let tagInAncestry = false;
  try {
    run(`git merge-base --is-ancestor v${currentVersion} develop`, {
      stdio: "pipe",
    });
    tagInAncestry = true;
  } catch {
    tagInAncestry = false;
  }

  if (tagInAncestry) {
    useCompareForm = true;
  } else {
    let tagInfo = "(unknown)";
    try {
      tagInfo = run(`git log -1 --format=%h\\ %s v${currentVersion}`, {
        stdio: "pipe",
      });
    } catch {
      // Best-effort; fall through with placeholder.
    }
    const tagConfirm = await ask(
      `Tag v${currentVersion} exists (${tagInfo}) but is NOT an ancestor of ` +
        `develop. Use compare-link form anyway? (y/n) [n]: `
    );
    useCompareForm = tagConfirm.toLowerCase() === "y";
  }
}
const newVersionLink = useCompareForm
  ? `[${newVersion}]: ${REPO_URL}/compare/v${currentVersion}...v${newVersion}`
  : `[${newVersion}]: ${REPO_URL}/releases/tag/v${newVersion}`;

const priorUnreleasedCompareLink = `[Unreleased]: ${REPO_URL}/compare/v${currentVersion}...HEAD`;
const priorUnreleasedCommitsLink = `[Unreleased]: ${REPO_URL}/commits/main`;

const before = changelog;
if (changelog.includes(priorUnreleasedCompareLink)) {
  changelog = changelog.replace(
    priorUnreleasedCompareLink,
    `${newUnreleasedLink}\n${newVersionLink}`
  );
} else if (changelog.includes(priorUnreleasedCommitsLink)) {
  changelog = changelog.replace(
    priorUnreleasedCommitsLink,
    `${newUnreleasedLink}\n${newVersionLink}`
  );
} else {
  die(
    `Could not find Unreleased link in CHANGELOG.md.\nExpected one of:\n  ${priorUnreleasedCompareLink}\n  ${priorUnreleasedCommitsLink}`
  );
}
if (changelog === before) {
  die("CHANGELOG.md link replacement made no changes");
}

const newChangelogContent = changelog;

// --- Write all three files together (point of no return for the tree) ---

writeFileSync(PLUGIN_JSON, newPluginJsonContent);
console.log(`Updated ${PLUGIN_JSON} to ${newVersion}`);
writeFileSync(MARKETPLACE_JSON, newMarketplaceJsonContent);
console.log(`Updated ${MARKETPLACE_JSON} to ${newVersion}`);
writeFileSync(CHANGELOG, newChangelogContent);
console.log(`Updated CHANGELOG.md for ${newVersion}`);

// --- Commit, merge, tag ---

const developHead = run("git rev-parse HEAD");

try {
  execFileSync("git", ["add", PLUGIN_JSON, MARKETPLACE_JSON, CHANGELOG], {
    cwd: ROOT,
    stdio: "inherit",
  });
  run(`git commit -m "Release v${newVersion}"`);
  console.log(`Committed release on develop`);

  run("git checkout main");
  run("git merge develop --ff-only");
  console.log("Merged develop into main");

  run(`git tag v${newVersion}`);
  console.log(`Tagged v${newVersion}`);

  run("git checkout develop");
  run("git merge main --ff-only");
  console.log("Fast-forwarded develop to main");
} catch (err) {
  console.error(`\nRelease failed: ${err.message}`);
  console.error("\nTo recover:");
  console.error(`  git checkout develop`);
  console.error(`  git reset --hard ${developHead}`);
  console.error(`  git tag -d v${newVersion} 2>/dev/null || true`);
  console.error(`  git checkout main && git reset --hard origin/main`);
  process.exit(1);
}

// --- Push ---

const pushConfirm = await ask("\nPush main, develop, and tags to origin? (y/n) [y]: ");
if (pushConfirm && pushConfirm.toLowerCase() !== "y") {
  console.log(`Skipped push. Run manually:\n  git push --atomic origin main develop v${newVersion}`);
  process.exit(0);
}

run(`git push --atomic origin main develop v${newVersion}`);
console.log(`\nReleased v${newVersion}`);
