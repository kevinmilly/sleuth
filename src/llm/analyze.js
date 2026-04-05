import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { callLLM } from './engine.js';
import { validateFindings } from './validate.js';

const PROMPT_PATH = new URL('./prompts/journey_analysis.md', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

/**
 * Build an evidence bundle summary suitable for the LLM prompt.
 * Omits raw HTML (too large) but includes structured data.
 */
function buildEvidenceBundle(evidenceSteps) {
  return evidenceSteps.map((step, i) => {
    const parts = [`### Step ${step.step ?? i}`];

    if (step.screenshot) parts.push(`- Screenshot: ${step.screenshot}`);

    if (step.axe) {
      if (step.axe.error) {
        parts.push(`- Axe: error — ${step.axe.error}`);
      } else {
        parts.push(`- Axe violations: ${step.axe.violations} (passes: ${step.axe.passes}, incomplete: ${step.axe.incomplete})`);
        if (step.axe.top_violations?.length > 0) {
          step.axe.top_violations.forEach(v => {
            parts.push(`  - [${v.impact}] ${v.id}: ${v.description} (${v.nodes} node(s))`);
          });
        }
      }
    }

    if (step.console_logs?.count > 0) {
      parts.push(`- Console: ${step.console_logs.count} log(s) at ${step.console_logs.file}`);
    }

    if (step.network_failures?.count > 0) {
      parts.push(`- Network failures: ${step.network_failures.count} at ${step.network_failures.file}`);
    }

    if (step.audit_findings?.length > 0) {
      parts.push(`- Keyboard/layout findings:`);
      step.audit_findings.forEach(f => {
        parts.push(`  - [${f.severity}] ${f.title}: ${f.description}`);
      });
    }

    return parts.join('\n');
  }).join('\n\n');
}

/**
 * Build a compact app map summary for the prompt.
 */
function buildAppMapSummary(appMap) {
  const routes = appMap.routes.map(r => `  ${r.path} → ${r.component}`).join('\n');
  const components = appMap.components.map(c => `  ${c.name} (${c.type}) — ${c.file}`).join('\n');
  return `Routes:\n${routes}\n\nComponents:\n${components}`;
}

/**
 * Render a prompt template by replacing {{key}} placeholders.
 */
function renderPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Analyze a journey's evidence with the LLM and return validated findings.
 */
export async function analyzeJourney(journey, evidenceSteps, appMap, config) {
  const template = fs.readFileSync(PROMPT_PATH, 'utf8');

  const appMapFiles = appMap.components.map(c => c.file);

  const evidenceBundle = buildEvidenceBundle(evidenceSteps);
  const appMapSummary = buildAppMapSummary(appMap);

  const prompt = renderPrompt(template, {
    app_name: path.basename(process.cwd()),
    base_url: config.url || config.dev_server_command,
    framework: appMap.framework,
    journey_label: journey.label,
    journey_id: journey.id,
    completed_steps: journey._completed_steps ?? evidenceSteps.length,
    total_steps: journey.steps.length,
    stopped_at: journey._stopped_at ?? 'none',
    app_map_summary: appMapSummary,
    evidence_bundle: evidenceBundle,
  });

  const systemPrompt = 'You are a UX auditor. You output structured JSON only. No markdown, no prose outside the JSON object.';

  console.log(chalk.dim(`  Sending evidence bundle to ${config.model.provider}/${config.model.model_id}...`));

  let raw;
  try {
    raw = await callLLM(config, systemPrompt, prompt);
  } catch (err) {
    throw new Error(`LLM call failed: ${err.message}`);
  }

  // Strip markdown fences if model added them anyway
  raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  const result = validateFindings(raw, appMapFiles);
  if (!result.valid) {
    throw new Error(`LLM response failed validation:\n${result.errors.join('\n')}`);
  }

  // Attach journey metadata
  result.data.journey_id = journey.id;
  result.data.analyzed_at = new Date().toISOString();

  return result.data;
}
