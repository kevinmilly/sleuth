import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  url: '',
  dev_server_command: '',
  startup_timeout_ms: 15000,
  framework: 'react',
  pause_threshold: 0.65,
  model: {
    provider: 'claude-code',
    model_id: 'claude-sonnet-4-6'
  }
};

export function loadConfig() {
  const configPath = path.resolve('sleuth.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('sleuth.config.json not found. Run: sleuth init');
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return { ...DEFAULTS, ...raw, model: { ...DEFAULTS.model, ...raw.model } };
}
