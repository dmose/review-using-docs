#!/usr/bin/env bash
# Unified eval runner for review-using-docs.
#
# Usage:
#   bash eval/run.sh                       # --mode both: skill x all + plugin x SMOKE_FIXTURE
#   bash eval/run.sh --mode skill          # skill-direct on every discovered fixture
#   bash eval/run.sh --mode plugin         # plugin-install on every discovered fixture
#   bash eval/run.sh --fixture NAME        # scope to one fixture
#   bash eval/run.sh --self-test           # exercise helpers against a mock claude
#
# Environment:
#   CLAUDE_CMD       override the claude invocation (default: claude -p ...)
#   GRADE_CMD        override the grader (default: $SCRIPT_DIR/grade.py)
#   KEEP_WORK_DIR=1  preserve per-fixture work dirs after run for inspection

set -uo pipefail  # not -e at script scope; subshells handle fail-fast per fixture

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
PLUGIN_NAME="review-using-docs"
MARKETPLACE_NAME="review-using-docs-local"
PLUGIN_ID="${PLUGIN_NAME}@${MARKETPLACE_NAME}"
SKILL_SRC="$REPO_ROOT/$PLUGIN_NAME/skills/$PLUGIN_NAME/SKILL.md"
SMOKE_FIXTURE="basic-doc-selection"
CLAUDE_CMD_DEFAULT='claude -p --permission-mode bypassPermissions --setting-sources project,local'

# ---------- Helpers ----------

fail() { echo "FAIL: $*" >&2; return 1; }
info() { echo "$*"; }
warn() { echo "WARN: $*" >&2; }

assert_contains() {
  local haystack="$1" needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected to find [$needle] in [$haystack]"
}

assert_file_contains() {
  local path="$1" needle="$2"
  [[ -f "$path" ]] || fail "expected file to exist: $path"
  grep -Fq "$needle" "$path" || fail "expected file $path to contain: $needle"
}

assert_file_not_contains() {
  local path="$1" needle="$2"
  [[ -f "$path" ]] || fail "expected file to exist: $path"
  ! grep -Fq "$needle" "$path" || fail "expected file $path NOT to contain: $needle"
}

require_dir() { [[ -d "$1" ]] || fail "directory not found: $1"; }
require_file() { [[ -f "$1" ]] || fail "file not found: $1"; }

stage_fixture() {
  local fixture_dir="$1" work_dir="$2"
  require_dir "$fixture_dir"
  mkdir -p "$work_dir"
  cp -R "$fixture_dir/." "$work_dir/"
}

init_fixture_repo() {
  local work_dir="$1"
  (
    cd "$work_dir"
    git init -q
    git add mots.yaml docs browser
    git commit -qm "baseline"
    git apply patch.diff
  )
}

grade_output() {
  local output_file="$1" expected_file="$2"
  local grade_cmd="${GRADE_CMD:-$SCRIPT_DIR/grade.py}"
  "$grade_cmd" "$output_file" "$expected_file"
}

cleanup_work_dir() {
  local work_dir="$1"
  if [[ "${KEEP_WORK_DIR:-0}" == "1" ]]; then
    info "Work dir preserved: $work_dir"
    return 0
  fi
  rm -rf "$work_dir"
}

validate_fixture_dir() {
  local fixture_dir="$1"
  local missing=()
  local f
  for f in mots.yaml prompt.txt patch.diff expected.json; do
    [[ -f "$fixture_dir/$f" ]] || missing+=("$f")
  done
  for f in browser docs; do
    [[ -d "$fixture_dir/$f" ]] || missing+=("$f/")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    warn "Skipping fixture $(basename "$fixture_dir"): missing ${missing[*]}"
    return 1
  fi
  return 0
}

# ---------- Mode implementations ----------

run_skill_mode() {
  local fixture_name="$1"
  local fixture_dir="$FIXTURES_DIR/$fixture_name"
  local work_dir="${TMPDIR:-/tmp}/review-using-docs-eval-skill-$fixture_name-$$"
  local output_file="$work_dir/claude-output.txt"
  local claude_cmd="${CLAUDE_CMD:-$CLAUDE_CMD_DEFAULT}"

  info ""
  info "=== [skill] $fixture_name ==="
  info "Work dir: $work_dir"

  local rc=0
  (
    set -e
    rm -rf "$work_dir"
    stage_fixture "$fixture_dir" "$work_dir"
    init_fixture_repo "$work_dir"
    mkdir -p "$work_dir/.claude/skills/$PLUGIN_NAME"
    cp "$SKILL_SRC" "$work_dir/.claude/skills/$PLUGIN_NAME/SKILL.md"
    (cd "$work_dir" && bash -lc "$claude_cmd" < prompt.txt > "$output_file" 2>&1)
    grade_output "$output_file" "$fixture_dir/expected.json"
  ) || rc=$?

  cleanup_work_dir "$work_dir"
  return $rc
}

run_plugin_mode() {
  local fixture_name="$1"
  local fixture_dir="$FIXTURES_DIR/$fixture_name"
  local work_dir="${TMPDIR:-/tmp}/review-using-docs-eval-plugin-$fixture_name-$$"
  local output_file="$work_dir/claude-output.txt"
  local plugin_cache="$work_dir/plugin-cache"
  local claude_cmd="${CLAUDE_CMD:-$CLAUDE_CMD_DEFAULT}"

  info ""
  info "=== [plugin] $fixture_name ==="
  info "Work dir:     $work_dir"
  info "Plugin cache: $plugin_cache"

  local rc=0
  (
    set -e
    rm -rf "$work_dir"
    stage_fixture "$fixture_dir" "$work_dir"
    init_fixture_repo "$work_dir"
    claude plugin validate "$REPO_ROOT" >/dev/null
    claude plugin validate "$REPO_ROOT/$PLUGIN_NAME" >/dev/null
    mkdir -p "$plugin_cache"
    (
      cd "$work_dir"
      CLAUDE_CODE_PLUGIN_CACHE_DIR="$plugin_cache" claude plugin marketplace add "$REPO_ROOT" --scope local
      CLAUDE_CODE_PLUGIN_CACHE_DIR="$plugin_cache" claude plugin install "$PLUGIN_ID" --scope local
    )
    # claude plugin install --scope local auto-populates enabledPlugins; no manual enable step.
    (cd "$work_dir" && CLAUDE_CODE_PLUGIN_CACHE_DIR="$plugin_cache" bash -lc "$claude_cmd" < prompt.txt > "$output_file" 2>&1)
    grade_output "$output_file" "$fixture_dir/expected.json"
  ) || rc=$?

  cleanup_work_dir "$work_dir"
  return $rc
}

# ---------- Fixture discovery ----------

discover_fixtures() {
  local -a result=()
  local dir
  while IFS= read -r -d '' dir; do
    if validate_fixture_dir "$dir"; then
      result+=("$(basename "$dir")")
    fi
  done < <(find "$FIXTURES_DIR" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null | sort -z)
  if [[ ${#result[@]} -eq 0 ]]; then
    fail "No valid fixtures found under $FIXTURES_DIR"
    return 1
  fi
  printf '%s\n' "${result[@]}"
}

# ---------- Aggregator ----------

run_all() {
  local mode="$1"
  local single_fixture="${2:-}"
  local -a fixtures
  local -a results=()
  local failures=0
  local pair_rc

  if [[ -n "$single_fixture" ]]; then
    require_dir "$FIXTURES_DIR/$single_fixture" || return 1
    if ! validate_fixture_dir "$FIXTURES_DIR/$single_fixture"; then
      fail "Fixture '$single_fixture' is invalid (see warning above)"
      return 1
    fi
    fixtures=("$single_fixture")
  else
    if ! mapfile -t fixtures < <(discover_fixtures); then
      return 1
    fi
  fi

  for fixture in "${fixtures[@]}"; do
    if [[ "$mode" == "skill" || "$mode" == "both" ]]; then
      run_skill_mode "$fixture"
      pair_rc=$?
      if [[ $pair_rc -eq 0 ]]; then
        results+=("[skill]  $fixture PASS")
      else
        results+=("[skill]  $fixture FAIL")
        failures=$((failures + 1))
      fi
    fi
    if [[ "$mode" == "plugin" || "$mode" == "both" ]]; then
      # In 'both' with no explicit --fixture, only run plugin on the smoke fixture.
      if [[ "$mode" == "both" && -z "$single_fixture" && "$fixture" != "$SMOKE_FIXTURE" ]]; then
        continue
      fi
      run_plugin_mode "$fixture"
      pair_rc=$?
      if [[ $pair_rc -eq 0 ]]; then
        results+=("[plugin] $fixture PASS")
      else
        results+=("[plugin] $fixture FAIL")
        failures=$((failures + 1))
      fi
    fi
  done

  info ""
  info "=== Summary ==="
  for r in "${results[@]}"; do
    info "$r"
  done
  info ""
  info "Total: ${#results[@]} runs, $failures failure(s)"

  [[ $failures -eq 0 ]]
}

# ---------- Self-test ----------

test_authoritative_manifests_have_expected_fields() {
  local mkt="$REPO_ROOT/.claude-plugin/marketplace.json"
  local plg="$REPO_ROOT/$PLUGIN_NAME/.claude-plugin/plugin.json"
  assert_file_contains "$mkt" "\"name\": \"$MARKETPLACE_NAME\""
  assert_file_contains "$mkt" "\"source\": \"./$PLUGIN_NAME\""
  assert_file_not_contains "$mkt" "run-plugin-eval.sh"
  assert_file_contains "$plg" "\"name\": \"$PLUGIN_NAME\""
  assert_file_not_contains "$plg" "dmosedale/llm-tools"
}

test_run_dispatches_both_modes_with_mock_claude() {
  local temp_dir bin_dir fake_claude fake_grade fixture_dir
  temp_dir="$(mktemp -d)"
  fixture_dir="$temp_dir/fixtures/synthetic"
  mkdir -p "$fixture_dir/browser/foo" "$fixture_dir/docs"
  cat > "$fixture_dir/mots.yaml" <<'EOF'
modules: []
EOF
  cat > "$fixture_dir/prompt.txt" <<'EOF'
review prompt
EOF
  cat > "$fixture_dir/patch.diff" <<'EOF'
diff --git a/browser/foo/Widget.js b/browser/foo/Widget.js
index 1f7a7a4..a6f93ab 100644
--- a/browser/foo/Widget.js
+++ b/browser/foo/Widget.js
@@ -1 +1 @@
-export const value = "old";
+export const value = "new";
EOF
  cat > "$fixture_dir/expected.json" <<'EOF'
{"required_substrings":["graded"],"forbidden_substrings":[]}
EOF
  cat > "$fixture_dir/browser/foo/Widget.js" <<'EOF'
export const value = "old";
EOF
  cat > "$fixture_dir/docs/widget-review-contract.md" <<'EOF'
contract
EOF

  bin_dir="$temp_dir/bin"
  mkdir -p "$bin_dir"
  fake_claude="$bin_dir/claude"
  cat > "$fake_claude" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
log_file="${FAKE_CLAUDE_LOG:?}"
if [[ "${1:-}" == "plugin" ]]; then
  echo "plugin:${2:-}:${3:-}:${4:-}" >> "$log_file"
  exit 0
fi
# Default: read stdin (the prompt) and emit graded output
cat >/dev/null
echo "graded"
EOF
  chmod +x "$fake_claude"

  fake_grade="$bin_dir/fake-grade"
  cat > "$fake_grade" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
grep -Fq "graded" "$1"
grep -Fq "required_substrings" "$2"
echo "graded ok"
EOF
  chmod +x "$fake_grade"

  : > "$temp_dir/claude.log"

  # Override FIXTURES_DIR for the test
  local saved_fixtures_dir="$FIXTURES_DIR"
  FIXTURES_DIR="$temp_dir/fixtures"
  local saved_path="$PATH"
  PATH="$bin_dir:$PATH"
  FAKE_CLAUDE_LOG="$temp_dir/claude.log" \
  GRADE_CMD="$fake_grade" \
  KEEP_WORK_DIR=0 \
  run_all skill synthetic >/dev/null || fail "skill mode dispatch failed under mock"

  FAKE_CLAUDE_LOG="$temp_dir/claude.log" \
  GRADE_CMD="$fake_grade" \
  KEEP_WORK_DIR=0 \
  run_all plugin synthetic >/dev/null || fail "plugin mode dispatch failed under mock"

  # Plugin mode should have invoked claude plugin marketplace add and plugin install
  assert_file_contains "$temp_dir/claude.log" "plugin:marketplace:add:$REPO_ROOT"
  assert_file_contains "$temp_dir/claude.log" "plugin:install:$PLUGIN_ID"
  assert_file_contains "$temp_dir/claude.log" "plugin:validate:$REPO_ROOT"

  FIXTURES_DIR="$saved_fixtures_dir"
  PATH="$saved_path"
  rm -rf "$temp_dir"
}

run_self_test() {
  test_authoritative_manifests_have_expected_fields
  test_run_dispatches_both_modes_with_mock_claude
  info "self-test: PASS"
}

# ---------- CLI ----------

usage() {
  cat <<EOF
Usage: $0 [--mode skill|plugin|both] [--fixture NAME] [--self-test]

Default (--mode both): skill-direct on every fixture + plugin-install on
the smoke fixture ($SMOKE_FIXTURE). To test plugin install against every
fixture, use --mode plugin.

Environment:
  CLAUDE_CMD       override claude invocation
  GRADE_CMD        override grader
  KEEP_WORK_DIR=1  preserve per-fixture work dirs after run
EOF
}

main() {
  local mode="both"
  local fixture=""
  local self_test=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        [[ $# -ge 2 ]] || { fail "--mode requires an argument"; return 1; }
        mode="$2"; shift 2;;
      --fixture)
        [[ $# -ge 2 ]] || { fail "--fixture requires an argument"; return 1; }
        fixture="$2"; shift 2;;
      --self-test) self_test=1; shift;;
      -h|--help) usage; return 0;;
      *) fail "Unknown argument: $1"; usage >&2; return 1;;
    esac
  done

  if [[ $self_test -eq 1 ]]; then
    run_self_test
    return $?
  fi

  case "$mode" in
    skill|plugin|both) ;;
    *) fail "Invalid mode: $mode (expected skill|plugin|both)"; return 1;;
  esac

  run_all "$mode" "$fixture"
}

main "$@"
