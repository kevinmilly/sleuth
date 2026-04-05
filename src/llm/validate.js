import Ajv from 'ajv';
import fs from 'fs';

const ajv = new Ajv({ allErrors: true });

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
