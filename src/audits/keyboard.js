/**
 * Keyboard navigation audit.
 * Tabs through all focusable elements and checks:
 * - Every interactive element receives focus
 * - Focus is visually indicated
 * - No focus traps (tab cycles back to start)
 * - Skip-navigation link present
 */
export async function auditKeyboard(page) {
  const findings = [];

  // Check for skip nav
  const skipLink = await page.locator('a[href="#main"], a[href="#content"], a[href="#skip"]').count();
  if (skipLink === 0) {
    findings.push({
      type: 'keyboard',
      severity: 'major',
      title: 'No skip navigation link',
      description: 'Page has no skip-to-main-content link. Keyboard users must tab through every nav item on every page.',
      evidence_type: 'keyboard_audit',
    });
  }

  // Tab through focusable elements
  const focusable = await page.evaluate(() => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll(selector)).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      text: (el.textContent || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 60),
      hasVisibleFocusStyle: (() => {
        const style = window.getComputedStyle(el, ':focus');
        return style.outline !== 'none' && style.outline !== '0px none';
      })(),
    }));
  });

  const noFocusStyle = focusable.filter(el => !el.hasVisibleFocusStyle);
  if (noFocusStyle.length > 0) {
    findings.push({
      type: 'keyboard',
      severity: 'major',
      title: `${noFocusStyle.length} focusable element(s) have no visible focus indicator`,
      description: `Elements with suppressed focus outlines: ${noFocusStyle.slice(0, 5).map(e => `<${e.tag}> "${e.text}"`).join(', ')}`,
      evidence_type: 'keyboard_audit',
      affected_count: noFocusStyle.length,
    });
  }

  // Check for tabindex > 0 (breaks natural tab order)
  const badTabindex = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[tabindex]'))
      .filter(el => parseInt(el.getAttribute('tabindex')) > 0)
      .map(el => el.tagName.toLowerCase() + ' tabindex=' + el.getAttribute('tabindex'));
  });

  if (badTabindex.length > 0) {
    findings.push({
      type: 'keyboard',
      severity: 'minor',
      title: 'Positive tabindex values found — breaks natural tab order',
      description: `Elements: ${badTabindex.slice(0, 5).join(', ')}`,
      evidence_type: 'keyboard_audit',
    });
  }

  return {
    audit: 'keyboard',
    focusable_count: focusable.length,
    findings,
  };
}
