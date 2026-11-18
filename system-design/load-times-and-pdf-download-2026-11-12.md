# Load times and inline PDF download

November 12, 2026. The existing browser UI now shows elapsed and completed load times without adding provider/model calls, dependencies or backend endpoints.

Timing labels use `<1 ms` below one millisecond, rounded milliseconds below one second, seconds with two decimal places below one minute, then minutes/seconds. Labels update every 250 ms during an active wait and stop at completion. Browser timers use monotonic `performance.now()`; ticket guards prevent a late response from changing the selected record's completed timing. The labels do not generate repeated screen-reader announcements.

Coverage includes saved-result reads, selected paper/video metadata, explicit details and DOI checks, abstract lookups, visible thumbnail waits, video frame loading, caption lookup, PDF frame loading and PDF download preparation. Original search duration comes from the saved start/completion timestamps and is shown separately from reopening saved results. Unknown original durations remain absent. Media frame load time does not establish full PDF rendering or completed video buffering. Thumbnail timing begins when the image is observed as visible.

The expanded inline PDF preview includes a Download PDF action and its own elapsed/preparation time. It explicitly fetches the provider-reported PDF in the browser, omits credentials, checks the PDF signature and saves a named PDF blob without navigating away. The transfer has a 30-second timeout and a 50 MB byte limit; closing the preview cancels a pending download, and temporary blob URLs are revoked. It does not parse/index the file or add its contents to model evidence.

A host can block browser fetching through CORS, require login or return a non-PDF error page. Those outcomes show an explicit error and a link to open the PDF in a new tab for the native viewer's Download control. There is no automatic retry or new server relay. The streaming body and browser download mechanisms follow [Response.body](https://developer.mozilla.org/en-US/docs/Web/API/Response/body) and [anchor download](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download) browser APIs.

See the [validation receipt](../docs/validation/2026-11-12-timing-download-final.json) for exact scope: active/completed unit handling, stable completed durations, stale-selection guards, media load events, actual PDF file bytes, blocked/non-PDF responses and pending-download cancellation. Saved-live review reads existing research with API writes blocked and checks unchanged provider/model usage.
