---
name: scout-ui-ux-pro-max
description: Use pinned UI UX Pro Max catalogs to compare visual directions, choose UI tokens and review dense research or productivity workspaces. Supports local style, palette, typography, UX, React and Next.js guidance while preserving the existing application stack and behavior.
---

# Scout UI UX Pro Max

Use searchable design guidance to make a specific interface decision. This is a scoped adaptation of UI UX Pro Max, not its complete CLI installation. Imported resources retain their MIT license; exact paths, hashes and immutable upstream revision are in [UPSTREAM.json](UPSTREAM.json).

## Start with the product

Read the project's instructions and inspect the current interface, dependencies and token system. In Research Scout, preserve the current Next.js/React/CSS Modules stack and consult the installed Next.js documentation before implementation. Catalog framework/version advice is a dated reference, not authority over the installed project.

For Research Scout, [workspace constraints](references/research-scout.md) records the specific functionality and comparison rules to preserve. Use [quick reference](references/quick-reference.md) for the relevant accessibility, text-layout or interaction outcome; its native guidance must not be substituted for web-specific requirements.

## Search only what the decision needs

Supported domains: `style`, `product`, `color`, `typography`, `ux`, `react`. Supported stacks: `react`, `nextjs`. The local generator also includes complete linked product, style, palette, typography, landing-pattern and reasoning tables. Other domains/stacks advertised by the upstream parser are not bundled.

Invoke `scripts/search.py` by its full path in this skill folder, using the project's existing Python environment. No third-party Python dependency or installer is needed. In Research Scout, run from the repository root:

```bash
.tools/uv/bin/uv run --project backend --locked --offline --extra encoder python .agents/skills/scout-ui-ux-pro-max/scripts/search.py "chip label wrapping" --domain ux --json
.tools/uv/bin/uv run --project backend --locked --offline --extra encoder python .agents/skills/scout-ui-ux-pro-max/scripts/search.py "client component interaction" --stack nextjs --json
```

- Use one explicit domain for a targeted concern; build the query from a dominant intent and a few useful terms.
- For a coherent new visual direction, use `--design-system --json`, then run a separate stack search. The generator ignores `--stack` when generating a design system.
- `--density` and `--variance` are available for design-system recommendations. Motion presets are omitted; do not request `--motion` or infer a GSAP dependency.
- Inspect returned identities, applicability, style status and product fit. Retry once with narrower terms or the appropriate explicit domain when results are empty/off-topic. Report a failed match honestly.
- Treat catalog rows as recommendations. A landing-page pattern does not imply that an existing workspace needs a hero, marketing sections, new charts or a framework migration.

## Apply and verify the decision

Keep a compact receipt of the actual query, upstream revision, returned catalog identities and chosen/adapted guidance. Distinguish script output from the designer's final decision. Use `--json` output for receipts; use `--persist` only when saving a master design system is part of the requested task, with an explicit project output directory.

For comparison mockups, hold authored content, counts and interactions constant. Change the visual hierarchy, density, surfaces, typography or selected-state treatment deliberately; identify each proposed combination as an adaptation. Keep separate design families separate until the user chooses one.

For approved application changes, reuse its semantic tokens and component structure. Check long titles/identifiers, 320px reflow, text zoom, visible keyboard focus, operable chip overflow, reader scrolling, meaningful status updates and reduced motion. Preserve retrieval, notes, saving, provider identity and timing semantics. Visual trials do not authorize live research, publishing or production adoption.

## Refresh the bundle deliberately

Review an immutable upstream commit and diff the four scripts and linked tables together. Keep imported files unmodified, preserve LICENSE, update per-file hashes and record any local adaptation separately. Re-run supported domain/stack and generator smoke checks before promoting an update. The full upstream semantic validator requires omitted datasets; a successful scoped smoke check is not a claim that the complete upstream verification suite ran.
