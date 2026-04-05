import { chromium, firefox, webkit } from 'playwright';

const BROWSERS = { chromium, firefox, webkit };
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ensureAppReady } from './startup.js';
import { collectEvidence, attachListeners, writeEvidenceIndex } from './evidence.js';
import { buildJourneys, loadAppMap, saveJourneys } from './journeys.js';
import { promptManualLogin, promptLowConfidence, promptChoice } from './guided.js';
import { restoreSession, saveSession } from './session.js';
import { runDeterministicAudits, flattenAuditFindings } from '../audits/index.js';
import { executeStep } from './steps.js';

const EVIDENCE_DIR = '.sleuth/evidence';

export async function runAudit(config, options) {
  const { watch = false, guided = false } = options;

  // Phase 2: Ensure app is ready
  const logger = makeLogger();
  const baseUrl = await ensureAppReady(config, logger);

  // Load app map
  if (!fs.existsSync('.sleuth/app-map.json')) {
    console.log(chalk.red('✗ .sleuth/app-map.json not found. Run: sleuth scan'));
    process.exit(1);
  }
  const appMap = loadAppMap();

  // Build journeys
  const journeys = buildJourneys(appMap, baseUrl);
  saveJourneys(journeys);
  console.log(chalk.green(`✓`) + ` Built ${journeys.length} journey(s)`);
  journeys.forEach(j => console.log(`  ${chalk.dim('·')} ${j.label}`));
  console.log('');

  // Launch browser
  const browserType = BROWSERS[config.browser] ?? chromium;
  const browser = await browserType.launch({ headless: !watch });
  const context = await browser.newContext();

  // Restore session if available
  const sessionRestored = await restoreSession(context);
  if (sessionRestored) {
    console.log(chalk.green('✓') + ' Restored saved session');
  }

  const auditResults = [];

  for (const journey of journeys) {
    console.log(chalk.bold(`\nJourney: ${journey.label}`));
    if (journey.description) {
      console.log(chalk.dim(`  Goal: ${journey.description}`));
    }
    const page = await context.newPage();
    attachListeners(page);

    const evidenceSteps = [];
    let stopped = false;
    let stoppedReason = null;
    let completedSteps = 0;

    for (const step of journey.steps) {
      if (stopped) break;

      process.stdout.write(chalk.dim(`  [${step.index + 1}/${journey.steps.length}] ${stepDescription(step)}... `));

      try {
        const result = await executeStep(page, step, context, config, guided, watch);

        if (result.status === 'auth_wall') {
          if (guided) {
            await promptManualLogin(page.url());
            await saveSession(context);
            // retry step after login
            await executeStep(page, step, context, config, guided, watch);
          } else {
            console.log(chalk.yellow('auth wall — stopping journey'));
            stopped = true;
            stoppedReason = 'auth_wall';
            break;
          }
        }

        if (result.status === 'low_confidence' && guided) {
          const action = await promptLowConfidence(step.label, result.confidence);
          if (action === 'skip') {
            console.log(chalk.dim('skipped'));
            continue;
          } else if (action === 'abort') {
            stopped = true;
            stoppedReason = 'user_aborted';
            break;
          }
        }

        // Collect evidence + run deterministic audits in parallel
        const [evidence, auditResult] = await Promise.all([
          collectEvidence(page, journey.id, step.index, EVIDENCE_DIR),
          runDeterministicAudits(page, journey.id, step.index, EVIDENCE_DIR),
        ]);

        evidence.audit_findings = flattenAuditFindings(auditResult);
        evidence.audit_file = auditResult._file;
        evidenceSteps.push(evidence);
        completedSteps++;

        const axeViolations = evidence.axe?.violations ?? 0;
        const consoleErrors = evidence.console_logs?.count ?? 0;
        const networkFails = evidence.network_failures?.count ?? 0;
        const auditIssues = evidence.audit_findings?.length ?? 0;

        console.log(
          chalk.green('✓') +
          chalk.dim(` axe:${axeViolations} keyboard/layout:${auditIssues} console:${consoleErrors} net-fail:${networkFails}`)
        );
      } catch (err) {
        const hint = step.type === 'navigate'
          ? chalk.dim(` (skipping — could not load ${step.url})`)
          : '';
        console.log(chalk.red('✗') + ' ' + err.message.split('\n')[0] + hint);
        evidenceSteps.push({ step: step.index, error: err.message });
        completedSteps++;
      }
    }

    const indexFile = writeEvidenceIndex(journey.id, evidenceSteps, EVIDENCE_DIR);

    auditResults.push({
      journey_id: journey.id,
      label: journey.label,
      completed_steps: completedSteps,
      total_steps: journey.steps.length,
      stopped_at: stoppedReason,
      evidence_index: indexFile,
    });

    await page.close();
  }

  await browser.close();

  // Write audit summary
  const summaryPath = '.sleuth/audit-summary.json';
  fs.writeFileSync(summaryPath, JSON.stringify({
    audited_at: new Date().toISOString(),
    base_url: baseUrl,
    journeys: auditResults,
  }, null, 2));

  console.log('');
  console.log(chalk.green(chalk.bold('Audit complete.')));
  console.log(`  Evidence → ${chalk.cyan(EVIDENCE_DIR)}`);
  console.log(`  Summary  → ${chalk.cyan(summaryPath)}`);
  console.log(`  Next     → ${chalk.cyan('sleuth report')} to analyze findings`);

  return auditResults;
}

function stepDescription(step) {
  switch (step.type) {
    case 'navigate':    return `Navigating to ${step.url}`;
    case 'audit_form':  return `Auditing form fields in ${step.component}`;
    case 'locate_risk': return `Looking for "${step.label}" (${step.risk_type})`;
    default:            return step.label;
  }
}

function makeLogger() {
  let spinner = null;
  return {
    info: (msg) => { process.stdout.write(chalk.dim(msg + '... ')); },
    succeed: (msg) => { console.log(chalk.green('✓') + ' ' + msg); },
    fail: (msg) => { console.log(chalk.red('✗') + ' ' + msg); },
  };
}
