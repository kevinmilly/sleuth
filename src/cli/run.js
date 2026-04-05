import chalk from 'chalk';

export async function cmdRun(options) {
  if (!options.watch && !options.guided) {
    console.log(chalk.yellow('Tip: use --watch to see the browser, or --guided to assist at ambiguous steps.'));
  }
  console.log(chalk.dim('sleuth run — coming in Phase 4 (browser runner).'));
  console.log(chalk.dim('For now, run: sleuth scan then check .sleuth/app-map.json'));
}
