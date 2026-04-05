import fs from 'fs';

const SESSION_FILE = 'sleuth-session.json';

export function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export async function saveSession(context) {
  const cookies = await context.cookies();
  const storageState = await context.storageState();
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ cookies, storageState }, null, 2));
}

export async function restoreSession(context) {
  const session = loadSession();
  if (!session) return false;
  if (session.cookies?.length) {
    await context.addCookies(session.cookies);
  }
  return true;
}
