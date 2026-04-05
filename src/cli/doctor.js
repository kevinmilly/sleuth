import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../config.js';

export async function cmdDoctor() {
  console.log(chalk.bold('Sleuth Doctor\n'));

  let pass = true;

  // Config exists
  const configPath = path.resolve('sleuth.config.json');
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('✗') + ' sleuth.config.json not found — run ' + chalk.cyan('sleuth init'));
    pass = false;
  } else {
    console.log(chalk.green('✓') + ' sleuth.config.json found');
  }

  if (!pass) return;

  const config = loadConfig();

  // URL or dev server
  if (!config.url && !config.dev_server_command) {
    console.log(chalk.red('✗') + ' No url or dev_server_command set in config');
    pass = false;
  } else {
    console.log(chalk.green('✓') + ' App target configured: ' + chalk.cyan(config.url || config.dev_server_command));
  }

  // Model config
  if (!config.model?.provider || !config.model?.model_id) {
    console.log(chalk.red('✗') + ' model.provider and model.model_id must be set in config');
    pass = false;
  } else {
    console.log(chalk.green('✓') + ' Model: ' + chalk.cyan(`${config.model.provider} / ${config.model.model_id}`));
  }

  // API key / CLI check
  const provider = config.model?.provider;
  if (provider === 'claude-code') {
    try {
      const { execSync } = await import('child_process');
      execSync('claude --version', { stdio: 'ignore' });
      console.log(chalk.green('✓') + ' Claude Code CLI found — no API key needed');
    } catch {
      console.log(chalk.red('✗') + ' Claude Code CLI not found. Install from https://claude.ai/code');
      pass = false;
    }
  } else {
    const envKey = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }[provider];
    if (envKey) {
      if (!process.env[envKey]) {
        console.log(chalk.red('✗') + ` ${envKey} not set in environment`);
        pass = false;
      } else {
        console.log(chalk.green('✓') + ` ${envKey} found`);
      }
    }
  }

  // .sleuth dir
  if (!fs.existsSync('.sleuth')) {
    console.log(chalk.yellow('⚠') + ' .sleuth/ directory missing — run ' + chalk.cyan('sleuth init'));
  } else {
    console.log(chalk.green('✓') + ' .sleuth/ output directory exists');
  }

  // Playwright
  try {
    await import('playwright');
    console.log(chalk.green('✓') + ' playwright installed');
  } catch {
    console.log(chalk.red('✗') + ' playwright not found — run npm install playwright');
    pass = false;
  }

  console.log('');
  if (pass) {
    console.log(chalk.green(chalk.bold('All checks passed.')));
  } else {
    console.log(chalk.red(chalk.bold('Some checks failed. Fix the issues above before running.')));
    process.exit(1);
  }
}
