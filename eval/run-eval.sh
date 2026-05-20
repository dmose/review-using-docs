#!/bin/bash
# Run an output-graded eval for the review-using-docs skill against Claude.
#
# Usage:
#   ./run-eval.sh [fixture-name]
#
# Environment:
#   CLAUDE_CMD may override the Claude command. It should read the prompt from stdin.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE_NAME="${1:-basic-doc-selection}"
FIXTURE_DIR="$SCRIPT_DIR/fixtures/$FIXTURE_NAME"
WORK_DIR="${TMPDIR:-/tmp}/review-using-docs-eval-$FIXTURE_NAME-$$"
OUTPUT_FILE="$WORK_DIR/claude-output.txt"
SKILL_SRC="$REPO_ROOT/claude-skill/review-using-docs/SKILL.md"
CLAUDE_CMD="${CLAUDE_CMD:-claude -p --permission-mode bypassPermissions --setting-sources project,local}"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "FAIL: fixture not found: $FIXTURE_DIR"
  exit 1
fi

if [ ! -f "$SKILL_SRC" ]; then
  echo "FAIL: skill source not found: $SKILL_SRC"
  exit 1
fi

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cp -R "$FIXTURE_DIR/." "$WORK_DIR/"

mkdir -p "$WORK_DIR/.claude/skills/review-using-docs"
cp "$SKILL_SRC" "$WORK_DIR/.claude/skills/review-using-docs/SKILL.md"

(
  cd "$WORK_DIR"
  git init -q
  git add mots.yaml docs browser
  git commit -qm "baseline"
  git apply patch.diff

  echo "=== Running review-using-docs eval: $FIXTURE_NAME ==="
  echo "Work dir: $WORK_DIR"
  echo "Command: $CLAUDE_CMD"
  echo ""

  $CLAUDE_CMD < prompt.txt > "$OUTPUT_FILE" 2>&1
)

echo ""
echo "=== Grading output ==="
"$SCRIPT_DIR/grade.py" "$OUTPUT_FILE" "$FIXTURE_DIR/expected.json"

echo ""
echo "Output saved to: $OUTPUT_FILE"
