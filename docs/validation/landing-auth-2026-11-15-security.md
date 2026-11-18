# Landing and authentication validation

November 15, 2026. This record starts with a read-only design audit. Implementation and executable evidence remain pending; the reference application is not modified.

## Reference flow and boundaries

HabitQuest uses Google Identity Services' JavaScript popup callback. The browser submits the resulting ID token to its backend; the backend verifies an RS256 signature against Google's cached public keys, audience, issuer, expiry and required claims, and requires `email_verified` to be exactly true. Its account lookup uses Google's `sub`, then issues an application bearer token. Its current button configuration does not bind a nonce. Scout's proposed cookie-session flow therefore needs its own anonymous-flow/session-bound CSRF protection and single-use Google nonce; copying the reference UI alone would not establish those protections.

The dated HabitQuest setup document lists the production origin plus localhost and 127.0.0.1 on port 5180, with no redirect URI because it uses a JavaScript callback. This audit did not inspect current Google-console settings, select a Google account, read private environment files, disclose credentials, or change HabitQuest. Support for Scout's exact origin must be verified separately. The client-secret exchange is not part of the reference flow and does not justify exposing a secret to the browser.

Google's official [server validation guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) requires signature, audience, issuer and expiry validation and stable subject identity. It also distinguishes Google-authoritative Gmail/Workspace addresses from third-party email claims; automatic account linking by email needs particular care. The [JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference#nonce) supports a nonce, and the [setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) describes exact origins, callback/redirect configuration and the supported hosted GIS library.

The installed Next.js authentication guide was read before browser-test work. Next server rendering must verify the backend session with an uncached request; a cookie's presence is not an authorization decision. Client request mocks cannot validate this server-rendered boundary.

## Required evidence

| Boundary | Planned verification |
| --- | --- |
| Public landing | Original question transfers as a URL draft to `/app`; loading, menu, anchors and category links make no research/model/provider request. Illustrations remain clearly illustrative. |
| Backend gate | Anonymous and forged-cookie requests cannot read or mutate research, projects, notes, exports, economics/admin or SSE. Direct core access receives the same protection as Next's API path. |
| Internal MCP | Missing/wrong internal key is rejected; ordinary browser sessions do not authorize MCP. The key remains server-only and is supplied to the existing internal transport without entering browser bundles or forwarded caller headers. |
| Login/Google | Anonymous-flow CSRF and exact Origin validation; invalid signatures/algorithms/audience/issuer/expiry/nonce/subject/unverified-email rejected; single-use nonce; admission restricted to the owner policy. No live Google token is required for negative cases. |
| Owner setup | One atomic owner under concurrent attempts; no later public registration. Setup/token policy is reviewed against the final contract. |
| Session | Opaque hashed session storage, HttpOnly/SameSite cookies, Secure outside local development, fixed expiry, no-store config/session responses, logout revocation and no acceptance of arbitrary cookie values. |
| Recovery | Generic forgot responses for known/unknown identities; reset tokens never returned by public APIs; private local outbox or SMTP delivery; expiry/single use; successful reset revokes all old sessions and password access. |
| Redirects/proxy | External, protocol-relative and encoded redirect bypasses rejected. Cookie/Origin/CSRF forwarded correctly without trusting arbitrary internal headers or caching authenticated data. |
| Compatibility | Auth defaults off for existing fixture tests. Existing research/notes/credits and provider/model ownership remain unchanged. Protected `/app` preserves the current workspace. |

## Test execution limits

New browser tests will require explicit opt-in and a disposable auth-enabled SQLite/core/Next preview. They must refuse default live application ports and avoid existing user accounts, research stores and credits. Auth-off mocked UI checks are separate from backend-enforcement evidence. Any synthetic Google fixture is labelled as a fixture and never counts as a real-account sign-in.

Root owns service launch/builds, existing-suite compatibility, external Google configuration and final aggregate validation. The QA agent owns the new `landing-auth.spec.ts`, ignored browser runner, and this validation report family only.

## Implementation review

The first source review found an in-flight Google-link authorization race: an authenticated session was checked before token verification, then a newly read owner record could authorize linking after the initiating session had been revoked by logout or password reset. This is corrected by atomic session revalidation inside the link transaction, with verifier-hook regressions for both revocation cases.

Two additional findings are corrected: the initial scrypt work factor was below the matching 32 MiB setting in the [OWASP password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt), and the initial 16 KiB auth-body check trusted `Content-Length`, allowing a streamed body to bypass that early bound. The implementation now stores explicit scrypt parameters using N=32768, r=8, p=3, and counts request chunks before parsing.

Source inspection confirmed that the backend gate covers direct API and MCP routes, SSE rechecks the session before emitting subsequent data, auth responses disable caching, owner creation uses a write transaction and database constraint, and reset updates the credential version and revokes sessions. These are implementation observations, not substitutes for executable evidence. Recovery checks follow the [OWASP reset guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html); cookie checks follow the [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

A browser boundary check also found that a legal 1,998-byte Unicode question was lost when its percent-encoded sign-in return URL exceeded the initial 4,096-character limit. The return-URL limit is now 16,384 characters while retaining the same strict local origin/path checks. The landing form validates the 2,000 UTF-8 byte question limit before native GET submission and retains oversized input for correction rather than truncating it.

The existing browser suite now uses explicit `/app` workspace entries: 199 URL literals across 54 files. Existing behavior assertions were retained, and the shared mocked API explicitly returns auth-off config/session responses. Next SSR still talks to a separate real auth-off fixture core; no production authentication bypass was introduced.

## Executed evidence

The new [real-auth browser suite](../../frontend/tests/browser/landing-auth.spec.ts) passed **8/8**, with no skips or retries, in 33.4 seconds against the dedicated auth-enabled Next/core fixture at ports 3190/8190. See the [browser result](landing-auth-2026-11-15-browser.json). Its synthetic owner, private outbox, auth database, research store and credits are separate from existing user state. A synthetic public Google client ID was used, external browser requests were blocked, and no hosted generation or research/provider acquisition was admitted.

The cases establish draft-only landing submission; anonymous/forged-cookie rejection at Next SSR and direct core API; Origin/CSRF rejection; owner setup/sign-in with draft and resource-category preservation; HttpOnly session behavior; real logout revocation; private mode-0600 outbox recovery; generic known/unknown forgot responses; one-use reset and old-session/password revocation; malformed Google credential and nonce-replay rejection; safe return destinations; and landing/login/recovery reflow at 1440, 1100, 970, 768, 650, 390 and 320 pixels. The synthetic password is restored after recovery. Reset tokens and URLs are not printed or retained in the public report.

The auth implementation agent separately reported **72/72 scoped backend/API/settings tests**, lint and lock validation passing. Those tests cover real RSA fixture signature/claim rejection, nonce binding/expiry/replay, session and reset expiry, concurrent owner setup, both Google-link revocation races, protected-stream revocation, positive internal MCP initialization and all three internal-client headers, streamed body bounds and validation-error redaction. These are local fixture proofs, not a real Google-account sign-in. Root's full-suite/build and external configuration evidence remains separate.

The agent also reported a passing [auth-enabled HTTP/DeepAgents/MCP integration case](../../backend/tests/test_auth_mcp_integration.py): a cookie-and-CSRF-authenticated HTTP request traverses real DeepAgents and the keyed HTTP MCP transport to one injected fixture provider, streams evidence, accepts a CSRF-protected selection update and completes successfully. It records one MCP call, one fixture-provider call, zero hosted model requests and zero credits; provider requests receive no auth headers.

After the Unicode and landing-byte-limit corrections, **2/2 affected public cases passed** in 8.4 seconds on the rebuilt frontend. The [public regression result](landing-auth-2026-11-15-public-regression.json) covers the legal 666-character Unicode draft, oversized native byte validation without navigation/truncation, and the seven-width menu/form checks. Auth mutations were not repeated for these presentation and return-URL changes.

Four new landing/login desktop/phone captures and their bounded runtime/network evidence are recorded in the [capture report](landing-auth-2026-11-15-captures.json). Google Identity Services was intentionally blocked for offline validation, so its visible failure message demonstrates the password fallback rather than successful Google sign-in. The landing is a public entry page and illustration; no fictional research result or model-credit claim is presented as live work.

The final badge-only style rebuild passed the [read-only seven-width reflow/menu case](landing-auth-2026-11-15-final-reflow.json) again. Final desktop and phone captures were visually reviewed: the illustration badges leave its header, source text, footer, legend and caption visible; the login fields remain readable and operable. The original eight-flow auth suite was not repeated for these CSS-only changes.

One final authenticated-header geometry check found the 280-pixel Account menu clipping off the phone viewport's left edge despite zero document overflow. This is corrected with a phone viewport anchor. The [focused authenticated case](landing-auth-2026-11-15-account-geometry.json) now passes: its panel spans x=98–378 at 390 pixels and x=28–308 at 320 pixels, with zero page overflow; desktop placement, Escape closure and focus return also pass. This extra check signs in only to the same synthetic fixture account. The [320-pixel Account-menu capture](landing-auth-2026-11-15-account-320.png) shows its complete controls.

After the captures, two client modules received a nonvisual CSRF-cache correction: a successful auth response now primes the same cached proof consumed by research mutations. The [synthetic protocol result](landing-auth-2026-11-15-csrf-rotation.json) executes the actual TypeScript clients and passes the sequence of an initial proof, Google-link response rotation, next mutation with the new proof, rejection invalidation and explicit retry with no automatic resubmission. Saved reads do not fetch mutation configuration. It makes zero network calls and is not a real Google or browser sign-in test.

The capture receipt preserves the browser-tested build in `capturedSourceHashes`, lists the final implementation in `sourceHashes`, and records exactly these two later changes and their matching protocol hashes. DOM/CSS and screenshot bytes did not change. Earlier browser results are retained; the browser suite was not rerun after this client-only correction.

Status: **frozen: browser/public/header checks and the subsequent CSRF protocol proof passed**. The frontend typecheck result preceded the last two-client correction; root's final build checks are separate. Real Google account selection, authorized-origin verification and any real SMTP delivery remain outside this offline fixture proof.
