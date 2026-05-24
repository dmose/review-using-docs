interface ProviderEntry {
  id: string;
  label: string;
  config: { mode: 'skill' };
}

interface UnifiedConfig {
  description: string;
  prompts: string[];
  providers: ProviderEntry[];
  tests: string;
  defaultTest?: { options?: { runSerially?: boolean } };
  evaluateOptions?: { maxConcurrency?: number; cache?: boolean };
  outputPath?: string;
}

const config: UnifiedConfig = {
  description: 'review-using-docs eval self-test against a mock claude shim',
  prompts: ['{{prompt}}'],
  providers: [
    { id: 'file://providers/claude-cli.ts', label: 'skill', config: { mode: 'skill' } },
  ],
  tests: 'file://tests/selftest/generate.ts',
  defaultTest: { options: { runSerially: true } },
  evaluateOptions: { maxConcurrency: 1, cache: false },
  outputPath: 'eval/results/results.selftest.json',
};

export default config;
