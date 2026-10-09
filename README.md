# Evidia Studio — Platform Console

Separate operational/admin console for the Evidia platform. This is NOT
the study workbench in `studio/` (Next.js). The console talks to the backend
through a single seam: `src/lib/api.ts`.

## Mock / live modes

Mode is controlled by `VITE_EVIDIA_API_MODE` (see `.env.example`; copy it to
`.env.local`, never commit secrets, restart `npm run dev` after changes):

| `VITE_EVIDIA_API_MODE` | Behavior |
| --- | --- |
| unset / empty / `mock` (**default**) | **Mock mode (current default):** fixtures + fake-JWT seam, no network. `src/lib/api.ts` resolves data from `src/fixtures/` after a tick. Every view renders the MOCK DATA banner. Nothing touches a real system. |
| `live` | **Live mode (code-ready, NOT yet run):** fetch-based client for the FastAPI Studio API (Cognito JWT with `custom:tenant_id` claim). Requires `VITE_EVIDIA_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, and `VITE_COGNITO_CLIENT_ID` (all three). |

Live-mode configuration is fail-loud: setting `VITE_EVIDIA_API_MODE=live`
without all three required vars throws `StudioConfigError` at startup naming
the missing vars (no silent fall back to mock); the root render path
(`src/main.tsx`) shows that as a visible configuration-error state.

The live client sends `Authorization: Bearer <token>` from the existing auth
seam (`src/lib/auth.ts` — `getToken()`), joins paths against
`VITE_EVIDIA_API_BASE_URL`, and surfaces JSON errors as thrown `ApiError`s.
It calls the FastAPI routers where they exist today (`/admin/tenants`,
`/admin/tenants/{id}/plan`, `/dq/runs`, `/api/studies`, `/cohorts/*`). The
billing invoice/usage, evidence-package, agent-catalog, and agent-runs
endpoints are not mounted on `studio/api` yet, so those methods throw
against a live backend until that parity lands.

Honest status: **live mode is code-ready and has never been run against a
deployed backend.** Auth is still the mock seam (`src/lib/auth.ts`): in
live mode the fake-JWT demo token is not seeded and the tenant switcher is
disabled, but no real Cognito sign-in flow exists yet — the console reads
whatever token the seam holds (production must replace it with the Cognito
Hosted UI / Amplify-auth token). Do not treat live mode as production-ready.

### Environment variables

Documented in `.env.example` (all four, with the mock default):

- `VITE_EVIDIA_API_MODE` — `mock` (default) or `live`.
- `VITE_EVIDIA_API_BASE_URL` — FastAPI Studio API base URL (live).
- `VITE_COGNITO_USER_POOL_ID` — Cognito pool for the JWT authorizer (live).
- `VITE_COGNITO_CLIENT_ID` — Cognito app client id (live).

## Views

- **Dashboard** — tenant cards, DQ score gauge (0–100, `dataquality` score
  shape), recent studies, usage/billing summary (`ai/billing.py`
  `invoice_report()` shape; unpriced usage stays unpriced).
- **Cohort Builder** — JSON editor in the `engine/cohort_schema.json`
  shape; Validate / Count hit the API client (attrition table from the
  `count_cohort()` result shape); ATLAS export downloads fixture JSON
  (`to_atlas_json()` shape). Counts describe fictional rows, never
  epidemiology.
- **Evidence Package** — provenance chain (dataset → de-id gate → DQ
  checks → study run → dossier) + Part 11 signature list
  (`governance/part11.py` record shape; fixture hashes are illustrative).
- **Agent Console** — the 5 product agents
  (`ai/agents/product_agents.py`), run history, expandable run detail
  showing ontology tool calls (`ai/ontology_mcp.py` tool names).
- **Tenant Admin** — tenant list with `tenant_plan()` provisioning
  resources, groups/users, and the fail-closed offboard guard verdict.

Auth is a mock seam (`src/lib/auth.ts`): a fake JWT in localStorage with
`custom:tenant_id` / `cognito:groups` claims, parsed client-side. In mock
mode the header tenant switcher is labeled DEMO and only re-mints that fake
JWT; in live mode it is disabled and the tenant comes from the JWT claim.

## Develop

```bash
npm install
npm run dev    # Vite dev server
npm run build  # tsc --noEmit && vite build
npm test       # vitest run (view smoke tests + auth + API mode resolution)
```

## Live demo

**https://amjdseyal007.github.io/evidia-studio/** (mock data — no backend, no live accounts)

Served from `docs/` via GitHub Pages. The console runs entirely on
fixtures with a mock auth seam; the live API switch is one seam in
`src/lib/api.ts`.

Part of Evidia Health — a BYOD evidence platform for life sciences
(OMOP harmonization, ontology-governed AI agents, regulator-grade
evidence packages). The platform backend is under active development.
