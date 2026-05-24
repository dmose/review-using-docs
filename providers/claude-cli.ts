import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseShell } from 'shell-quote';

export type Mode = 'skill' | 'plugin';

export interface ClaudeCliProviderConfig {
  mode: Mode;
}

export interface ProviderOptions {
  id?: string;
  label?: string;
  config?: ClaudeCliProviderConfig;
}

export interface CallApiContextParams {
  vars: Record<string, unknown>;
}

export interface ProviderResponse {
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

const PLUGIN_NAME = 'review-using-docs';
const MARKETPLACE_NAME = 'review-using-docs-local';
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const DEFAULT_CLAUDE_CMD = 'claude -p --permission-mode bypassPermissions --setting-sources project,local';

function shellSplit(input: string): string[] {
  // shell-quote.parse returns ParseEntry[] which can include objects for operators,
  // env interpolations, etc. We only support plain word splitting (quoted strings,
  // backslash escapes); any operator (e.g. `;`, `&&`, `>`) is a config error here.
  const entries = parseShell(input);
  const argv: string[] = [];
  for (const e of entries) {
    if (typeof e !== 'string') {
      throw new Error(`shell-style operators/substitutions are not supported here: ${JSON.stringify(e)}`);
    }
    argv.push(e);
  }
  return argv;
}

function sanitizeForTmpName(name: string): string {
  // mkdtempSync templates take the name unmodified — prevent path traversal or
  // NUL injection via a fixture name supplied through vars.
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
}

function run(
  cmd: string,
  args: string[],
  opts: SpawnSyncOptionsWithStringEncoding,
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(cmd, args, opts);
  if (r.error) throw r.error;
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function copyRecursive(src: string, dest: string): void {
  fs.cpSync(src, dest, { recursive: true });
}

function initFixtureRepo(workDir: string): void {
  const env = { ...process.env };
  // Hermetic git identity so commit succeeds even without a global config.
  const gitEnv = {
    ...env,
    GIT_AUTHOR_NAME: 'eval',
    GIT_AUTHOR_EMAIL: 'eval@example.com',
    GIT_COMMITTER_NAME: 'eval',
    GIT_COMMITTER_EMAIL: 'eval@example.com',
  };
  const opts: SpawnSyncOptionsWithStringEncoding = { cwd: workDir, env: gitEnv, encoding: 'utf8' };
  const init = run('git', ['init', '-q'], opts);
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  // Stage the canonical pre-patch worktree shape used by every fixture today.
  run('git', ['add', 'mots.yaml', 'browser'], opts);
  const commit = run('git', ['commit', '-qm', 'baseline'], opts);
  if (commit.status !== 0) throw new Error(`git commit failed: ${commit.stderr}`);
  const patchPath = path.join(workDir, 'patch.diff');
  if (fs.existsSync(patchPath) && fs.statSync(patchPath).size > 0) {
    const apply = run('git', ['apply', 'patch.diff'], opts);
    if (apply.status !== 0) throw new Error(`git apply failed: ${apply.stderr}`);
  }
}

function readClaudeArgs(fixtureDir: string): string[] {
  const argsFile = path.join(fixtureDir, 'claude_args.txt');
  if (!fs.existsSync(argsFile)) return [];
  // Read the file as a single shell-words stream — newlines become whitespace,
  // but quoted args spanning a line are preserved correctly by shell-quote.
  return shellSplit(fs.readFileSync(argsFile, 'utf8'));
}

function repoRoot(): string {
  // The provider lives at <repo>/providers/claude-cli.ts; repo root is one up.
  return path.resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function wireSkillMode(workDir: string): string[] {
  const root = repoRoot();
  const skillSrc = path.join(root, PLUGIN_NAME, 'skills', PLUGIN_NAME, 'SKILL.md');
  const mcpSrc = path.join(root, PLUGIN_NAME, '.mcp.json');
  const skillDest = path.join(workDir, '.claude', 'skills', PLUGIN_NAME);
  fs.mkdirSync(skillDest, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(skillDest, 'SKILL.md'));
  fs.copyFileSync(mcpSrc, path.join(workDir, '.mcp.json'));
  return ['--mcp-config', '.mcp.json', '--strict-mcp-config'];
}

function wirePluginMode(workDir: string, pluginCache: string): string[] {
  const root = repoRoot();
  fs.mkdirSync(pluginCache, { recursive: true });
  const env = { ...process.env, CLAUDE_CODE_PLUGIN_CACHE_DIR: pluginCache };
  const opts: SpawnSyncOptionsWithStringEncoding = { cwd: workDir, env, encoding: 'utf8' };
  for (const target of [root, path.join(root, PLUGIN_NAME)]) {
    const v = run('claude', ['plugin', 'validate', '--strict', target], opts);
    if (v.status !== 0) throw new Error(`claude plugin validate ${target} failed: ${v.stderr}`);
  }
  const add = run('claude', ['plugin', 'marketplace', 'add', root, '--scope', 'local'], opts);
  if (add.status !== 0) throw new Error(`claude plugin marketplace add failed: ${add.stderr}`);
  const install = run('claude', ['plugin', 'install', PLUGIN_ID, '--scope', 'local'], opts);
  if (install.status !== 0) throw new Error(`claude plugin install failed: ${install.stderr}`);
  return [];
}

export default class ClaudeCliProvider {
  constructor(private readonly options: ProviderOptions) {
    if (!options.config?.mode) throw new Error('claude-cli provider requires config.mode');
  }

  id(): string {
    return this.options.label ?? `claude-cli:${this.options.config?.mode}`;
  }

  async callApi(_prompt: string, context: CallApiContextParams): Promise<ProviderResponse> {
    const mode = this.options.config!.mode;
    const vars = context.vars ?? {};
    const fixtureDir = String(vars['fixtureDir'] ?? '');
    const fixtureName = String(vars['fixtureName'] ?? path.basename(fixtureDir));
    const promptText = String(vars['prompt'] ?? '');
    if (!fixtureDir) return { error: 'missing vars.fixtureDir' };

    const safeName = sanitizeForTmpName(fixtureName);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `review-using-docs-eval-${mode}-${safeName}-`));
    const keep = process.env['KEEP_WORK_DIR'] === '1';
    let response: ProviderResponse;

    try {
      copyRecursive(fixtureDir, workDir);
      initFixtureRepo(workDir);

      const pluginCache = path.join(workDir, 'plugin-cache');
      const modeArgs = mode === 'skill' ? wireSkillMode(workDir) : wirePluginMode(workDir, pluginCache);
      const fixtureArgs = readClaudeArgs(fixtureDir);

      const claudeCmd = process.env['CLAUDE_CMD'] ?? DEFAULT_CLAUDE_CMD;
      const baseArgs = shellSplit(claudeCmd);
      const cmd = baseArgs[0];
      if (!cmd) throw new Error('CLAUDE_CMD resolved to empty command');
      const args = [...baseArgs.slice(1), ...modeArgs, ...fixtureArgs];

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (mode === 'plugin') env['CLAUDE_CODE_PLUGIN_CACHE_DIR'] = pluginCache;

      const r = spawnSync(cmd, args, {
        cwd: workDir,
        env,
        input: promptText,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      if (r.error) throw r.error;
      const stdout = r.stdout ?? '';
      const stderr = r.stderr ?? '';
      const exitCode = r.status ?? -1;

      response = {
        output: stdout,
        ...(exitCode !== 0 ? { error: stderr.trim() || `claude exited ${exitCode}` } : {}),
        metadata: { exitCode, mode, fixtureName, ...(keep ? { workDir } : {}) },
      };
    } catch (e) {
      response = {
        error: e instanceof Error ? e.message : String(e),
        metadata: { mode, fixtureName, ...(keep ? { workDir } : {}) },
      };
    } finally {
      if (!keep) fs.rmSync(workDir, { recursive: true, force: true });
    }
    return response;
  }
}
