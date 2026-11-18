# Restored previous Research Scout UI

November 10, 2026. The user rejected the Material blue / preview-v2 layout and asked for a quick return to the previous design.

The dashboard component, global CSS, chat composition, source cards, inspector appearance, icons and original publication-date defaults are restored from `057a3bf`, the previously pushed Dub-inspired implementation. Trial-only atom and result-filter components are removed from the active app and preserved in an ignored local backup. Reference HTML and trial screenshots/validation records remain intact.

YouTube backend services, provider configuration, routing and relevance corrections remain implemented. Minimal client compatibility preserves the YouTube source label, source metadata and safe description reads; unsupported YouTube detail acquisition stays disabled. The existing automatic multi-source search, DOI grouping, Unpaywall, saved history, source inspection and exports remain available in the restored layout. YouTube live access still needs the user’s API key.

Verification: typecheck, focused desktop/mobile browser acceptance, production build and a read-only live saved-results check. No new provider/model call is needed for this rollback.

[Rollback validation receipt](../docs/validation/2026-11-10-ui-rollback.json): typecheck/build and three focused browser cases passed. The live page uses the original 218-pixel sidebar and palette; all 26 papers in the previous saved live search survived reload with zero new POST, research or model calls. No browser errors were observed. [Restored dashboard screenshot](../docs/validation/2026-11-10-ui-rollback.png).
