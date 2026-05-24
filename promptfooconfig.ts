interface ProviderEntry {
  id: string;
  label: string;
  config: { mode: 'skill' | 'plugin' };
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
  description: 'review-using-docs evals (default: skill × all + plugin × smoke)',
  prompts: ['{{prompt}}'],
  providers: [
    { id: 'file://providers/claude-cli.ts', label: 'skill', config: { mode: 'skill' } },
    { id: 'file://providers/claude-cli.ts', label: 'plugin', config: { mode: 'plugin' } },
  ],
  tests: 'file://tests/generate.ts',
  defaultTest: { options: { runSerially: true } },
  evaluateOptions: { maxConcurrency: 1, cache: false },
  outputPath: 'eval/results/results.json',
};

export default config;
