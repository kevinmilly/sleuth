import { chromium } from 'playwright';
import fs from 'fs';
import chalk from 'chalk';
import { ensureAppReady } from './startup.js';
import { collectEvidence, attachListeners, writeEvidenceIndex } from './evidence.js';
import { runDeterministicAudits, flattenAuditFindings } from '../audits/index.js';
import { restoreSession } from './session.js';
import { executeStep } from './steps.js';

const EVIDENCE_DIR = '.sleuth/evidence';

export async function replayJourney(journeyId, config) {
  const journeyFile = `.sleuth/journeys/${journeyId}.json`;
  if (!fs.existsSync(journeyFile)) {
    console.log(chalk.red(`✗ Journey not found: ${journeyId}`));
    console.log(chalk.dim('  Available journeys:'));
    const files = fs.readdirSync('.sleuth/journeys').filter(f => f.endsWith('.json') && !f.includes('-findings'));
    files.forEach(f => console.log(chalk.dim(`    ${f.replace('.json', '')}`)));
    process.exit(1);
  }

  const journey = JSON.parse(fs.readFileSync(journeyFile, 'utf8'));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const replayId = `${journeyId}--replay-${timestamp}`;

  console.log(chalk.bold(`Replaying: ${journey.label}`));
  console.log(chalk.dim(`Replay ID: ${replayId}\n`));

  const logger = { info: () => {}, succeed: () => {}, fail: () => {} };
  const baseUrl = await ensureAppReady(config, logger);
  console.log(chalk.green('✓') + ` App ready at ${baseUrl}`);

  const browser = await chromium.launch({ headless: false }); // always visible for replay
  const context = await browser.newContext();
  await restoreSession(context);

  const page = await context.newPage();
  attachListeners(page);

  const evidenceSteps = [];
  let completedSteps = 0;
  let stoppedReason = null;

  for (const step of journey.steps) {
    process.stdout.write(chalk.dim(`  [${step.index + 1}/${journey.steps.length}] ${step.label}... `));

    try {
      const result = await executeStep(page, step, context, config, false, true);

      if (result.status === 'auth_wall') {
        console.log(chalk.yellow('auth wall — stopping'));
        stoppedReason = 'auth_wall';
        break;
      }

      const [evidence, auditResult] = await Promise.all([
        collectEvidence(page, replayId, step.index, EVIDENCE_DIR),
        runDeterministicAudits(page, replayId, step.index, EVIDENCE_DIR),
      ]);

      evidence.audit_findings = flattenAuditFindings(auditResult);
      evidenceSteps.push(evidence);
      completedSteps++;

      const axeViolations = evidence.axe?.violations ?? 0;
      const auditIssues = evidence.audit_findings?.length ?? 0;
      console.log(chalk.green('✓') + chalk.dim(` axe:${axeViolations} audits:${auditIssues}`));
    } catch (err) {
      console.log(chalk.red('✗ ' + err.message));
      evidenceSteps.push({ step: step.index, error: err.message });
      completedSteps++;
    }
  }

  const indexFile = writeEvidenceIndex(replayId, evidenceSteps, EVIDENCE_DIR);

  // Diff against original evidence if available
  const originalIndex = `.sleuth/evidence/${journeyId}/evidence-index.json`;
  if (fs.existsSync(originalIndex)) {
    const diff = diffEvidenceSummaries(originalIndex, indexFile, evidenceSteps);
    const diffPath = `.sleuth/journeys/${replayId}-diff.json`;
    fs.writeFileSync(diffPath, JSON.stringify(diff, null, 2));
    console.log('');
    printDiffSummary(diff);
    console.log(`  Diff → ${chalk.cyan(diffPath)}`);
  }

  await browser.close();

  console.log('');
  console.log(chalk.green(chalk.bold('Replay complete.')));
  console.log(`  Evidence → ${chalk.cyan(EVIDENCE_DIR + '/' + replayId)}`);
}

function diffEvidenceSummaries(originalIndexPath, replayIndexPath, replaySteps) {
  const original = JSON.parse(fs.readFileSync(originalIndexPath, 'utf8'));
  const originalSteps = original.steps || [];

  const changes = [];

  replaySteps.forEach((step, i) => {
    const prev = originalSteps[i];
    if (!prev) return;

    const axePrev = prev.axe?.violations ?? 0;
    const axeNow = step.axe?.violations ?? 0;
    if (axeNow !== axePrev) {
      changes.push({
        step: i,
        metric: 'axe_violations',
        before: axePrev,
        after: axeNow,
        delta: axeNow - axePrev,
        improved: axeNow < axePrev,
      });
    }

    const auditPrev = prev.audit_findings?.length ?? 0;
    const auditNow = step.audit_findings?.length ?? 0;
    if (auditNow !== auditPrev) {
      changes.push({
        step: i,
        metric: 'audit_findings',
        before: auditPrev,
        after: auditNow,
        delta: auditNow - auditPrev,
        improved: auditNow < auditPrev,
      });
    }

    const netPrev = prev.network_failures?.count ?? 0;
    const netNow = step.network_failures?.count ?? 0;
    if (netNow !== netPrev) {
      changes.push({
        step: i,
        metric: 'network_failures',
        before: netPrev,
        after: netNow,
        delta: netNow - netPrev,
        improved: netNow < netPrev,
      });
    }
  });

  return { compared_at: new Date().toISOString(), changes };
}

function printDiffSummary(diff) {
  if (diff.changes.length === 0) {
    console.log(chalk.green('✓ No changes detected vs original audit'));
    return;
  }
  console.log(chalk.bold('Changes vs original:'));
  diff.changes.forEach(c => {
    const arrow = c.improved ? chalk.green('↓') : chalk.red('↑');
    const label = c.improved ? chalk.green('improved') : chalk.red('regression');
    console.log(`  Step ${c.step} ${c.metric}: ${c.before} → ${c.after} ${arrow} ${label}`);
  });
}
