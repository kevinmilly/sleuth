import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { scanReactProject } from '../scanner/react.js';
import { generateJourneys } from '../llm/journeys.js';
import { saveJourneys } from '../browser/journeys.js';

export async function cmdScan(options) {
  const config = loadConfig();

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

  // Generate journeys — LLM-driven unless --no-llm is passed
  if (!options.noLlm) {
    const journeySpinner = ora('Generating journeys with LLM...').start();
    try {
      const baseUrl = config.url || '';
      const journeys = await generateJourneys(appMap, config, baseUrl, process.cwd());
      saveJourneys(journeys);
      journeySpinner.succeed(`Generated ${journeys.length} journey(s)`);
      journeys.forEach(j => console.log(`  ${chalk.cyan(j.id)}  ${chalk.dim(j.label)}`));
    } catch (err) {
      journeySpinner.warn('Journey generation failed: ' + err.message);
      console.log(chalk.dim('  Journeys will be built deterministically at run time.'));
    }
  } else {
    console.log(chalk.dim('  Skipped LLM journey generation (--no-llm). Journeys will be built at run time.'));
  }

  console.log('');
  console.log('  Run ' + chalk.cyan('sleuth run --guided') + ' to start the audit.');
}
