import fs from 'node:fs';
import path from 'node:path';

interface Expected {
  required_substrings?: string[];
  forbidden_substrings?: string[];
}

interface Assertion {
  type: string;
  value?: string | string[];
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
