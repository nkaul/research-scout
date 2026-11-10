# 04 · Lumen reading desk

**October 28, 2026 · proposed visual direction · standalone HTML**

[Open Lumen](prototype-04.html). The composition is an original design study informed by Radix Themes and shadcn/ui. It does not install either framework, copy a product screen or change the production frontend.

## Why this is a different direction

The first round put most of its character into colored composers, cards and navigation. Lumen moves the emphasis to the work itself: **a compact question tool, a numbered source index and a continuously visible reading pane**. The source index is functional navigation, not another permanent application sidebar. The article sits directly beside its selected source, so inspecting a record does not open a modal or hide the context of the search.

Polish comes from type proportions, alignment and quiet, deliberate surfaces. White is the reading surface; a mauve neutral distinguishes the surrounding workspace; violet is reserved for the selected source, the active information view and the main action. A narrow violet spine, stronger source number and pale fill identify the current record together. Fine rules establish groups without enclosing every text fragment in another card.

The article title uses Georgia as a restrained change in reading voice. Controls and metadata use the operating system’s sans-serif font. The visible important metadata is at least 12 px; the abstract and note are 14–15 px, while source titles are 15–16 px. The desktop article title is 32 px rather than a large marketing headline. No downloaded fonts, background pictures, glass effects or external icons are required.

These are design judgments, not user-tested findings or verified predictions of 2027 preferences. This study is deliberately quieter than an expressive Material direction.

## Primary references checked

| Source | Verified observation | Lumen’s design inference |
| --- | --- | --- |
| [Radix Themes: color](https://www.radix-ui.com/themes/docs/theme/color) | Its system distinguishes background, interactive fill, border, solid and text roles; accent colors pair with neutral families, including mauve. | Separate the canvas, reading surface, selected fill, control outline and strong/muted text. Spend accent color where a decision or current location needs emphasis. The custom hexadecimal colors are original study tokens, not a claim to use an exact Radix theme. |
| [Radix Themes: typography](https://www.radix-ui.com/themes/docs/theme/typography) | The documented scale coordinates font size, line height and letter spacing; the default uses system fonts. | Use a coherent 12/14/16 px interface scale, a larger reading title and comfortable abstract line spacing. Typography should distinguish reading from controls before decoration does. |
| [shadcn/ui: Resizable](https://ui.shadcn.com/docs/components/base/resizable) | The component supports accessible panel composition and keyboard resizing. | A source-index/reader split is a useful production building block. This HTML uses a responsive CSS grid; it deliberately does not show a pretend resize handle or claim resizing is implemented. |
| [shadcn/ui: Textarea](https://ui.shadcn.com/docs/components/base/textarea) | The examples pair textareas with explicit labels, descriptions and buttons. | Keep the actual question visible in a labeled, wrapping field. Make the reason for including a source an editable human note rather than another generated answer. |
| [shadcn/ui: Tabs](https://ui.shadcn.com/docs/components/base/tabs) | The documentation provides grouped views of related information and variants of tab presentation. | Separate reading content from detailed source provenance without removing the selected source’s title. The prototype uses native buttons with `aria-pressed` view states rather than claiming a full ARIA tabs implementation. |
| [Raycast: Settings](https://manual.raycast.com/settings) | The first-party manual describes a streamlined settings interface and adjustable interface sizing for readability. | Keep chrome compact while preserving readable content. Do not treat tiny metadata or a dense control cluster as a requirement for a professional-looking application. |

The referenced frameworks and product are inspiration, not endorsements or a settled library choice. The sources are current pages checked on the date above; no future design award ranking is assumed.

## Components and behavior to evaluate

- **Horizontal question tool:** provider and retrieval scope sit directly under the wrapping question, rather than in a separate settings panel. The visible scope is OpenAlex only, lexical plus semantic, articles from 2020–2026.
- **Selectable source index:** human-readable titles, stable numbered records, retrieval branch and content availability. A shortlist filter is a quiet segmented view, not another navigation destination.
- **Persistent reader:** title, authors, venue, available abstract and an explicit full-text limitation. Selecting a metadata-only record displays its content gap; it does not fabricate an abstract.
- **Human decision block:** the note is editable independently of inclusion; toggling the shortlist does not discard it. The primary inclusion action includes text as well as an icon.
- **Progressive arrival:** Explore or Replay discovery reveals one record, then a second, then a third. The current reading pane and human note stay in place. These timers are authored demonstrations, not measured provider latency.
- **Responsive single column:** below 780 px the source index precedes the reader. Selecting a source scrolls to and focuses the reader, respecting reduced-motion preferences. The question wraps without clipping.
- **Explicit offline export:** Export shortlist downloads a Markdown file that labels the records and metadata as fictional. No provider request, registry request, model call or remote persistence happens.

## Review limits

The design uses original fictional titles, authors, venues and identifiers. An initial fictional source is shortlisted to illustrate a reading state; it is not an agent recommendation. All selections and notes exist only for the current page session. No quality score, invented scientific confidence or cross-provider blended result is shown.

Local author checks covered 1440, 390 and 320 px viewports with no horizontal page overflow, no JavaScript errors and no HTTP requests. Two interaction journeys also verified source inspection, human-note retention, shortlist filtering, metadata-only disclosure, focus staying in the note during progressive arrival, a labeled fictional export, mobile reader focus and a long wrapping question. Calculated key token pairs include muted text on canvas (4.86:1), violet on white (6.74:1), green on the source surface (6.45:1) and control outlines on white (3.75:1). These are selected token checks, not complete rendered-state conformance results. Root’s separate visual and interaction review is the authoritative combined review record. This is not a WCAG audit, usability study, production acceptance result or adopted implementation plan.
