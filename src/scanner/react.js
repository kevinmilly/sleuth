import fs from 'fs';
import path from 'path';

const ROUTE_PATTERNS = [
  // React Router v6: <Route path="..." element={...} />
  /<Route[^>]+path=["']([^"']+)["'][^>]*>/g,
  // React Router v6: path="..."
  /path:\s*["']([^"']+)["']/g,
];

const FORM_SIGNALS = ['<form', '<Form', 'onSubmit', 'handleSubmit'];
const CTA_SIGNALS = ['<button', '<Button', 'onClick', 'cta', 'hero'];
const RISK_KEYWORDS = ['delete', 'remove', 'destroy', 'cancel', 'payment', 'pay', 'checkout', 'submit'];
const MODAL_KEYWORDS = ['modal', 'Modal', 'dialog', 'Dialog', 'Drawer', 'drawer'];
const LOADING_KEYWORDS = ['loading', 'isLoading', 'spinner', 'Spinner', 'skeleton', 'Skeleton'];
const ERROR_KEYWORDS = ['error', 'Error', 'errorMessage', 'toast', 'Toast', 'alert', 'Alert'];

export async function scanReactProject(rootDir) {
  const files = collectFiles(rootDir, ['.tsx', '.jsx', '.ts', '.js'], [
    'node_modules', '.sleuth', 'dist', 'build', '.git', 'coverage'
  ]);

  const routes = [];
  const components = [];
  const ux_signals = [];
  const risk_actions = [];
  const seenRoutes = new Set();
  const seenComponents = new Set();

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const content = fs.readFileSync(file, 'utf8');
    const name = path.basename(file, path.extname(file));

    // Extract routes
    for (const pattern of ROUTE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const routePath = match[1];
        if (!seenRoutes.has(routePath)) {
          seenRoutes.add(routePath);
          routes.push({ path: routePath, component: rel, dynamic: routePath.includes(':') });
        }
      }
    }

    // Detect components (files with JSX)
    if ((file.endsWith('.tsx') || file.endsWith('.jsx')) && /return\s*\(/.test(content)) {
      if (!seenComponents.has(rel)) {
        seenComponents.add(rel);
        const type = detectComponentType(content);
        const entry = { name, file: rel, type };

        if (type === 'form') {
          entry.fields = extractFieldNames(content);
          entry.actions = ['submit'];
        }

        components.push(entry);
      }
    }

    // UX signals
    if (CTA_SIGNALS.some(s => content.includes(s))) {
      const labels = extractButtonLabels(content);
      labels.forEach(label => {
        ux_signals.push({ type: 'cta', component: rel, label });
      });
    }
    if (MODAL_KEYWORDS.some(s => content.includes(s))) {
      ux_signals.push({ type: 'modal', component: rel, label: name });
    }
    if (LOADING_KEYWORDS.some(s => content.includes(s))) {
      ux_signals.push({ type: 'loading_state', component: rel, label: name });
    }
    if (ERROR_KEYWORDS.some(s => content.includes(s))) {
      ux_signals.push({ type: 'error_state', component: rel, label: name });
    }

    // Risk actions
    RISK_KEYWORDS.forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) {
        const label = extractRiskLabel(content, keyword);
        risk_actions.push({
          type: mapRiskType(keyword),
          component: rel,
          label: label || keyword
        });
      }
    });
  }

  return {
    version: '1',
    framework: 'react',
    scanned_at: new Date().toISOString(),
    routes,
    components,
    ux_signals,
    risk_actions
  };
}

function collectFiles(dir, exts, ignore) {
  const results = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (exts.includes(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function detectComponentType(content) {
  if (FORM_SIGNALS.some(s => content.includes(s))) return 'form';
  if (MODAL_KEYWORDS.some(s => content.includes(s))) return 'modal';
  if (CTA_SIGNALS.some(s => content.includes(s))) return 'interactive';
  return 'display';
}

function extractFieldNames(content) {
  const fields = [];
  const namePattern = /name=["']([^"']+)["']/g;
  let m;
  while ((m = namePattern.exec(content)) !== null) {
    fields.push(m[1]);
  }
  return [...new Set(fields)];
}

function extractButtonLabels(content) {
  const labels = [];
  const pattern = /<[Bb]utton[^>]*>([^<]{1,40})<\/[Bb]utton>/g;
  let m;
  while ((m = pattern.exec(content)) !== null) {
    const label = m[1].trim();
    if (label && !/^\{/.test(label)) labels.push(label);
  }
  return [...new Set(labels)].slice(0, 5);
}

function extractRiskLabel(content, keyword) {
  const pattern = new RegExp(`["']([^"']{0,30}${keyword}[^"']{0,30})["']`, 'i');
  const m = content.match(pattern);
  return m ? m[1].trim() : null;
}

function mapRiskType(keyword) {
  if (['delete', 'remove', 'destroy'].includes(keyword)) return 'delete';
  if (['payment', 'pay', 'checkout'].includes(keyword)) return 'payment';
  return 'submit';
}
