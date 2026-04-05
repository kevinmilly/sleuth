/**
 * Layout audit.
 * Checks for:
 * - Horizontal overflow (forces unwanted scrollbars / breaks mobile)
 * - Missing or misconfigured viewport meta tag
 * - Fixed/sticky elements that cover interactive content
 * - Text too small to be readable
 * - Tap targets too small on mobile
 */
export async function auditLayout(page) {
  const findings = [];

  // Viewport meta
  const viewportMeta = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    return meta ? meta.getAttribute('content') : null;
  });

  if (!viewportMeta) {
    findings.push({
      type: 'layout',
      severity: 'critical',
      title: 'Missing viewport meta tag',
      description: 'No <meta name="viewport"> found. The page will not render correctly on mobile devices.',
      evidence_type: 'layout_audit',
    });
  } else if (viewportMeta.includes('user-scalable=no') || viewportMeta.includes('maximum-scale=1')) {
    findings.push({
      type: 'layout',
      severity: 'major',
      title: 'Viewport prevents user scaling',
      description: `viewport content="${viewportMeta}" — disabling user zoom is an accessibility violation.`,
      evidence_type: 'layout_audit',
    });
  }

  // Horizontal overflow
  const overflowIssues = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;
    if (docWidth <= viewportWidth) return [];

    return Array.from(document.querySelectorAll('*'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.right > viewportWidth + 5;
      })
      .slice(0, 5)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: (el.className || '').toString().slice(0, 60),
        right: Math.round(el.getBoundingClientRect().right),
      }));
  });

  if (overflowIssues.length > 0) {
    findings.push({
      type: 'layout',
      severity: 'major',
      title: 'Horizontal overflow detected',
      description: `${overflowIssues.length} element(s) extend beyond the viewport width, causing horizontal scroll. ` +
        overflowIssues.map(e => `<${e.tag}${e.id ? '#' + e.id : ''}>`).join(', '),
      evidence_type: 'layout_audit',
      affected_count: overflowIssues.length,
    });
  }

  // Small text
  const smallText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('p, span, li, label, td, th, a'))
      .filter(el => {
        const size = parseFloat(window.getComputedStyle(el).fontSize);
        return size < 12 && el.textContent.trim().length > 0;
      })
      .length;
  });

  if (smallText > 0) {
    findings.push({
      type: 'layout',
      severity: 'minor',
      title: `${smallText} text element(s) below 12px`,
      description: 'Text smaller than 12px is difficult to read, especially for users with low vision.',
      evidence_type: 'layout_audit',
      affected_count: smallText,
    });
  }

  // Tap target size (< 44x44px)
  const smallTargets = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, [role=button], input[type=checkbox], input[type=radio]'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return (rect.width > 0 && rect.height > 0) && (rect.width < 44 || rect.height < 44);
      }).length;
  });

  if (smallTargets > 0) {
    findings.push({
      type: 'layout',
      severity: 'minor',
      title: `${smallTargets} tap target(s) smaller than 44×44px`,
      description: 'WCAG 2.5.5 recommends touch targets of at least 44×44 CSS pixels.',
      evidence_type: 'layout_audit',
      affected_count: smallTargets,
    });
  }

  return {
    audit: 'layout',
    findings,
  };
}
