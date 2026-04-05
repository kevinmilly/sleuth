import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { callLLM } from './engine.js';
import { validateJourneys } from './validate.js';
import { buildJourneys } from '../browser/journeys.js';

const PROMPT_PATH = new URL('./prompts/journey_generation.md', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// Max chars per source file sent to the LLM (~2 KB each keeps total prompt manageable)
const FILE_CHAR_LIMIT = 2000;
// Max total chars of source content across all files
const TOTAL_SOURCE_LIMIT = 40000;

/**
 * Collect relevant source file contents from the app map.
 * Prioritises route components, then form components, then risk action files.
 */
function collectSourceExcerpts(appMap, rootDir) {
  const seen = new Set();
  const candidates = [];

  // Priority order: route components → form components → risk action components
  for (const r of appMap.routes) candidates.push(r.component);
  for (const c of appMap.components) if (c.type === 'form') candidates.push(c.file);
  for (const r of appMap.risk_actions) candidates.push(r.component);
  for (const c of appMap.components) candidates.push(c.file);

  const excerpts = [];
  let totalChars = 0;

  for (const rel of candidates) {
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);

    const abs = path.resolve(rootDir, rel);
    if (!fs.existsSync(abs)) continue;

    const content = fs.readFileSync(abs, 'utf8').slice(0, FILE_CHAR_LIMIT);
    totalChars += content.length;
    excerpts.push(`### ${rel}\n\`\`\`\n${content}\n\`\`\``);

    if (totalChars >= TOTAL_SOURCE_LIMIT) break;
  }

  return excerpts.join('\n\n');
}

function renderPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function buildSummary(items, fn) {
  if (!items?.length) return '(none)';
  return items.map(fn).join('\n');
}

/**
 * Use the LLM to generate semantically rich journeys from the app map + source files.
 * Falls back to deterministic buildJourneys() on any failure.
 */
export async function generateJourneys(appMap, config, baseUrl, rootDir = process.cwd()) {
  const template = fs.readFileSync(PROMPT_PATH, 'utf8');

  const sourceExcerpts = collectSourceExcerpts(appMap, rootDir);

  const prompt = renderPrompt(template, {
    app_name: path.basename(rootDir),
    base_url: baseUrl || config.url || '',
    framework: appMap.framework,
    routes_summary: buildSummary(appMap.routes, r => `  ${r.path} → ${r.component}${r.dynamic ? ' (dynamic)' : ''}`),
    components_summary: buildSummary(appMap.components, c => `  ${c.name} (${c.type}) — ${c.file}${c.fields?.length ? ` [fields: ${c.fields.join(', ')}]` : ''}`),
    ux_signals_summary: buildSummary(appMap.ux_signals, s => `  [${s.type}] ${s.label} — ${s.component}`),
    risk_actions_summary: buildSummary(appMap.risk_actions, r => `  [${r.type}] ${r.label} — ${r.component}`),
    source_excerpts: sourceExcerpts,
  });

  const systemPrompt = 'You are a UX auditor planning browser-based tests. You output structured JSON only. No markdown, no prose outside the JSON object.';

  let raw;
  try {
    raw = await callLLM(config, systemPrompt, prompt);
  } catch (err) {
    console.warn(chalk.yellow('  LLM journey generation failed, using deterministic journeys: ') + err.message);
    return buildJourneys(appMap, baseUrl);
  }

  raw = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

  const result = validateJourneys(raw, appMap, baseUrl);
  if (!result.valid) {
    console.warn(chalk.yellow('  LLM journey output invalid, using deterministic journeys:'));
    result.errors.forEach(e => console.warn(chalk.dim('    ' + e)));
    return buildJourneys(appMap, baseUrl);
  }

  return result.data.journeys;
}
