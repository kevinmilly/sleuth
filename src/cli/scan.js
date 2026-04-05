import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { scanReactProject } from '../scanner/react.js';

export async function cmdScan(options) {
  loadConfig(); // validates config exists

  const spinner = ora('Scanning codebase...').start();

  let appMap;
  try {
    appMap = await scanReactProject(process.cwd());
    spinner.succeed('Scan complete');
  } catch (err) {
    spinner.fail('Scan failed: ' + err.message);
    process.exit(1);
  }

  const routeCount = appMap.routes.length;
  const componentCount = appMap.components.length;
  const signalCount = appMap.ux_signals.length;
  const riskCount = appMap.risk_actions.length;

  console.log('');
  console.log(chalk.bold('Detected:'));
  console.log(`  ${chalk.cyan(routeCount)} route(s)`);
  console.log(`  ${chalk.cyan(componentCount)} component(s)`);
  console.log(`  ${chalk.cyan(signalCount)} UX signal(s)`);
  console.log(`  ${chalk.cyan(riskCount)} risk action(s)`);

  if (options.dryRun) {
    console.log('');
    console.log(chalk.bold('Routes:'));
    appMap.routes.forEach(r => console.log(`  ${chalk.gray(r.path)}  ${chalk.dim(r.component)}`));
    console.log('');
    console.log(chalk.bold('Components:'));
    appMap.components.forEach(c => console.log(`  ${chalk.yellow(c.name)}  ${chalk.dim(c.file)}`));
    console.log('');
    console.log(chalk.dim('Dry run — app-map.json not written.'));
    return;
  }

  fs.mkdirSync('.sleuth', { recursive: true });
  fs.writeFileSync('.sleuth/app-map.json', JSON.stringify(appMap, null, 2));
  console.log('');
  console.log(chalk.green('✓') + ' Wrote .sleuth/app-map.json');
  console.log('  Run ' + chalk.cyan('sleuth run --guided') + ' to start the audit.');
}
