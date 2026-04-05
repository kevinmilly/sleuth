import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig } from '../config.js';

export async function cmdConfig() {
  const configPath = path.resolve('sleuth.config.json');

  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('sleuth.config.json not found — run ' + chalk.cyan('sleuth init') + ' first.'));
    process.exit(1);
  }

  const current = loadConfig();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'App URL (e.g. http://localhost:3000):',
      default: current.url || '',
    },
    {
      type: 'input',
      name: 'dev_server_command',
      message: 'Dev server command (e.g. npm run dev) — leave blank if using a live URL:',
      default: current.dev_server_command || '',
    },
    {
      type: 'input',
      name: 'startup_timeout_ms',
      message: 'Startup timeout in ms:',
      default: String(current.startup_timeout_ms ?? 15000),
      filter: v => Number(v),
      validate: v => Number.isFinite(Number(v)) || 'Must be a number',
    },
    {
      type: 'list',
      name: 'framework',
      message: 'Framework:',
      choices: ['react', 'vue', 'svelte', 'angular', 'other'],
      default: current.framework || 'react',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'LLM provider:',
      choices: ['claude-code', 'claude', 'openai', 'gemini'],
      default: current.model?.provider || 'claude-code',
    },
    {
      type: 'input',
      name: 'model_id',
      message: 'Model ID:',
      default: current.model?.model_id || 'claude-sonnet-4-6',
    },
  ]);

  const updated = {
    ...current,
    url: answers.url,
    dev_server_command: answers.dev_server_command,
    startup_timeout_ms: answers.startup_timeout_ms,
    framework: answers.framework,
    model: {
      provider: answers.provider,
      model_id: answers.model_id,
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
  console.log('\n' + chalk.green('✓') + ' sleuth.config.json updated.');
}
