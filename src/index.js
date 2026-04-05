#!/usr/bin/env node
import { program } from 'commander';
import { cmdInit } from './cli/init.js';
import { cmdDoctor } from './cli/doctor.js';
import { cmdScan } from './cli/scan.js';
import { cmdRun } from './cli/run.js';
import { cmdReplay } from './cli/replay.js';
import { cmdReport } from './cli/report.js';

program
  .name('sleuth')
  .description('Autonomous UX auditor — deterministic evidence, LLM interpretation.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Sleuth in the current project')
  .action(cmdInit);

program
  .command('doctor')
  .description('Validate config and check dependencies')
  .action(cmdDoctor);

program
  .command('scan')
  .description('Scan codebase and build app-map.json')
  .option('--dry-run', 'Show what was detected without launching a browser')
  .action(cmdScan);

program
  .command('run')
  .description('Run the audit')
  .option('--watch', 'Open browser in visible mode')
  .option('--guided', 'Pause and prompt user at ambiguous steps')
  .action(cmdRun);

program
  .command('replay <journey-id>')
  .description('Re-run a saved journey deterministically')
  .action(cmdReplay);

program
  .command('report')
  .description('Generate report from last audit')
  .action(cmdReport);

program.parse();
