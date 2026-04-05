import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';

/**
 * Ask the user to choose a path when Sleuth is uncertain.
 */
export async function promptChoice(question, choices) {
  console.log('');
  console.log(chalk.yellow('⏸  Sleuth paused — human input needed'));
  console.log(chalk.dim(question));
  return select({
    message: 'Choose a path:',
    choices: choices.map(c => ({ name: c.label, value: c.value })),
  });
}

/**
 * Always offered at the start of a guided run — log in if needed, or skip.
 */
export async function promptLoginOpportunity(url) {
  console.log('');
  console.log(chalk.cyan('⏸  Login opportunity'));
  console.log(chalk.dim(`The browser is open at: ${url}`));
  console.log(chalk.dim('If the app requires login, do it now in the browser window.'));
  await confirm({ message: 'Press Enter when ready to start the audit (or just continue if no login needed)' });
}

/**
 * Ask the user to log in manually, then confirm when done.
 */
export async function promptManualLogin(url) {
  console.log('');
  console.log(chalk.yellow('⏸  Auth wall detected'));
  console.log(chalk.dim(`The browser is open at: ${url}`));
  console.log(chalk.dim('Please log in manually in the browser window.'));
  await confirm({ message: 'Press Enter when you are logged in and ready to continue' });
}

/**
 * Notify user of a low-confidence step and ask whether to proceed or skip.
 */
export async function promptLowConfidence(stepLabel, confidence) {
  console.log('');
  console.log(chalk.yellow(`⏸  Low confidence (${(confidence * 100).toFixed(0)}%) at step: ${stepLabel}`));
  return select({
    message: 'What should Sleuth do?',
    choices: [
      { name: 'Proceed anyway', value: 'proceed' },
      { name: 'Skip this step', value: 'skip' },
      { name: 'Abort this journey', value: 'abort' },
    ],
  });
}
