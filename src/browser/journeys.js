import fs from 'fs';

/**
 * Build a list of journeys from app-map.json.
 * Each journey is a sequence of steps to execute in the browser.
 */
export function buildJourneys(appMap, baseUrl) {
  const journeys = [];

  // Journey 1: Visit every route
  const routeSteps = appMap.routes
    .filter(r => !r.dynamic) // skip dynamic routes like /user/:id in v1
    .map((r, i) => ({
      index: i,
      type: 'navigate',
      label: `Visit ${r.path}`,
      url: baseUrl.replace(/\/$/, '') + r.path,
      component: r.component,
    }));

  if (routeSteps.length > 0) {
    journeys.push({
      id: 'journey-route-scan',
      label: 'Route scan — visit all static routes',
      steps: routeSteps,
    });
  }

  // Journey 2: Form interactions
  const forms = appMap.components.filter(c => c.type === 'form');
  forms.forEach((form, fi) => {
    const route = findRouteForComponent(appMap, form.file);
    if (!route) return;

    journeys.push({
      id: `journey-form-${fi}-${slugify(form.name)}`,
      label: `Form interaction — ${form.name}`,
      steps: [
        {
          index: 0,
          type: 'navigate',
          label: `Navigate to ${route.path}`,
          url: baseUrl.replace(/\/$/, '') + route.path,
          component: route.component,
        },
        {
          index: 1,
          type: 'audit_form',
          label: `Audit form: ${form.name}`,
          component: form.file,
          fields: form.fields || [],
        },
      ],
    });
  });

  // Journey 3: Risk actions
  const risks = appMap.risk_actions.slice(0, 5); // cap at 5 in v1
  if (risks.length > 0) {
    const riskRoute = findRouteForComponent(appMap, risks[0]?.component);
    if (riskRoute) {
      journeys.push({
        id: 'journey-risk-actions',
        label: 'Risk actions — identify destructive or payment flows',
        steps: [
          {
            index: 0,
            type: 'navigate',
            label: `Navigate to ${riskRoute.path}`,
            url: baseUrl.replace(/\/$/, '') + riskRoute.path,
            component: riskRoute.component,
          },
          ...risks.map((r, i) => ({
            index: i + 1,
            type: 'locate_risk',
            label: `Locate risk action: ${r.label}`,
            component: r.component,
            risk_type: r.type,
          })),
        ],
      });
    }
  }

  return journeys;
}

function findRouteForComponent(appMap, componentFile) {
  if (!componentFile) return appMap.routes[0] || null;
  return (
    appMap.routes.find(r => r.component === componentFile) ||
    appMap.routes[0] ||
    null
  );
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function loadAppMap() {
  const raw = fs.readFileSync('.sleuth/app-map.json', 'utf8');
  return JSON.parse(raw);
}

export function saveJourneys(journeys) {
  fs.mkdirSync('.sleuth/journeys', { recursive: true });
  journeys.forEach(j => {
    fs.writeFileSync(
      `.sleuth/journeys/${j.id}.json`,
      JSON.stringify(j, null, 2)
    );
  });
}
