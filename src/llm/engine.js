import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Provider-agnostic LLM client.
 * Supports claude-code (uses your Claude Code subscription — no API key needed),
 * claude (Anthropic API key), openai, and gemini.
 */

export async function callLLM(config, systemPrompt, userMessage) {
  const { provider, model_id } = config.model;

  switch (provider) {
    case 'claude-code':
      return callClaudeCode(model_id, systemPrompt, userMessage);
    case 'claude':
      return callClaude(model_id, systemPrompt, userMessage);
    case 'openai':
      return callOpenAI(model_id, systemPrompt, userMessage);
    case 'gemini':
      return callGemini(model_id, systemPrompt, userMessage);
    default:
      throw new Error(`Unknown provider: ${provider}. Supported: claude-code, claude, openai, gemini`);
  }
}

/**
 * Use the Claude Code CLI (claude -p) — reuses your existing Claude Code subscription.
 * No API key required. Requires Claude Code to be installed and authenticated.
 */
async function callClaudeCode(modelId, systemPrompt, userMessage) {
  // Verify claude CLI is available
  try {
    execSync('claude --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Claude Code CLI not found. Install it from https://claude.ai/code\n' +
      'Or switch to provider "claude" and set ANTHROPIC_API_KEY.'
    );
  }

  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;

  // Write prompt to a temp file to avoid shell escaping issues with long prompts
  const tmpFile = join(tmpdir(), `sleuth-prompt-${Date.now()}.txt`);

  try {
    writeFileSync(tmpFile, fullPrompt, 'utf8');
    const modelFlag = modelId ? `--model ${modelId}` : '';
    // Pass prompt via stdin to avoid any shell escaping issues with large prompts
    const result = execSync(
      `claude -p --output-format text ${modelFlag}`,
      {
        input: fullPrompt,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
      }
    );
    return result.trim();
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

async function callClaude(modelId, systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(modelId, systemPrompt, userMessage) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(modelId, systemPrompt, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}
