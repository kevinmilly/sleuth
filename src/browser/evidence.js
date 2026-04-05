import fs from 'fs';
import path from 'path';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Collect a full evidence bundle for a single journey step.
 * Returns an evidence record with file paths to all artifacts.
 */
export async function collectEvidence(page, journeyId, stepIndex, outputDir) {
  const stepDir = path.join(outputDir, journeyId, `step-${stepIndex}`);
  fs.mkdirSync(stepDir, { recursive: true });

  const [screenshot, dom, axeReport, consoleLogs, networkFailures] = await Promise.allSettled([
    captureScreenshot(page, stepDir),
    captureDOM(page, stepDir),
    runAxe(page, stepDir),
    getConsoleLogs(page, stepDir),
    getNetworkFailures(page, stepDir),
  ]);

  return {
    step: stepIndex,
    captured_at: new Date().toISOString(),
    screenshot: settled(screenshot),
    dom: settled(dom),
    axe: settled(axeReport),
    console_logs: settled(consoleLogs),
    network_failures: settled(networkFailures),
  };
}

async function captureScreenshot(page, dir) {
  const file = path.join(dir, 'screenshot.png');
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(process.cwd(), file);
}

async function captureDOM(page, dir) {
  const file = path.join(dir, 'dom.html');
  const content = await page.content();
  fs.writeFileSync(file, content);
  return path.relative(process.cwd(), file);
}

async function runAxe(page, dir) {
  const file = path.join(dir, 'axe.json');
  const results = await new AxeBuilder({ page }).analyze();
  fs.writeFileSync(file, JSON.stringify(results, null, 2));

  const summary = {
    violations: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    top_violations: results.violations.slice(0, 5).map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    })),
    report: path.relative(process.cwd(), file),
  };
  return summary;
}

async function getConsoleLogs(page, dir) {
  // Logs are attached via listener — just write whatever was buffered
  const logs = page.__sleuthConsoleLogs || [];
  const file = path.join(dir, 'console.json');
  fs.writeFileSync(file, JSON.stringify(logs, null, 2));
  return { count: logs.length, file: path.relative(process.cwd(), file) };
}

async function getNetworkFailures(page, dir) {
  const failures = page.__sleuthNetworkFailures || [];
  const file = path.join(dir, 'network-failures.json');
  fs.writeFileSync(file, JSON.stringify(failures, null, 2));
  return { count: failures.length, file: path.relative(process.cwd(), file) };
}

function settled(result) {
  if (result.status === 'fulfilled') return result.value;
  return { error: result.reason?.message || 'collection failed' };
}

/**
 * Attach console and network listeners to a page before navigating.
 */
export function attachListeners(page) {
  page.__sleuthConsoleLogs = [];
  page.__sleuthNetworkFailures = [];

  page.on('console', msg => {
    page.__sleuthConsoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  });

  page.on('requestfailed', req => {
    page.__sleuthNetworkFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText,
    });
  });
}

/**
 * Write the complete evidence index for a journey.
 */
export function writeEvidenceIndex(journeyId, steps, outputDir) {
  const file = path.join(outputDir, journeyId, 'evidence-index.json');
  fs.writeFileSync(file, JSON.stringify({ journey_id: journeyId, steps }, null, 2));
  return path.relative(process.cwd(), file);
}
