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
}

export default async function generate(): Promise<TestCase[]> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const fixturesDir = path.join(here, 'fixtures');
  const cases: TestCase[] = [];

  for (const name of fs.readdirSync(fixturesDir).sort()) {
    const fixtureDir = path.join(fixturesDir, name);
    if (!fs.statSync(fixtureDir).isDirectory()) continue;
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

    cases.push({
      description: `selftest:${name}`,
      vars: { fixtureDir, fixtureName: name, prompt },
      assert,
    });
  }
  if (!cases.length) throw new Error(`No selftest fixtures under ${fixturesDir}`);
  return cases;
}
