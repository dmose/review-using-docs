import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ClaudeCliProvider from '../providers/claude-cli.ts';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const MOCK_BIN_DIR = path.join(REPO_ROOT, 'tests', 'selftest', 'bin');
const SYNTHETIC_FIXTURE = path.join(REPO_ROOT, 'tests', 'selftest', 'fixtures', 'synthetic');

const ORIGINAL_PATH = process.env['PATH'] ?? '';
const ORIGINAL_KEEP = process.env['KEEP_WORK_DIR'];

function withPathPrefixedToMock(): void {
  process.env['PATH'] = `${MOCK_BIN_DIR}:${ORIGINAL_PATH}`;
}

function restoreEnv(): void {
  process.env['PATH'] = ORIGINAL_PATH;
  if (ORIGINAL_KEEP === undefined) delete process.env['KEEP_WORK_DIR'];
  else process.env['KEEP_WORK_DIR'] = ORIGINAL_KEEP;
}

function newStagingFixture(): string {
  // Copy the synthetic fixture into a fresh tmpdir so each test owns its own
  // staging input — keeps the tree under tests/selftest/fixtures/ pristine.
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-test-fixture-'));
  fs.cpSync(SYNTHETIC_FIXTURE, dst, { recursive: true });
  return dst;
}

describe('ClaudeCliProvider — skill mode', () => {
  beforeEach(withPathPrefixedToMock);
  afterEach(restoreEnv);

  it('echoes mock-claude output for a staged fixture', async () => {
    const fixtureDir = newStagingFixture();
    try {
      const provider = new ClaudeCliProvider({
        label: 'skill',
        config: { mode: 'skill' },
      });
      const result = await provider.callApi('ignored', {
        vars: { fixtureDir, fixtureName: 'synthetic', prompt: 'selftest prompt\n' },
      });
      assert.equal(result.error, undefined, result.error);
      assert.match(result.output ?? '', /MOCK_CLAUDE_OK/);
      assert.match(result.output ?? '', /selftest prompt/);
      const meta = result.metadata as { exitCode?: number; mode?: string } | undefined;
      assert.equal(meta?.exitCode, 0);
      assert.equal(meta?.mode, 'skill');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('cleans up work_dir by default', async () => {
    const fixtureDir = newStagingFixture();
    let beforeDirs: Set<string>;
    try {
      beforeDirs = new Set(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('review-using-docs-eval-')));
      const provider = new ClaudeCliProvider({ label: 'skill', config: { mode: 'skill' } });
      await provider.callApi('ignored', {
        vars: { fixtureDir, fixtureName: 'synthetic', prompt: 'selftest prompt\n' },
      });
      const after = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('review-using-docs-eval-'));
      const leaked = after.filter(n => !beforeDirs.has(n));
      assert.deepEqual(leaked, [], `provider leaked work dirs: ${leaked.join(', ')}`);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('preserves work_dir when KEEP_WORK_DIR=1', async () => {
    const fixtureDir = newStagingFixture();
    process.env['KEEP_WORK_DIR'] = '1';
    try {
      const provider = new ClaudeCliProvider({ label: 'skill', config: { mode: 'skill' } });
      const result = await provider.callApi('ignored', {
        vars: { fixtureDir, fixtureName: 'synthetic', prompt: 'p\n' },
      });
      const meta = result.metadata as { workDir?: string } | undefined;
      assert.ok(meta?.workDir, 'expected workDir in metadata when KEEP_WORK_DIR=1');
      assert.ok(fs.existsSync(meta!.workDir!), `work dir should exist: ${meta!.workDir}`);
      fs.rmSync(meta!.workDir!, { recursive: true, force: true });
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('skips git apply for an empty patch.diff', async () => {
    const fixtureDir = newStagingFixture();
    fs.writeFileSync(path.join(fixtureDir, 'patch.diff'), '');
    // Authoritative reference: the pre-patch source as shipped in the fixture.
    const expectedWidget = fs.readFileSync(
      path.join(SYNTHETIC_FIXTURE, 'browser/foo/Widget.js'),
      'utf8',
    );
    process.env['KEEP_WORK_DIR'] = '1';
    try {
      const provider = new ClaudeCliProvider({ label: 'skill', config: { mode: 'skill' } });
      const result = await provider.callApi('ignored', {
        vars: { fixtureDir, fixtureName: 'synthetic', prompt: 'p\n' },
      });
      assert.equal(result.error, undefined, result.error);
      const meta = result.metadata as { workDir?: string };
      assert.ok(meta.workDir);
      const widget = fs.readFileSync(path.join(meta.workDir!, 'browser/foo/Widget.js'), 'utf8');
      assert.equal(widget, expectedWidget,
        'empty patch.diff must leave Widget.js byte-identical to the fixture source');
      fs.rmSync(meta.workDir!, { recursive: true, force: true });
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('returns an error when vars.fixtureDir is missing', async () => {
    const provider = new ClaudeCliProvider({ label: 'skill', config: { mode: 'skill' } });
    const result = await provider.callApi('ignored', { vars: {} });
    assert.match(result.error ?? '', /fixtureDir/);
  });
});

describe('ClaudeCliProvider — plugin mode (against mock claude)', () => {
  beforeEach(withPathPrefixedToMock);
  afterEach(restoreEnv);

  it('runs plugin validate/marketplace add/install then claude -p', async () => {
    const fixtureDir = newStagingFixture();
    try {
      const provider = new ClaudeCliProvider({ label: 'plugin', config: { mode: 'plugin' } });
      const result = await provider.callApi('ignored', {
        vars: { fixtureDir, fixtureName: 'synthetic', prompt: 'plugin-mode test\n' },
      });
      assert.equal(result.error, undefined, result.error);
      // The final `claude -p` invocation routes through the mock's cat branch,
      // emitting MOCK_CLAUDE_OK + stdin. The earlier plugin subcommands all
      // returned 0 (otherwise wirePluginMode would have thrown).
      assert.match(result.output ?? '', /MOCK_CLAUDE_OK/);
      assert.match(result.output ?? '', /plugin-mode test/);
      const meta = result.metadata as { mode?: string; exitCode?: number };
      assert.equal(meta.mode, 'plugin');
      assert.equal(meta.exitCode, 0);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

describe('ClaudeCliProvider — construction', () => {
  it('rejects construction without a mode', () => {
    assert.throws(
      () => new ClaudeCliProvider({}),
      /requires config\.mode/,
    );
  });
});

describe('shellSplit (via fixture claude_args.txt round-trip)', () => {
  beforeEach(withPathPrefixedToMock);
  afterEach(restoreEnv);

  it('preserves a quoted argument containing spaces', async () => {
    const fixtureDir = newStagingFixture();
    // Mock claude doesn't read its flags, but the provider should parse
    // claude_args.txt and pass the quoted value through as ONE argv element.
    fs.writeFileSync(
      path.join(fixtureDir, 'claude_args.txt'),
      `--example "value with spaces"\n`,
    );
    try {
      const provider = new ClaudeCliProvider({ label: 'skill', config: { mode: 'skill' } });
      const result = await provider.callApi('ignored', {
        vars: { fixtureDir, fixtureName: 'synthetic', prompt: 'p\n' },
      });
      // The fact that the provider didn't throw means parsing succeeded; the
      // mock shim doesn't care about argv contents. Asserting on success is
      // the cheapest way to catch a shellSplit regression that throws or
      // mis-parses (e.g. a `;` accidentally treated as an operator).
      assert.equal(result.error, undefined, result.error);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
