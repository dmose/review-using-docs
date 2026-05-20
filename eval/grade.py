#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("expected", type=Path)
    args = parser.parse_args()

    output = args.output.read_text(encoding="utf-8", errors="replace")
    expected = json.loads(args.expected.read_text(encoding="utf-8"))

    failures = 0

    for text in expected.get("required_substrings", []):
        if text in output:
            print(f"PASS: found required substring: {text}")
        else:
            print(f"FAIL: missing required substring: {text}")
            failures += 1

    for text in expected.get("forbidden_substrings", []):
        if text in output:
            print(f"FAIL: found forbidden substring: {text}")
            failures += 1
        else:
            print(f"PASS: forbidden substring absent: {text}")

    if failures:
        print(f"FAILED: {failures} assertion(s) failed")
        return 1

    print("PASSED: all assertions passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
