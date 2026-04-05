const AUTH_INDICATORS = ['login', 'signin', 'sign-in', 'auth', 'password', 'unauthorized', '401'];

/**
 * Execute a single journey step against a Playwright page.
 * Shared between runner (audit) and replay.
 */
export async function executeStep(page, step, context, config, guided, watch) {
  if (step.type === 'navigate') {
    await page.goto(step.url, { waitUntil: 'networkidle', timeout: 15000 });

    const url = page.url();
    const title = (await page.title()).toLowerCase();
    const isAuthWall = AUTH_INDICATORS.some(s => url.includes(s) || title.includes(s));
    if (isAuthWall) return { status: 'auth_wall' };

    return { status: 'ok' };
  }

  if (step.type === 'audit_form') {
    const form = page.locator('form').first();
    const exists = await form.count() > 0;
    if (!exists) return { status: 'ok', note: 'no form found on page' };

    const inputs = await page.locator('form input:not([type=hidden])').all();
    for (const input of inputs) {
      await input.focus();
      await page.keyboard.press('Tab');
    }
    return { status: 'ok' };
  }

  if (step.type === 'locate_risk') {
    const elements = await page.locator('button, [role=button], a').all();
    for (const el of elements) {
      const text = (await el.textContent() || '').toLowerCase();
      if (text.includes(step.risk_type) || text.includes(step.label?.toLowerCase())) {
        await el.hover();
        break;
      }
    }
    return { status: 'ok' };
  }

  return { status: 'ok' };
}
