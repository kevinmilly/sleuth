import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { analyzeJourney } from '../llm/analyze.js';
import { generateReport } from '../report/generate.js';

export async function cmdReport() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.log(chalk.red('✗ ' + err.message));
    process.exit(1);
  }

  // Load audit summary
  if (!fs.existsSync('.sleuth/audit-summary.json')) {
    console.log(chalk.red('✗ No audit data found. Run: sleuth run'));
    process.exit(1);
  }

  const auditSummary = JSON.parse(fs.readFileSync('.sleuth/audit-summary.json', 'utf8'));
  const appMap = JSON.parse(fs.readFileSync('.sleuth/app-map.json', 'utf8'));

  const findingsFiles = [];

  for (const journeyMeta of auditSummary.journeys) {
    const journeyFile = `.sleuth/journeys/${journeyMeta.journey_id}.json`;
    const evidenceIndex = journeyMeta.evidence_index;

    if (!fs.existsSync(journeyFile) || !fs.existsSync(evidenceIndex)) {
      console.log(chalk.yellow(`⚠ Missing data for ${journeyMeta.journey_id} — skipping`));
      continue;
    }

    const journey = JSON.parse(fs.readFileSync(journeyFile, 'utf8'));
    journey._completed_steps = journeyMeta.completed_steps;
    journey._stopped_at = journeyMeta.stopped_at;

    const evidenceData = JSON.parse(fs.readFileSync(evidenceIndex, 'utf8'));
    const evidenceSteps = evidenceData.steps || [];

    const spinner = ora(`Analyzing ${journey.label}...`).start();
    try {
      const findings = await analyzeJourney(journey, evidenceSteps, appMap, config);

      const findingsPath = `.sleuth/journeys/${journey.id}-findings.json`;
      fs.writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
      findingsFiles.push(findingsPath);

      const issueCount = findings.findings?.length ?? 0;
      spinner.succeed(`${journey.label} — ${issueCount} finding(s)`);
    } catch (err) {
      spinner.fail(`${journey.label} — ${err.message}`);
    }
  }

  // Generate markdown report
  const report = generateReport(findingsFiles, auditSummary);
  const reportPath = '.sleuth/report.md';
  fs.writeFileSync(reportPath, report);

  console.log('');
  console.log(chalk.green(chalk.bold('Report complete.')));
  console.log(`  Findings → ${chalk.cyan('.sleuth/journeys/*-findings.json')}`);
  console.log(`  Report   → ${chalk.cyan(reportPath)}`);
}
