# Research Scout frontend

Next.js App Router + React + TypeScript workspace. The user-selected [Dub-inspired design](../system-design/dub-ux-adoption.md) uses a white sidebar, slate canvas, compact source index and persistent desktop preview. All fonts and SVG icons are local. This update adds no dependencies or component framework.

The frontend uses **port 3100** so it can run alongside GitHub Manager on port 3000. Application API requests are rewritten to `http://127.0.0.1:8100` by default. Set `SCOUT_API_URL` before starting/building to use a different backend. Start the independent provider services and application core using the root project instructions.

From this directory, with Node.js on `PATH`:

```sh
npm ci
npm run dev
```

The repository-local runtime can be selected with `PATH="../.tools/node/bin:$PATH"`. Open [Research Scout](http://127.0.0.1:3100). For a production build, run `npm run build`, then `npm run start`. Next.js telemetry is disabled by these scripts.

The frontend shows the backend's actual fixture/live mode. Fixture records remain explicitly labeled as synthetic. A provider/structured-filter change becomes a new request only after Search. Available saved source rows can be reviewed during execution; lexical/semantic statuses, later annotations and registry checks remain distinct. Stable rows preserve scroll/focus and human choices. Reconnect/reopen use saved application state. The final rank is applied explicitly.

The source preview has Overview, Metadata and Your notes tabs; phones open the same content in a native dialog. Human include/exclude/reason decisions, explicit detail lookup, agency-routed DOI checking and whole-record citation-source choice retain the existing API behavior. Registry fields never overwrite discovery fields. Research notes groups the current run's saved selection reasons. The three-paper shortlist and 2,000 UTF-8-byte question bounds are visible; over-limit text stays editable. Bibliography and manifest downloads use the saved revision.

Settings contains year bounds for the next explicit search, source density and optional list excerpts. Result filtering searches already received titles/authors/years locally. Provider controls display existing application configuration. These display actions make no new research/model calls; they do not install the unsupported controls or fictional data from the design trial.

## Checks

```sh
npm run typecheck
npm run build
npm run test:browser
```

Install the test browser when needed with `PLAYWRIGHT_BROWSERS_PATH=.browser-cache npx playwright install chromium`. The browser suite uses full Chromium with GPU disabled because this machine's headless-shell build did not produce animation frames even on an isolated blank page. It retains real click/hit testing and uses a dedicated server with automatic server reuse disabled.

Deterministic tests under `../tests/browser/` intercept only application requests and inject controlled snapshot events. They validate UI behavior, not live provider relevance. `SCOUT_BROWSER_INTEGRATION=1 npm run test:browser` additionally enables the local fixture-backend acceptance case. That case requires synthetic provider configuration; it does not authorize live provider/model calls. Set `SCOUT_BROWSER_EXTERNAL_SERVER=1` to use a frontend process you started yourself, and optionally `SCOUT_BROWSER_URL` for its URL.

Browser screenshots/traces live under `../tests/browser/artifacts/` and are ignored. Chromium binaries, dependencies and `.next/` are local ignored artifacts. The dependency lockfile records exact resolved versions.

Current API usage was checked against the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) documentation on October 26, 2026. The installed application versions are Next.js 16.4.3 and React 19.3.1.
