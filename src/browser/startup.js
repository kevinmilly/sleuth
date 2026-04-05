import { execSync, spawn } from 'child_process';
import http from 'http';
import https from 'https';

/**
 * Ensure the app is reachable before starting the browser.
 * Returns the resolved URL.
 */
export async function ensureAppReady(config, logger) {
  if (config.url) {
    logger.info(`Waiting for app at ${config.url}...`);
    await waitForUrl(config.url, config.startup_timeout_ms);
    logger.succeed(`App ready at ${config.url}`);
    return config.url;
  }

  if (config.dev_server_command) {
    logger.info(`Starting dev server: ${config.dev_server_command}`);
    const proc = spawnDevServer(config.dev_server_command);
    const url = await detectServerUrl(proc, config.startup_timeout_ms);
    logger.succeed(`Dev server ready at ${url}`);
    return url;
  }

  throw new Error(
    'No url or dev_server_command set in sleuth.config.json.\n' +
    'Run: sleuth doctor'
  );
}

function waitForUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const lib = url.startsWith('https') ? https : http;

    function attempt() {
      lib.get(url, res => {
        if (res.statusCode < 500) return resolve();
        retry();
      }).on('error', retry);
    }

    function retry() {
      if (Date.now() > deadline) {
        return reject(new Error(`App did not respond at ${url} within ${timeoutMs}ms`));
      }
      setTimeout(attempt, 500);
    }

    attempt();
  });
}

function spawnDevServer(command) {
  const [cmd, ...args] = command.split(' ');
  return spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
}

function detectServerUrl(proc, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const URL_PATTERN = /https?:\/\/localhost:\d+/;
    let resolved = false;

    function onData(chunk) {
      const text = chunk.toString();
      const match = text.match(URL_PATTERN);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    }

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    setTimeout(() => {
      if (!resolved) reject(new Error(`Dev server did not emit a URL within ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
