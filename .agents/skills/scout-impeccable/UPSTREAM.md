# Impeccable provenance

This scoped adapter draws on Paul Bakaus's [Impeccable](https://github.com/pbakaus/impeccable), pinned at commit `2b86d9c07b97d4bed7de23583e1bd1e58dd2baae`. The generated Codex skill at that commit declares version 4.9.1. Retrieved November 15, 2026.

The official Codex skill-installer helper staged `.agents/skills/impeccable` into a temporary directory using its Git sparse method. Its direct-download method encountered the local Python certificate trust-chain error; certificate verification was not disabled. No global skill was installed and no upstream launcher, hook, engine or live-edit command was run. LICENSE and NOTICE.md were retrieved from the same immutable commit.

Only the reviewed Operate, polish, layout, typeset, clarify, audit and critique Markdown references are retained here. The upstream skill entry is retained as a reference document, not as a second discoverable SKILL.md. Imported Markdown copies carry a modification notice and have relative links expanded to their original pinned GitHub locations. Other content is preserved. [UPSTREAM.json](UPSTREAM.json) records original and bundled SHA-256 values and source paths.

The wrapper, engine-boundary explanation and UI metadata are locally authored adaptations. They preserve current user preferences and Research Scout's approved workflow rather than activating every upstream aesthetic or automation rule. This bundle deliberately omits runtime scripts, binaries, hooks, catalogs, native-platform references and automatic updates. The full upstream workflow is therefore not installed.

The upstream references are Apache-2.0 licensed; retain [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), attribution and modification notices when redistributing this bundle. The copied upstream notice mentions MIT-licensed platform references; those platform files are not imported. Preserve that notice as upstream provenance without implying those files are installed.

For an update, resolve an explicit upstream commit, stage it outside active skill discovery, review the selected references and their license/notices, then regenerate the original/bundled hashes. Re-evaluate command and side-effect boundaries before adopting changes. Update this adapter and its portable `skills/scout-impeccable` mirror together. Do not track moving `main` links as version pins or overwrite user/project design decisions during an update.
