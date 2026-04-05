import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { runAudit } from '../browser/runner.js';

export async function cmdRun(options) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.log(chalk.red('✗ ' + err.message));
    process.exit(1);
  }

  try {
    await runAudit(config, {
      watch: !!options.watch,
      guided: !!options.guided,
    });
  } catch (err) {
    console.log(chalk.red('\n✗ Audit failed: ' + err.message));
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}
