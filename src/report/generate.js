import fs from 'fs';
import path from 'path';

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 };
const SEVERITY_EMOJI = { critical: '🔴', major: '🟠', minor: '🟡', info: '🔵' };

/**
 * Generate a markdown report from all findings files.
 */
export function generateReport(findingsFiles, auditSummary) {
  const allFindings = [];

  for (const file of findingsFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.findings) allFindings.push(...data.findings.map(f => ({ ...f, _source: file })));
    } catch {
      // skip malformed files
    }
  }

  allFindings.sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  const counts = { critical: 0, major: 0, minor: 0, info: 0 };
  allFindings.forEach(f => { counts[f.severity] = (counts[f.severity] || 0) + 1; });

  const lines = [];

  lines.push(`# Sleuth UX Audit Report`);
  lines.push(`\n_Generated: ${new Date().toISOString()}_`);
  lines.push(`\n---\n`);

  // Summary
  lines.push(`## Summary\n`);
  if (auditSummary) {
    lines.push(`**App:** ${auditSummary.base_url}`);
    lines.push(`**Audited:** ${auditSummary.audited_at}`);
    lines.push(`**Journeys:** ${auditSummary.journeys?.length ?? 0}\n`);
  }

  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| 🔴 Critical | ${counts.critical} |`);
  lines.push(`| 🟠 Major | ${counts.major} |`);
  lines.push(`| 🟡 Minor | ${counts.minor} |`);
  lines.push(`| 🔵 Info | ${counts.info} |`);
  lines.push(`| **Total** | **${allFindings.length}** |`);

  // Journey summaries
  if (auditSummary?.journeys?.length > 0) {
    lines.push(`\n## Journey Coverage\n`);
    auditSummary.journeys.forEach(j => {
      const pct = Math.round((j.completed_steps / j.total_steps) * 100);
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      lines.push(`**${j.label}**`);
      lines.push(`\`${bar}\` ${pct}% (${j.completed_steps}/${j.total_steps} steps)${j.stopped_at ? ` — stopped at: ${j.stopped_at}` : ''}\n`);
    });
  }

  // Findings
  lines.push(`\n## Findings\n`);

  if (allFindings.length === 0) {
    lines.push('_No findings recorded._');
  }

  let findingNum = 1;
  for (const f of allFindings) {
    const emoji = SEVERITY_EMOJI[f.severity] || '⚪';
    lines.push(`### ${emoji} ${findingNum++}. ${f.title}`);
    lines.push('');
    lines.push(`**Severity:** ${f.severity}  `);
    lines.push(`**Type:** ${f.type}  `);
    lines.push(`**Journey:** ${f.journey_id}, step ${f.step}  `);
    lines.push(`**Confidence:** ${Math.round(f.confidence * 100)}%`);
    if (f._flagged_low_confidence) lines.push(`> ⚠️ Low confidence — review manually`);
    lines.push('');
    lines.push(f.description);
    lines.push('');

    if (f.file) {
      lines.push(`**Location:** \`${f.file}\`${f.line ? `:${f.line}` : ''}`);
      lines.push('');
    }

    if (f.evidence?.length > 0) {
      lines.push(`**Evidence:**`);
      f.evidence.forEach(e => lines.push(`- \`${e}\``));
      lines.push('');
    }

    if (f.unknowns?.length > 0) {
      lines.push(`**Unknowns:**`);
      f.unknowns.forEach(u => lines.push(`- ${u}`));
      lines.push('');
    }

    lines.push(`**Fix:**`);
    lines.push(f.implementation_suggestion);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
