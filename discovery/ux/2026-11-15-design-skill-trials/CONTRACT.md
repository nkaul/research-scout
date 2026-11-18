# Shared preview contract

Seven static, local-only design previews. Root owns `shared/base.css`, `shared/mockup.js`, authored content, gallery and serving/validation scripts. Family agents own their named HTML and `styles/*.css`, notes and assigned skill bundles. No application changes or API/model calls.

HTML entry point: local `shared/base.css`, then your stylesheet, `<body data-variant="Variant title" data-family="Family name" data-layout="optional"><div id="app"></div><script src="shared/mockup.js" defer></script></body>`. Include viewport metadata, unique title, description. No external fonts/scripts required. Root uses classic scripts, so local file viewing also works.

Base variables: `--bg`, `--surface`, `--surface-alt`, `--ink`, `--muted`, `--line`, `--brand`, `--brand-soft`, `--radius`, `--radius-sm`, `--shadow`, `--font-ui`, `--font-reading`, `--reader-width`, `--sidebar-width`, `--row-gap`, `--main-gap`, `--card-pad`. Set them on `body`; additional scoped layout rules encouraged. Preserve visible focus/contrast/responsiveness. All light directions; Material blue primary actions.

DOM structure/classes (root will implement exactly):

```text
.scout-shell
  .sidebar > .brand + .brand-tagline + .workspace-switch + .sidebar-nav + .recent-searches + .sidebar-bottom
  .main-shell
    .topbar > .breadcrumbs + .topbar-actions (.preview-pill, .credit-meter)
    main.workspace
      .page-heading > .heading-copy (h1, .eyebrow, .page-subtitle) + .project-actions
      form.search-panel#query-form
        .query-main > .query-field (label, textarea#question) + .search-atom + .search-submit
        .toolbar > .search-settings (.source-control, .date-control, .limits-control, .ai-control)
                   + .information-controls (button.tool[data-section], .elapsed, .search-state, .filter-control)
      .focus-strip#focus-row > .focus-heading + .focus-query + .focus-chips (.chip[data-tone])
      .information-panel#information-panel [hidden by default]
      .resource-tabs > button[role=tab][data-tab=papers|videos|data|repos] (.tab-icon, .tab-count)
      .result-grid [.has-reader when reader selected]
        .result-column
          .result-tools (.results-label, .view-options)
          .result-list > article.result-card[data-id] (.is-selected)
            .card-main > .card-heading (.card-title button, .provider-chips)
                         + .byline + .card-tags + .excerpt (.key-points)
            .card-actions > .source-action iconbuttons + .access-chip
          .progress-note / .skeleton-list when simulating search
        aside.reader
          .reader-heading (.reader-title, .reader-kind, close button)
          .reader-tabs > button[data-reader-tab=overview|metadata|notes]
          .reader-body (.readable-controls, .reader-content, .reader-authors, .fit-note)
          .reader-footer
#control-popover.control-popover [hidden by default, anchored]
#toast.toast [hidden by default]
```

The renderer supplies consistent icons, sample results for all four tabs, reader selection/notes, key points/original/expansion, mock metadata/preview actions, settings popovers, AI focus, information panels and a progressive loading replay. The initial sample has 3 papers, 2 videos, 2 datasets, 2 repositories. Every source is labeled as authored example content. Counts and source states stay the same across variants.

Current Scout topology remains the baseline. Differentiate hierarchy, type rhythm, card/row construction, reader emphasis, navigation treatment, proportions and surface depth; do not produce seven palette swaps. At <=900px the reader is explicitly opened and shown inline; keep its close control accessible. At <=700px the sidebar becomes a controlled drawer. Themes should respect base mobile guards or supply equally functional ones.
