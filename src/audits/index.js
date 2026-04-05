import fs from 'fs';
import path from 'path';
import { auditKeyboard } from './keyboard.js';
import { auditLayout } from './layout.js';

/**
 * Run all deterministic audits against the current page state.
 * Returns a combined audit result and writes it to disk.
 */
export async function runDeterministicAudits(page, journeyId, stepIndex, evidenceDir) {
  const [keyboard, layout] = await Promise.allSettled([
    auditKeyboard(page),
    auditLayout(page),
  ]);

  const result = {
    journey_id: journeyId,
    step: stepIndex,
    audited_at: new Date().toISOString(),
    keyboard: keyboard.status === 'fulfilled' ? keyboard.value : { error: keyboard.reason?.message },
    layout: layout.status === 'fulfilled' ? layout.value : { error: layout.reason?.message },
  };

  const outDir = path.join(evidenceDir, journeyId, `step-${stepIndex}`);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'audits.json');
  fs.writeFileSync(file, JSON.stringify(result, null, 2));

  result._file = path.relative(process.cwd(), file);
  return result;
}

/**
 * Flatten all findings from an audit result into a single array.
 */
export function flattenAuditFindings(auditResult) {
  const findings = [];
  if (auditResult.keyboard?.findings) findings.push(...auditResult.keyboard.findings);
  if (auditResult.layout?.findings) findings.push(...auditResult.layout.findings);
  return findings;
}
