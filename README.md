# Sleuth

Autonomous UX auditor. Deterministic evidence. LLM interpretation.

> The LLM interprets. Deterministic systems observe.

Sleuth scans your React codebase, infers user journeys, runs your app in a browser, collects real evidence (screenshots, DOM snapshots, accessibility reports, console errors), and uses an LLM to produce structured UX findings with implementation guidance.

It never reports an issue it can't prove.

---

## Install

```bash
# Install globally from the local repo
npm install -g /path/to/sleuth

# To update after pulling changes, run the same command again
```

---

## Quick Start

```bash
# 1. Go to your target project
cd /path/to/your-react-app

# 2. Initialize Sleuth
sleuth init

# 3. Edit sleuth.config.json — set your URL or dev server command
# e.g. "url": "http://localhost:3000"
# or   "dev_server_command": "npm run dev"

# 4. No API key needed if you use Claude Code (default)
#    Just make sure Claude Code is installed and you're logged in.
#    To use the Anthropic API directly instead:
#      - Set "provider": "claude" in sleuth.config.json
#      - export ANTHROPIC_API_KEY=sk-...

# 5. Verify everything is ready
sleuth doctor

# 6. Scan your codebase
sleuth scan

# Preview what was detected without writing files:
sleuth scan --dry-run

# 7. Run the audit (visible browser)
sleuth run --watch

# 8. Run with guidance prompts (recommended for complex apps)
sleuth run --guided

# 9. Generate the report
sleuth report
```

---

## Commands

| Command | Description |
|---|---|
| `sleuth init` | Initialize config, create `.sleuth/`, update `.gitignore` |
| `sleuth doctor` | Validate config, check dependencies, verify API key |
| `sleuth scan` | Scan codebase → `.sleuth/app-map.json` |
| `sleuth scan --dry-run` | Preview detected routes/components without writing |
| `sleuth run --watch` | Run audit with visible browser |
| `sleuth run --guided` | Run with human-in-the-loop prompts at ambiguous steps |
| `sleuth replay <id>` | Re-run a saved journey, diff results against original |
| `sleuth report` | Generate UX findings report from last audit |

---

## Configuration (`sleuth.config.json`)

```json
{
  "url": "http://localhost:3000",
  "dev_server_command": "",
  "startup_timeout_ms": 15000,
  "browser": "chromium",
  "pause_threshold": 0.65,
  "model": {
    "provider": "claude-code",
    "model_id": "claude-sonnet-4-6"
  }
}
```

| Key | Description | Default |
|---|---|---|
| `url` | URL of the running app | `""` |
| `dev_server_command` | Command to start dev server (e.g. `npm run dev`) | `""` |
| `startup_timeout_ms` | How long to wait for the app to be ready | `15000` |
| `browser` | Playwright browser to use: `chromium`, `firefox`, or `webkit` | `"chromium"` |
| `pause_threshold` | Confidence threshold below which Sleuth pauses for guidance | `0.65` |
| `model.provider` | LLM provider: `claude-code`, `claude`, `openai`, `gemini` | `"claude-code"` |
| `model.model_id` | Model to use for analysis | `"claude-sonnet-4-6"` |

Set `pause_threshold` lower (e.g. `0.4`) when auditing apps with restricted access or many auth walls. Set it higher (e.g. `0.8`) for fully open apps where you want minimal interruptions.

---

## Supported LLM Providers

| Provider | Requires | Notes |
|---|---|---|
| `claude-code` | Claude Code installed + logged in | **Default.** Uses your Claude Code subscription — no API key needed |
| `claude` | `ANTHROPIC_API_KEY` | Direct Anthropic API access |
| `openai` | `OPENAI_API_KEY` | OpenAI API |
| `gemini` | `GEMINI_API_KEY` | Google Gemini API |

### Using Claude Code (recommended)

If you have Claude Code installed, just set `"provider": "claude-code"` in your config (this is the default). Sleuth will call the `claude` CLI using your existing subscription — no separate API key needed.

```bash
# Verify Claude Code is available
sleuth doctor
```

---

## Output

All output goes into `.sleuth/` (gitignored by default after `sleuth init`):

```
.sleuth/
  app-map.json        ← codebase map (routes, components, signals)
  journeys/           ← saved journeys for replay
  evidence/           ← screenshots, DOM snapshots, axe reports, logs
  findings.json       ← structured LLM findings (validated schema)
  report.md           ← human-readable audit report
```

---

## How It Works

**Phase 1 — Scan**
Sleuth reads your codebase and builds `app-map.json`: a structured map of every route, component, form, UX signal, and risk action.

**Phase 2 — Journey Inference**
Using the app map and live DOM analysis, Sleuth infers the user journeys most worth auditing — typical flows like login, onboarding, checkout, and key task completions.

**Phase 3 — Audit**
For each journey, Sleuth drives a real browser (Playwright), collecting evidence at each step: screenshots, DOM snapshots, console errors, network failures, keyboard navigation results, and axe accessibility reports.

**Phase 4 — Guided Mode**
When Sleuth encounters auth walls, multiple competing CTAs, modals, or drops below the confidence threshold, it pauses and asks you what to do. You can log in manually, select the path to follow, or skip a step.

**Phase 5 — LLM Analysis**
Evidence bundles are sent to the configured LLM with structured prompts. The LLM returns findings in a validated JSON schema. Every finding requires evidence. Every finding declares its confidence and unknowns.

**Phase 6 — Report**
`sleuth report` generates a markdown report with prioritized findings, file references, and implementation guidance per issue.

---

## Guided Mode — What to Expect

When Sleuth pauses for guidance, it will show you:
- What it detected (e.g. "Three buttons with similar labels — unclear primary CTA")
- What it needs from you (e.g. "Which path should I follow?")
- Its confidence score for each option

You'll respond in the terminal. Your choices are saved so the journey can be replayed later.

**Auth flows:** When Sleuth hits a login wall, it opens the browser visibly, pauses, and asks you to log in manually. Once you confirm, it saves your session to `sleuth-session.json` (gitignored) and reuses it for subsequent journeys.

---

## Findings Schema

All findings conform to this structure:

```json
{
  "id": "f-001",
  "journey_id": "journey-login-flow",
  "step": 3,
  "type": "accessibility | usability | performance | content | navigation",
  "severity": "critical | major | minor | info",
  "title": "Submit button has no accessible label",
  "description": "...",
  "evidence": ["evidence/step-3.png", "evidence/axe-step-3.json"],
  "file": "src/components/LoginForm.tsx",
  "line": 42,
  "confidence": 0.91,
  "unknowns": ["May be set dynamically at runtime"],
  "implementation_suggestion": "..."
}
```

Findings are rejected if:
- `evidence` is empty
- `file` does not exist in the scanned codebase
- `confidence` is missing
- `unknowns` is missing

---

## Design Principles

- **No issue without evidence** — Sleuth never reports a problem it didn't observe
- **Partial correctness over fake completeness** — partial journeys produce partial findings, clearly labeled
- **Honest uncertainty** — every finding declares its confidence and what Sleuth doesn't know
- **LLM is replaceable** — swap providers without changing anything else
- **Human-in-the-loop** — Sleuth pauses when uncertain instead of guessing

---

## Implementation Status

| Phase | Status |
|---|---|
| CLI shell + config | ✓ Done |
| App startup detection | ✓ Done |
| Scanner (React) | ✓ Done |
| Browser runner + evidence store | ✓ Done |
| Guided mode + session handling | ✓ Done |
| Deterministic audits (axe, keyboard, layout) | ✓ Done |
| LLM engine + findings schema validation | ✓ Done |
| Reporting | ✓ Done |
| Replay command | ✓ Done |
| Implementation planner | v2 |
