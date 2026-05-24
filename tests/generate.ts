import fs from 'node:fs';
import path from 'node:path';

interface ToolCallExpectation {
  name: string;
  input_contains?: string;
}

interface Expected {
  required_substrings?: string[];
  forbidden_substrings?: string[];
  tool_calls?: ToolCallExpectation[];
}

interface Assertion {
  type: string;
  value?: string | string[];
}

function toolCallAssertion(expectation: ToolCallExpectation): Assertion {
  // Runs against context.providerResponse.metadata.toolCalls populated by
  // providers/claude-cli.ts from stream-json tool_use events. Substring match
  // on JSON.stringify(input) is intentionally loose so callers can target either
  // a primitive value or a key/value pair without committing to the tool's
  // input schema.
  const name = JSON.stringify(expectation.name);
  const needle = expectation.input_contains;
  const inputCheck =
    needle !== undefined
      ? ` && JSON.stringify(c.input).includes(${JSON.stringify(needle)})`
      : '';
  const expr =
    `(context.providerResponse?.metadata?.toolCalls ?? [])` +
    `.some(c => c.name === ${name}${inputCheck})`;
  return { type: 'javascript', value: expr };
}

interface TestCase {
  description: string;
  vars: Record<string, unknown>;
  assert: Assertion[];
  providers?: string[];
}

const SMOKE_FIXTURE = 'basic-doc-selection';
const REQUIRED_FILES = ['mots.yaml', 'prompt.txt', 'patch.diff', 'expected.json'] as const;
const REQUIRED_DIRS = ['browser'] as const;

function isDirectory(p: string): boolean {
  const s = fs.statSync(p, { throwIfNoEntry: false });
  return !!s && s.isDirectory();
}

export default async function generate(): Promise<TestCase[]> {
  const root = path.resolve(process.cwd(), 'eval/fixtures');
  if (!isDirectory(root)) throw new Error(`fixtures dir not found: ${root}`);
  const cases: TestCase[] = [];

  for (const name of fs.readdirSync(root).sort()) {
    const fixtureDir = path.join(root, name);
    if (!isDirectory(fixtureDir)) continue;

    const missingFiles = REQUIRED_FILES.filter(f => !fs.existsSync(path.join(fixtureDir, f)));
    const missingDirs = REQUIRED_DIRS.filter(d => !isDirectory(path.join(fixtureDir, d)));
    const missing = [...missingFiles, ...missingDirs];
    if (missing.length) {
      console.warn(`Skipping fixture ${name}: missing ${missing.join(', ')}`);
      continue;
    }

    const expected = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'expected.json'), 'utf8'),
    ) as Expected;
    const prompt = fs.readFileSync(path.join(fixtureDir, 'prompt.txt'), 'utf8');

    const assert: Assertion[] = [];
    if (expected.required_substrings?.length) {
      assert.push({ type: 'contains-all', value: expected.required_substrings });
    }
    for (const s of expected.forbidden_substrings ?? []) {
      assert.push({ type: 'not-contains', value: s });
    }
    for (const tc of expected.tool_calls ?? []) {
      assert.push(toolCallAssertion(tc));
    }

    const tc: TestCase = {
      description: name,
      vars: { fixtureDir, fixtureName: name, prompt },
      assert,
      providers: name === SMOKE_FIXTURE ? ['skill', 'plugin'] : ['skill'],
    };
    cases.push(tc);
  }

  if (cases.length === 0) throw new Error(`No valid fixtures under ${root}`);
  return cases;
}
