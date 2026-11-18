# Research Scout: separate Google sign-in client

The user selected a separate Research Scout client and requested this setup guide. HabitQuest is a flow reference only; its client and configuration are unchanged.

**Reported callback error fixed, November 15:** “Google sign-in is temporarily unavailable” was reproduced as a backend TLS failure while retrieving Google's public signing keys. This Python installation lacks its default trusted CA files. The verifier now supplements platform/configured trust with the project's pinned `certifi` bundle, keeping certificate and hostname verification enabled. The backend has been restarted with this fix. Public-key acquisition and a deliberately invalid-signature request to the running app now complete correctly; the request returns 401 instead of the former transport 503. Refresh `/login` to obtain a fresh flow/nonce before trying Google again. [Tests and live probe](validation/google-oauth-tls-2026-11-15.json).

A real successful Google account sign-in is still untested. The fresh headless-browser button probe continues to observe Google's separate origin rejection; that does not explain the reproduced callback's TLS failure, and neither validation is a claim of a completed user login.

**Local activation, November 15:** The supplied Research Scout client ID is saved in the ignored root `.env` and has been loaded by restarting the backend. The frontend's same-origin auth configuration returns the matching public client ID without exposing the saved client secret. Research, credits and existing owner/session records were preserved. The popup flow does not use a client secret. A real Google account sign-in still needs to be completed by the owner.

The initial live Google button check reported **“The given origin is not allowed for the given client ID”** on both local app addresses. Add the origins below to this exact Web client's **Authorized JavaScript origins** in Google Console and save. Scout cannot edit that Google-side allowlist using a client ID or secret. Also check that `/login` and `/account` use the origin-only `strict-origin` referrer policy: Google needs the origin for its check, while paths, research queries and reset tokens must not be sent. Recovery pages keep `no-referrer`.

**After saving the origins:** The owner confirmed saving all requested origins. Two fresh-browser rechecks still receive Google origin rejection on both addresses; the running public client ID matches `.env`, and local referrer/privacy checks pass. Google documents [five minutes to a few hours for settings to take effect](https://support.google.com/cloud/answer/15549257?hl=en). Propagation may explain this, but the cause is not confirmed. If rejection persists after propagation, compare the exact client ID in Console with `SCOUT_AUTH_GOOGLE_CLIENT_ID`; no restart is needed when only Console origins change.

1. Open [Google Cloud Console's OAuth clients](https://console.cloud.google.com/auth/clients). Select the Google Cloud project you want to use for Research Scout. If using a new project, configure its OAuth branding/audience with Research Scout's information.
2. Create an OAuth client of type **Web application**, named **Research Scout localhost**.
3. Add these **Authorized JavaScript origins**, exactly:

   ```text
   http://localhost
   http://localhost:3100
   http://127.0.0.1:3100
   ```

4. This implementation uses a Google Identity Services **popup with a JavaScript credential callback**. Leave Authorized redirect URIs empty. `/api/auth/google` is Scout's same-origin JSON endpoint; it is not an authorization-code redirect endpoint.
5. Copy only the new public **client ID** into the ignored repository-root `.env`:

   ```dotenv
   SCOUT_AUTH_GOOGLE_CLIENT_ID=YOUR_RESEARCH_SCOUT_CLIENT_ID.apps.googleusercontent.com
   SCOUT_AUTH_PUBLIC_URL=http://localhost:3100
   SCOUT_AUTH_FRONTEND_ORIGINS=http://localhost:3100,http://127.0.0.1:3100
   ```

6. Restart the Research Scout core to load its new environment, then refresh `/login` or `/account`. The frontend reads the public client ID from the backend at runtime; this change does not need a frontend rebuild.
7. Complete the Google account chooser yourself. Confirm it returns to the current app at `/app`, and then verify sign-out. If you created a password owner first, sign in with that password and connect Google from **Account and sign-in options** at `/account`.

No client secret, authorization-code exchange or Google API access token is needed for this identity-only flow. A YouTube API key is a different credential and cannot replace this client ID. Do not copy the downloaded client's secret into frontend variables, source files, screenshots or chat.

Only basic sign-in identity is requested. No Gmail, Drive or YouTube permissions are added. If Google reports an origin mismatch, compare the browser's exact scheme/host/port with the client's authorized origins and allow time for configuration propagation. Login uses nonce, CSRF and backend token validation; a rendered button alone does not establish a successful account connection.

Google's primary references: [Web client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [callback/nonce API](https://developers.google.com/identity/gsi/web/reference/js-reference), [server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).


[Local activation and browser evidence](validation/google-oauth-activation-2026-11-15.json) records the loaded client, preserved state, targeted privacy checks and remaining Google Console gate.

## Local password recovery

`/forgot-password` accepts the owner username or email. For the selected localhost delivery mode, open the newly written JSON message in the ignored `.scout/auth-outbox/` directory on this computer and follow its `reset_url`. Treat the URL as a temporary credential. It expires after 30 minutes and can be used once. The public recovery response never includes that URL, and no external email is sent in this mode.
