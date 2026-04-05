import Ajv from 'ajv';
import fs from 'fs';

const ajv = new Ajv({ allErrors: true });

const STEP_SCHEMA = {
  type: 'object',
  required: ['index', 'type', 'label'],
  properties: {
    index: { type: 'number' },
    type: { type: 'string', enum: ['navigate', 'audit_form', 'locate_risk'] },
    label: { type: 'string', minLength: 1 },
    url: { type: 'string' },
    component: { type: ['string', 'null'] },
    fields: { type: 'array', items: { type: 'string' } },
    risk_type: { type: 'string', enum: ['delete', 'payment', 'submit'] },
  },
};

const JOURNEY_GENERATION_SCHEMA = {
  type: 'object',
  required: ['journeys'],
  properties: {
    app_purpose: { type: 'string' },
    journeys: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'label', 'description', 'steps'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          goal: { type: 'string' },
          steps: { type: 'array', minItems: 1, items: STEP_SCHEMA },
        },
      },
    },
  },
};

const validateJourneysSchema = ajv.compile(JOURNEY_GENERATION_SCHEMA);

const FINDING_SCHEMA = {
  type: 'object',
  required: ['findings', 'journey_coverage', 'summary'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'journey_id', 'step', 'type', 'severity', 'title', 'description', 'evidence', 'confidence', 'unknowns', 'implementation_suggestion'],
        properties: {
          id: { type: 'string' },
          journey_id: { type: 'string' },
          step: { type: 'number' },
          type: { type: 'string', enum: ['accessibility', 'usability', 'performance', 'content', 'navigation'] },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
          title: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          evidence: { type: 'array', items: { type: 'string' }, minItems: 1 },
          file: { type: ['string', 'null'] },
          line: { type: ['number', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          unknowns: { type: 'array', items: { type: 'string' } },
          implementation_suggestion: { type: 'string' },
        },
      },
    },
    journey_coverage: {
      type: 'object',
      required: ['completed_steps', 'total_steps'],
      properties: {
        completed_steps: { type: 'number' },
        total_steps: { type: 'number' },
        stopped_at: { type: ['string', 'null'] },
      },
    },
    summary: { type: 'string' },
  },
};

const validate = ajv.compile(FINDING_SCHEMA);

/**
 * Validate LLM output against the findings schema.
 * Also enforces business rules (evidence non-empty, confidence present, etc.)
 * Returns { valid: true, data } or { valid: false, errors }
 */
export function validateFindings(raw, appMapFiles = []) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return { valid: false, errors: ['Response is not valid JSON: ' + err.message] };
  }

  const schemaValid = validate(parsed);
  if (!schemaValid) {
    return {
      valid: false,
      errors: validate.errors.map(e => `${e.instancePath} ${e.message}`),
    };
  }

  // Business rule: file references must exist in app map
  const fileErrors = [];
  if (appMapFiles.length > 0) {
    for (const f of parsed.findings) {
      if (f.file && !appMapFiles.includes(f.file)) {
        fileErrors.push(`Finding ${f.id} references file "${f.file}" which is not in the app map`);
      }
    }
  }

  // Business rule: flag low-confidence findings
  for (const f of parsed.findings) {
    if (f.confidence < 0.5) {
      f._flagged_low_confidence = true;
    }
  }

  if (fileErrors.length > 0) {
    return { valid: false, errors: fileErrors };
  }

  return { valid: true, data: parsed };
}

/**
 * Validate LLM-generated journeys.
 * Also enforces that navigate steps have a url, and component references are in the app map.
 */
export function validateJourneys(raw, appMap, baseUrl = '') {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return { valid: false, errors: ['Response is not valid JSON: ' + err.message] };
  }

  const schemaValid = validateJourneysSchema(parsed);
  if (!schemaValid) {
    return {
      valid: false,
      errors: validateJourneysSchema.errors.map(e => `${e.instancePath} ${e.message}`),
    };
  }

  const validFiles = new Set(appMap.components.map(c => c.file));
  const validPaths = new Set(appMap.routes.map(r => r.path));
  const errors = [];

  for (const journey of parsed.journeys) {
    for (const step of journey.steps) {
      if (step.type === 'navigate') {
        if (!step.url) {
          errors.push(`Journey "${journey.id}" step ${step.index}: navigate step missing url`);
        } else {
          // Extract path from url and check it exists in routes
          const urlPath = step.url.replace(baseUrl.replace(/\/$/, ''), '') || '/';
          if (!validPaths.has(urlPath) && urlPath !== '/') {
            // Soft warning — patch the step rather than reject, since LLM may use the full URL
            step._url_unverified = true;
          }
        }
      }
      if ((step.type === 'audit_form' || step.type === 'locate_risk') && step.component) {
        if (!validFiles.has(step.component)) {
          // Soft warning — don't reject, component may be valid but not in map
          step._component_unverified = true;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: parsed };
}
