# Research Scout: three directions for a more engaging research workspace

**UX Design Researcher · October 28, 2026 · concepts for review, not an adopted redesign**

The recommendation is to review three distinct visual directions against the same research task, then carry the strongest composition into the current Next.js application. **Cobalt Studio** is the closest evolution of the previously selected blue direction. **Fieldnotes** explores an editorial reading environment. **Midnight Observatory** explores a focused dark workspace. These are standalone HTML concepts, not production integrations or a component-library selection.

[Open the comparison gallery](index.html). The companion [inspiration and accessibility research](inspiration-and-accessibility.md) records the supporting research agent's primary sources, candidate tokens, contrast calculations and component mappings.

## What “next year” means here

Next year is **2027**. No 2027 award rankings, released-product winners or claims about future best practices can be verified in October 2026. These concepts are proposals for a 2027-facing direction, informed by current official design guidance and documented product design work. The browser research below was checked on **October 28, 2026**. Publication dates are recorded where the publisher supplies them; a retrieval date is not a publication date.

The prototype author read the current root/frontend agent instructions, frontend component/CSS source, current desktop validation screenshot, [UX research intake](../../../system-design/ux-research.md) and [implementation status](../../../system-design/implementation-status.md). The existing implementation has a sound source-first journey, but similar emphasis across many pale surfaces, compact text and restrained hierarchy make it feel generic. That is a visual critique, not a participant-tested finding.

## Verified references and the design decisions they informed

| Primary source | Verified guidance or example | Application to these concepts — our design inference |
| --- | --- | --- |
| [Google Design: expressive design research](https://design.google/library/expressive-material-design-google-research) | Color, shape, scale, motion and containment direct attention and group related controls. Google's research concerns its own designs and contexts. | Cobalt gives the composer a confident identity and groups scope controls on a tonal surface. It keeps the reading area quieter. Google's results do not establish that Research Scout is faster or preferred. |
| [Material 3: color roles](https://m3.material.io/styles/color/the-color-system) | Color is assigned by semantic role, including surface, primary and paired foreground roles. | Every concept declares canvas, surface, ink, muted text, primary action, selected surface and status tokens. Darkening a text token is preferable to making metadata faint for visual effect. Actual pairs still require testing. |
| [Material 3: applying typography](https://m3.material.io/styles/typography/applying-type) | Typography roles distinguish display/headline/title, body and label uses. | Titles carry discovery hierarchy; metadata remains readable; operational details recede. Fieldnotes uses system serif for editorial titles and system sans-serif for controls, rather than a different decorative font everywhere. |
| [Linear: latest design refresh, March 12, 2026](https://linear.app/now/behind-the-latest-design-refresh) | Predictable header actions, quieter supporting chrome and density without overwhelm are explicit goals of Linear's refresh. | Keep export and navigation predictable, align panels with the reading area and avoid additional dashboards. Midnight's three counters represent actual synthetic state rather than vanity metrics. |
| [Linear: interface redesign, March 28, 2024](https://linear.app/now/how-we-redesigned-the-linear-ui) | The earlier redesign explains alignment, visual hierarchy and a consistent sidebar/header structure. | Cobalt retains a familiar workspace shell while changing the composer's character. Fieldnotes deliberately tests a different top-navigation composition. |
| [Vercel Geist: colors](https://vercel.com/geist/colors) | Backgrounds, component fills, borders and text/icons have distinct roles. | Use a strong enough border where a control needs an outline, with lighter dividers for decoration. Give selected and hover states explicit tokens. |
| [MUI: theming](https://mui.com/material-ui/customization/theming/) and [CSS theme variables](https://mui.com/material-ui/customization/css-theme-variables/usage/) | MUI supports centralized palette, type, spacing and component customization, including CSS variables. | A chosen direction can map its tokens to a shared React theme later. These mockups deliberately use inline CSS to demonstrate the appearance without adding dependencies. |
| [MUI: overview FAQ](https://mui.com/material-ui/) | The current FAQ says Material UI adopts Material Design 2. | Material 3 Expressive inspiration must not be confused with installing MUI. MUI would require an intentional theme and component design; it is still an open library choice in Research Scout. |
| [MUI: icons](https://mui.com/material-ui/material-icons/) | Its package exposes Material Icons and distinguishes them from successor Material Symbols. | The mockups use an original, consistent inline SVG outline set. No icon font, package or third-party image needs to load. |
| [MUI: Drawer](https://mui.com/material-ui/react-drawer/) and [Next.js integration](https://mui.com/material-ui/integrations/nextjs/) | Drawers can be permanent or temporary; App Router integration addresses streamed styles. | A future production implementation must choose the actual interaction semantics and integrate its theme with the existing App Router correctly. HTML appearance alone does not settle those implementation details. |

No third-party product screenshots, fonts or illustrations are embedded in these prototypes. Their compositions are original interpretations of these principles, rather than copies of a product screen. There is no commercial-template purchase recommendation.

## The three prototypes

| | [01 · Cobalt Studio](prototype-01.html) | [02 · Fieldnotes](prototype-02.html) | [03 · Midnight Observatory](prototype-03.html) |
| --- | --- | --- | --- |
| Character | Expressive, confident, approachable | Thoughtful, editorial, research focused | Precise, focused, technical |
| Composition | Left navigation; blue composer; source cards; right shortlist | Horizontal navigation; typographic masthead; numbered reading list; research-desk rail | Compact navigation rail; query console; state counters; discovery feed and activity rail |
| Main visual idea | Spend blue on the current question and important actions | Treat reading and human notes as the main activity | Clearly distinguish canvas, raised reading surfaces and live operations |
| Palette | Cool near-white and deep cobalt | Warm paper, ink and clear blue actions | Deep navy, pale blue actions and restrained green/amber status |
| Type | System sans-serif, strong title hierarchy | System serif titles with sans-serif metadata/controls | System sans-serif with restrained tabular/monospace numbering |
| Shape | Rounded composer and grouped cards | Mostly square corners and fine rules | Compact rounded panels and state markers |
| Strongest use | A broadly approachable main product direction | Sustained reading and considered source selection | An optional focused/dark working preference |
| Risk to validate | Too many cards or blue containers could crowd the workspace | Editorial styling could be mistaken for an already reviewed publication | Dark preference is not universal; status should not overwhelm source reading |

The previous blue palette remains the baseline. Warm neutrals and the dark palette are deliberate alternatives for review, not silently adopted product decisions. Cobalt's primary action uses the stronger `#1565C0` blue for contrast margin; the composer has its own blue surface. Fieldnotes uses `#155BB5`. Midnight pairs pale `#92BBFF` actions with dark `#10234B` labels. The supporting research records candidate contrast pairs; the root review checks actual computed foreground/background combinations separately.

## What stays constant across the concepts

All three show the **current Increment 1 journey**: one question → one selected discovery provider → progressively available records → source inspection → human shortlist and reason → export. OpenAlex is explicitly the sole discovery provider in the sample run. The examples do not activate Semantic Scholar, combine provider lists or imply that registry services are discovery branches.

The same three fictional records are used in every variant. A visible notice identifies them as synthetic. Invented authors, venues and identifiers are labeled as demo content. No citation count, confidence score, scientific quality grade or invented completion percentage appears. A source without an abstract remains metadata only. Reading an abstract is not represented as reading full text.

The default Cobalt/Fieldnotes state is review ready. Midnight starts with two usable records while semantic matching remains pending. **Run demo search** and **Replay progressive demo** reset the visible set to one record, then add two more over about 3.2 seconds. This timing is an authored demonstration, not a latency measurement. Titles, inspection and shortlist decisions remain usable throughout. Existing row nodes retain their identity as later rows arrive; the demo does not automatically apply a new rank or move focus into incoming data.

The inspector is an explicitly opened native modal dialog in all three. It presents the discovery observation, available content and the human reason separately. Inclusion is explicit, with a three-source limit. The demo DOI action is labeled **Simulate DOI check**, requires inclusion and displays a separate simulated registry observation. It does not call Crossref/DataCite, silently replace bibliographic fields or suggest scientific validation. The demonstration covers one fictional Crossref route; it is not an exhaustive prototype of real agency routing or every registry failure.

The year control and editable question make the composer visually assessable, but the demo always returns the same fictional set: neither changes real retrieval or applies a real predicate. The scope disclosure states this limitation. Navigation filters the displayed set between all sources and the current demo shortlist. Reasons and selections exist in memory for this page session only; they do not survive reload. Export downloads a clearly labeled synthetic Markdown sample. No local API, provider, model, analytics, CDN or font endpoint is contacted.

## Color, contrast, icons and components

The first rule is to make the work readable, then add personality. The working type floor is **14px for source excerpts**, **12px for bibliography/metadata and primary actions**, and **11px for secondary source badges and branch status**. Decorative eyebrows remain smaller. System fonts keep every prototype self-contained; font rendering can differ by operating system.

Blue means action/selection, green means a completed operation or human selection, and amber indicates attention/content limitations. Each status also has a written label. A green check does not mean an article is scientifically valid. Bookmark means human inclusion; document means available content; layers means provider/scope or an explicit metadata operation; download means export. Icons that repeat an adjacent text label are hidden from assistive technology. Icon-only controls have action-specific accessible names and a 44px hit area.

The mockup-to-production component map is intentionally small:

| Product element | Candidate production component |
| --- | --- |
| Workspace navigation | Drawer/List or authored semantic navigation; use a deliberate temporary pattern on narrow screens if required |
| Question and scope | Labeled TextField, Select, Button; Collapse/Popover for advanced scope |
| Source reading | Custom List/Paper/Card composition with real headings and stable provider identity |
| Branch state | Labeled Progress/Status; never a made-up percentage |
| Provenance/completeness | Chip plus readable supporting text; Accordion/Disclosure for execution details |
| Source inspection | Dialog or Sheet/Drawer, matching actual modal behavior |
| Shortlist decision/reason | Labeled Button/Toggle and multiline TextField |
| Save feedback | Inline acknowledgement; Snackbar as additional feedback, not the only record |
| Help | Text label first; Tooltip only for supplementary explanation |

These names map to MUI if selected, but equivalent authored components are viable. The current Next.js/React/TypeScript stack does not need to be replaced for any concept. The next implementation step would define a token and component contract, then adapt the existing workspace incrementally while retaining its backend/API/SSE behavior. No framework/library version upgrade is proposed by this research.

## Review and adoption

Choose a direction by performing the same short task in all three: identify the active provider, inspect the metadata-only source, include it with a reason while another branch is running, distinguish a simulated registry record from scientific validation, then find the shortlist and export. Compare perceived appeal alongside reading comfort, action clarity and misunderstanding. The root gallery and QA artifacts support side-by-side desktop/mobile review.

Prototype checks should include keyboard operation, visible focus, Escape dismissal/restoration, current pressed states, updated status announcements, no horizontal page scrolling at 320/390px, readable contrast and reduced motion. The [W3C normal-text minimum is 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); the [AA target-size minimum is 24px with exceptions](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The 44px controls are our practical design goal, not a misstatement of that AA minimum. These local checks do not replace a full accessibility audit, screen-reader testing, user research or production validation.

**Suggested starting direction:** Cobalt Studio for the first design iteration, because it evolves the selected blue identity while preserving a recognizable research workspace. Borrow Fieldnotes' typographic reading hierarchy and Midnight's explicit branch-state clarity if the user prefers them. This is the researcher's recommendation for review; none of these concepts has been adopted or applied to the production frontend.
