import base from './promptfooconfig.ts';

const config = {
  ...base,
  description: 'review-using-docs evals (plugin × all fixtures)',
  providers: [
    { id: 'file://providers/claude-cli.ts', label: 'plugin', config: { mode: 'plugin' as const } },
  ],
  outputPath: 'eval/results/results.plugin.json',
};

export default config;
