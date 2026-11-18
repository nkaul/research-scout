# Direction 10: Observatory App

November 15, 2026. Add **exactly one new app mockup**. Preserve all nine earlier previews, including #08 Research Observatory as the landing concept and #09 Reference App as its compact app interpretation. This new option answers the user's specific finding that #09's fonts are too small. It must be visibly larger and carry Observatory's visual personality while keeping the working app structure.

## Measured problem and required scale

Read both scoped skills and the relevant Impeccable typeset/Operate and UI UX Pro Max readability, control and reflow guidance. Measured #09 in installed Chrome at 1440px and 390px, at normal browser scale, using local preview reads only. The issue extends well beyond source prose: desktop chips are 9px, control labels 10px and metadata 11px. On phones, access labels fall to 8px. A larger page heading alone will not address the request.

The following are **computed CSS size goals**, not values that may be reduced by a later responsive override. Use rem equivalents so browser text scaling remains effective. The phone target is preferred; a stated floor is a lower bound, including at 320px.

| Role | #09 desktop measured | #10 desktop goal | #09 phone measured | #10 phone goal / floor |
| --- | --- | --- | --- | --- |
| Page heading | 26px | 34px, roughly 750 weight | 25px | 30–32px |
| Original question | 17px | 20px | 16px | 18px |
| Source title | 17px | 20–21px | 17px | 20px / 19px |
| Result prose | 13px | **16px** | 13px | **16px / 15px** |
| Reader prose and Original | 14px | **17–18px** | 14px | **17px / 16px** |
| Reader title | 16px | 21px | 16px | 20px |
| Meaningful author/publication metadata | 11px | 13–14px | 10px | 13px / 12px |
| Provider/topic chips and count badges | 9px | **12px minimum** | 9px | **12px minimum** |
| Saved query focus text | 11px | 15px | 11px | 14px / 13px |
| Navigation labels | 12px | 14–15px | 12px | 14px |
| Toolbar labels | 10px | **14px** | 10px | **13px minimum** |
| Reader tabs | 11px | 14px | 11px | 13px minimum |
| Key points / Original controls | 10px | 14px | 10px | 13px minimum |
| Access/observation facts | 9px | 13px | 8px | 12px minimum |
| Used-credit text | 10px | 13px | 9px | 12–13px |

These are meaningful increases: 13→16px prose is about 23% larger, 9→12px chips about 33%, and 10→14px control labels 40%. They must survive the 1200/970/700/370px media rules that shrank secondary content in #09. Include popover labels, timing, tooltips, transcripts, source context, notes and diagnostic tables in the role system; do not leave an alternate view at 9px. One font-size change on `body` is insufficient where descendants declare smaller sizes.

Prefer 40–44px source actions and common icon controls, around 40px labeled toolbar buttons, 38–40px reading toggles, approximately 46px navigation rows and 20–22px action glyphs. #09's first source action measured 31×31px and its reading toggle only 29px high. Allow groups to wrap rather than squeezing targets or labels. These are project usability goals; web CSS-pixel guidance is distinct from native pt/dp rules.

## Observatory visual language inside the app

The actual #08 heading uses an Avenir Next / Trebuchet MS / Segoe UI display stack, 750 weight and a 64px hero size. Bring its rounded, confident sans character to a **34px app heading**, 20–21px source headings and stronger section labels. Keep ordinary prose calm and readable. Do not import its 64px hero, a split promotional introduction or feature-card sections into the workspace. Fonts remain locally available fallbacks; no download or claim of an installed catalog font is needed.

Use Observatory's clear navy text, blue/violet identity and generous white surfaces more decisively than #09: a restrained blue-to-violet emphasis on the brand or page-heading word, soft cool atmosphere around the composer, larger colored modality icon wells, 18–20px source-card radii and a clear reader frame. Keep source prose on an opaque, slightly warm white surface and controls on cooler white. Source titles and body text remain solid ink; avoid gradients on prose, saturated inactive controls or glow that weakens contrast. No tilted interactive surface, ornamental chart, new metric dashboard or hero artwork.

Give cards 22–24px padding and a deliberate reading rhythm rather than simply enlarging letters inside #09's small boxes. Aim for a roughly 430–460px reader at wide desktop sizes so 17–18px prose has a useful measure. Preserve bounded independent reading scroll and the current explicit inline reader behavior on phones. The intentional cost is fewer visible records; do not reverse the scale to win back density.

## Structure and features that stay

Keep sidebar, header, breadcrumbs, used credits, environment/local state, Export, workspace heading, project/concept/manage/save/New research actions and Search workspace/Exploration controls. Keep the editable question above Sources/Date/Custom/Limits/AI, all four information icons, timing/status, local filter/active indication and Stop during replay. Saved AI focus remains immediately below settings, with meaningful chips, an operable +N and Query details; heavy traces stay hidden by default.

Keep **one row of four resource tabs** in the same logical order: Papers, Videos, Data, Repos. At 320px, use modest padding and the existing internal label/count stacking; approximately 14–16px modality glyphs can coexist with 13px labels and 12px counts. Increase tile height if needed. Do not change the navigation to a 2×2 grid or shrink labels to fit. Controls and source-action groups may wrap independently.

Keep the single-column source list and adjacent desktop reader, source/provider/year/access/version and observation identity, visible observation counts, two initial source-derived points, Key points/Original, inline expansion, source/project actions, explicit PDF/video/transcript affordances, dataset metadata and saved README/topic controls. Preserve Overview/Metadata/Notes, note drafts, local saved choices, per-view filters and saved-versus-next settings. Retain Providers, Settings, Admin/tokenomics, projects, saved resources and recent searches in navigation. The same nine authored resources and example question remain comparison data; no live acquisition is needed.

## Actual guidance receipts and boundaries

[observatory-app-catalog.json](observatory-app-catalog.json) contains five actual local searches plus the rendered #09/#08 baseline measurements. UI UX Pro Max is pinned at `d643997c82e94742dd3bee43210b0198e8bbba3d`; [typography](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/typography.csv) and [UX rows](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/d643997c82e94742dd3bee43210b0198e8bbba3d/src/ui-ux-pro-max/data/ux-guidelines.csv) supply the primary catalog sources. The initial bold/geometric query returned poster/Bauhaus recommendations, which were rejected as the wrong product fit. One narrower retry returned Friendly SaaS and Enterprise SaaS Mobile; adopt their coherent, readable sans role hierarchy without copying native uppercase prescriptions or downloading Plus Jakarta Sans.

UX matches cover readable body text, line height/contrast, target-size distinctions, spacing and text/chip reflow. The catalog prefers 16px mobile body text; the brief therefore targets 16px with a project review floor of 15px. These numerical goals interpret the user's readability request; they were not specified numerically by the user. Impeccable [typeset](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/typeset.md) and [Operate](https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agents/skills/impeccable/reference/operate.md) support stable role sizes and readable measures. This is Impeccable-guided design review: no engine/detector, design-system generator, model/provider call, new dependency or production adoption is claimed.

## Acceptance before freeze

Measure #10 at the same 1440px and 390px sizes and at 320/650/768/970/1100px. Check the entire role table, alternate modalities, metadata/notes, open diagnostics/popovers and selected-source reader. Reject a capture that still reads as #09 in miniature or merely enlarges the h1 while retaining tiny controls, chips or source facts. Review long titles, full question visibility, single-row tabs, wrapped actions, keyboard/focus return, tooltips, independent scrolling, reduced motion, contrast and local-only behavior. Record the increased density cost honestly; preserve information and readable size rather than hiding content to satisfy a screenshot.

## Rendered critique

Reviewed the refreshed [1440px desktop](screenshots/observatory-app-desktop.png) and [390px phone](screenshots/observatory-app-mobile.png) captures after the token-scoping and sidebar-width corrections. Additional temporary captures at 1440/1100px and a populated reader were also inspected. The complete wordmark and tagline now fit; the desktop navigation stays readable, and the larger source prose, source titles, metadata, chips, controls and reader clearly distinguish this option from #09. The gradient heading, blue-violet canvas, rounded sans character and larger modality icon wells connect it to Observatory without introducing a hero or changing the app's navigation structure. No overlapping content was observed in these captures. Four resource tabs remain in one row, and phone actions wrap rather than returning to tiny text.

The density cost is substantial and intentional: the first source card starts around 786–787px down the 1440px desktop page and around 1196px down the 390px phone page. Larger roles and wrapped project/settings controls make the phone page longer and fit fewer records on desktop. This trial favors legibility; it should not be described as a denser or faster-scanning workspace. At intermediate widths the reader wraps more tightly, making its independent scrolling important. No late size reduction, information removal or navigation restructuring was requested to conceal that tradeoff.

The visual review passes the requested distinction from #09. The [final frozen acceptance report](validation-observatory-app.json) records **38 passing checks** across seven widths. Desktop prose is 16px, source titles 21px, both reader text modes 18px, controls at least 14px and chips at least 12px. Phone prose is 15px, reader text 17px, source titles 20px, controls at least 13px and metadata/chips at least 12px. The inherited 14px Original-reader override was corrected and both reading modes were measured; the matrix also covers card Original, all four resource lanes, notes and settings.

The report verifies all 54 local handlers, the one-row resource tabs and complete wordmark geometry. Eleven sampled opaque contrast pairs measured 4.77:1–10.76:1; no external/API requests, HTTP writes or runtime errors were recorded. These are scoped authored-preview checks, not a full accessibility audit or proof of production retrieval/persistence behavior. No visual blocker remains, and no further presentation changes were requested before freezing the new preview.
