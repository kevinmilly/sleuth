import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { replayJourney } from '../browser/replay.js';

export async function cmdReplay(journeyId) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.log(chalk.red('✗ ' + err.message));
    process.exit(1);
  }

  try {
    await replayJourney(journeyId, config);
  } catch (err) {
    console.log(chalk.red('\n✗ Replay failed: ' + err.message));
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}
