import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const DEFAULT_CONFIG = {
  url: '',
  dev_server_command: '',
  startup_timeout_ms: 15000,
  framework: 'react',
  pause_threshold: 0.65,
  model: {
    provider: 'claude',
    model_id: 'claude-sonnet-4-6'
  }
};

const GITIGNORE_ENTRIES = [
  'sleuth-session.json',
  '.sleuth/evidence/',
  '.sleuth/app-map.json'
];

export async function cmdInit() {
  const configPath = path.resolve('sleuth.config.json');
  const gitignorePath = path.resolve('.gitignore');

  // Config
  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow('sleuth.config.json already exists — skipping.'));
  } else {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(chalk.green('✓') + ' Created sleuth.config.json');
  }

  // .sleuth output dir
  fs.mkdirSync('.sleuth', { recursive: true });
  fs.mkdirSync('.sleuth/evidence', { recursive: true });
  fs.mkdirSync('.sleuth/journeys', { recursive: true });
  console.log(chalk.green('✓') + ' Created .sleuth/ output directory');

  // .gitignore
  let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const toAdd = GITIGNORE_ENTRIES.filter(e => !gitignore.includes(e));
  if (toAdd.length > 0) {
    gitignore += '\n# Sleuth\n' + toAdd.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, gitignore);
    console.log(chalk.green('✓') + ' Added Sleuth entries to .gitignore');
  }

  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log('  1. Edit ' + chalk.cyan('sleuth.config.json') + ' — set your app URL or dev server command');
  console.log('  2. Run ' + chalk.cyan('sleuth doctor') + ' to verify your setup');
  console.log('  3. Run ' + chalk.cyan('sleuth scan') + ' to map your codebase');
}
