# Research Scout design skill trials

November 15, 2026. User-approved standalone mockups; **the working application is unchanged**.

**Added direction 10: [Observatory App](observatory-app.html).** The user found direction 09's text too small and requested the landing concept's look and feel within the existing app structure. This version uses a larger type scale for source text, metadata, chips and controls, with Observatory-inspired blue-violet accents, rounded branding and soft white surfaces. Sidebar, header/actions, query controls, resource tabs and list/reader topology remain in place. All nine earlier prototypes and their captures remain preserved.

[Design, typography and skill references](observatory-app-brief.md) · [Local catalog receipts](observatory-app-catalog.json) · [Browser and font-size checks](validation-observatory-app.json) · [Ten-preview gallery](screenshots/gallery-ten-desktop.png) · [Preservation verification](verification-observatory-app.json).

**Added direction 09: [Reference App](datapulse-app-refined.html).** The user identified Observatory as a landing-page concept and requested a separate refinement of the app itself. This additional preview keeps the sidebar, project/query actions, used-credit display, editable question, compact settings and information controls, AI focus, four resource tabs and selected-source reader. The reference's typography, surfaces, depth and color are adapted to the existing workspace rather than adding a landing-page hero. All eight earlier prototypes remain available with their runtime files and captures preserved.

[App design brief and preservation checklist](app-refinement-brief.md) · [New app browser checks](validation-app-refinement.json) · [Nine-preview gallery capture](screenshots/gallery-nine-desktop.png) · [Addition and preservation verification](verification-app-refinement.json).

**Added direction 08: [Research Observatory](datapulse-observatory.html).** Following the user's request for exactly one substantially different reference adaptation, this preview uses floating horizontal navigation, an oversized split hero, a layered evidence illustration, six research entry cards and a separate full-width evidence desk. It has its own HTML/CSS/JS and does not reuse the original workspace renderer. The original seven previews and captures remain unchanged.

[New direction rationale](family-notes-observatory.md) · [Creative brief and visual review](reference-reimagined-brief.md) · [20 passing checks at seven widths](validation-observatory.json) · [Eight-preview gallery capture](screenshots/gallery-eight-desktop.png) · [Addition and preservation verification](verification-observatory.json).

Open [the comparison gallery](index.html), or run the local preview from the repository root:

```bash
.tools/node/bin/node discovery/ux/2026-11-15-design-skill-trials/serve-preview.mjs
```

The default address is `http://127.0.0.1:3215`. `SCOUT_MOCKUP_PORT` can select a different unused port. The server serves this folder only, accepts GET/HEAD and blocks API connections through its preview content policy. All mockups also use ordinary relative CSS/classic JS for local file viewing.

| Family | Preview | Main difference |
| --- | --- | --- |
| Impeccable-guided | [Quiet Workbench](impeccable-quiet.html) | Compact flat rows, restrained borders and tight shared alignment. |
| Impeccable-guided | [Research Folio](impeccable-folio.html) | Warm surfaces, serif source prose and greater reading emphasis. |
| Impeccable-guided | [Signal Desk](impeccable-signal.html) | Stronger source distinctions and an organized desktop action rail. |
| UI UX Pro Max | [Swiss Workbench](pro-swiss.html) | Disciplined grid, divided rows and high information density. |
| UI UX Pro Max | [Scholarly Reading Desk](pro-scholar.html) | Paper-like reading surface, academic typography direction and wider reader. |
| UI UX Pro Max | [Material Clarity](pro-material.html) | Clearer layered surfaces, Material blue selection and larger controls. |
| Reference adaptation | [DataPulse Research Workspace](datapulse-workspace.html) | Softer cards, depth, typography and colored line icons. |
| Reference-first reimagining · added #08 | [Research Observatory](datapulse-observatory.html) | A new page topology: floating navigation, large split hero, research card map and embedded evidence desk. |
| Reference-informed app refinement · added #09 | [Reference App](datapulse-app-refined.html) | The existing app topology with refined typography, white surfaces, purposeful color and organized controls; all resource lanes and reader actions remain represented. |
| Readable landing-inspired app · added #10 | [Observatory App](observatory-app.html) | A larger type/control scale and Observatory visual character within the same app and tab structure. |

Each preview has the same question, three papers, two videos, two datasets and two repositories. All records, abstracts, descriptions, README excerpts, metrics and transcript text are authored examples. Provider labels and sample identifiers are illustrative; no provider/model request is made. The example credit meter is independent of live accounting.

The shared local renderer supports resource tabs, selected readers, keyboard navigation, Key points/Original, inline expansion, metadata, notes, preview project saves, settings popovers, AI focus and a progressive loading replay. PDF/video/external-download actions demonstrate their placement without acquiring media. Notes and saves last for the open preview only. [Shared contract](CONTRACT.md).

## Reusable project skills

- [`scout-impeccable`](../../../.agents/skills/scout-impeccable/SKILL.md): active scoped adapter, with [portable copy](../../../skills/scout-impeccable/SKILL.md). Applies reviewed Operate/Read, polish, layout, typography and clarity guidance. **No native Impeccable engine, detector, hooks or live Apply was installed or run.**
- [`scout-ui-ux-pro-max`](../../../.agents/skills/scout-ui-ux-pro-max/SKILL.md): active scoped adapter, with [portable copy](../../../skills/scout-ui-ux-pro-max/SKILL.md). Includes four standard-library Python scripts and linked catalogs for supported design and React/Next.js searches. The existing locked uv project was used; no new app dependency was added.

Both adapters preserve user authorization, current project choices and source/runtime ownership. Upstream commits, imported paths, hashes, license material and update instructions are recorded in each bundle. Skill names can be used on future turns; explicit SKILL.md paths work if the host has not refreshed project skill discovery. The repository ignore rules expose these two approved bundles while continuing to ignore unrelated local agent material.

The eighth preview intentionally gives its reference-led introduction more space. The evidence desk is farther down the page than in the seven compact workspaces; the primary desk link, feature-card entrances and search replay provide shortcuts. The user has retained this as the landing-page concept. The ninth is its companion app mockup, with the current workspace structure preserved. Neither is an implementation adoption or a measured claim of improved research productivity.

## Methods and evidence

- [Approved plan](plan.md).
- [Impeccable rationale](family-notes-impeccable.md) and [bundle validation](impeccable-skill-validation.json).
- [UI UX Pro Max rationale](family-notes-pro.md) and [16 actual local catalog/generator checks](receipts-pro.json). Designer adaptations and rejected/retried catalog matches are distinguished from script output.
- [Reference rationale](family-notes-reference.md). The supplied DataPulse page was rendered and inspected; its product interactions were not verified. Its visual treatment was adapted to Scout's compact research workflow.
- [Browser acceptance](validation.json) and [screenshots](screenshots/gallery-desktop.png). These verify authored previews, not live retrieval quality or a production migration.
- [Combined verification](verification.json), [representative contrast/keyboard checks](accessibility-checks.json) and [artifact hashes](ARTIFACTS.json). All seven previews passed interactions across seven widths; the sampled initial-view text roles met 4.5:1 contrast (lowest measured 4.54:1). Keyboard checks cover AI refinement, resource tabs and mobile drawer focus. This is not a full WCAG conformance audit.

All variants use local system-font fallbacks without downloading font binaries. The selected typography roles are visible, but the exact catalog font appearance depends on fonts already available on the device.

Start the review with Quiet Workbench for a restrained progression, Material Clarity for explicit controls and selection, and the DataPulse adaptation for softer presentation. Swiss gives the densest scan; the Folio and Scholarly variants trade visible rows for reading rhythm. Signal is useful for comparing a dedicated action rail. Application adoption remains a separate choice after reviewing these previews.
