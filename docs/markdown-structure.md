# Markdown Structure Guide

Use this guide when adding or changing repository Markdown. It keeps product docs, agent instructions, and operational notes easy to scan and safe to validate automatically.

## Goals

- Keep every Markdown file focused on one topic.
- Make documentation discoverable from `README.md` or `docs/README.md`.
- Preserve a predictable heading hierarchy for readers and generated outlines.
- Catch broken local links before documentation drift reaches a pull request.

## Required Structure

Every Markdown file should follow this baseline:

1. Start with exactly one H1 heading.
2. Use H2 headings for major sections.
3. Avoid jumping heading levels, such as H2 directly to H4.
4. Keep fenced code blocks balanced.
5. Keep local Markdown links relative and valid.
6. Keep files under the 1000-line documentation limit from `AGENT.md`.
7. Do not create a new Markdown file when an existing Markdown owner can reasonably be reused.

## Documentation Ownership

| Location         | Owner content                                                                   |
| ---------------- | ------------------------------------------------------------------------------- |
| `README.md`      | Project overview, setup commands, useful commands, and top-level doc map.       |
| `docs/README.md` | Documentation index, root document index, and maintenance rules.                |
| `docs/*.md`      | Focused guides for architecture, deployment, security, UI, and feature scope.   |
| Root guides      | Agent instructions, product rules, Codex configuration, and UI skill checklist. |

Before adding a new document, first check the ownership table and existing docs index. If the requested content fits an existing owner, extend that file instead of creating another `.md` file. Only add a new Markdown file when the content has a distinct long-term owner, would make the existing file too broad, or would push the existing file over the 1000-line documentation limit.

When a new document is genuinely required, link it from the nearest index instead of duplicating its content elsewhere.

Canonical source-of-truth rules:

- UI token values and reusable component rules live in `docs/design-rules.md`; `DISCORD_UI_SKILL.md`, `AGENT.md`, `.codex/instructions.md`, and `codex.md` may summarize them but must link back instead of defining competing values.
- Product scope and feature completion status live in `docs/feature-spec.md`; `README.md` and planning docs should link to that checklist instead of copying backlog status.
- Delivery order lives in `docs/implementation-plan.md`; roadmap slices live in `docs/feature-roadmap.md`; UI refactor phase status lives in `docs/ui-redesign-plan.md`.

## Automated Check

Run the Markdown structure check before committing documentation-heavy changes:

```bash
npm run docs:check
```

The check validates repository `.md` files, including staged and untracked docs, for:

- a single starting H1;
- ordered heading levels;
- balanced fenced code blocks;
- valid relative links;
- the repository documentation line limit.

Use `MAX_MARKDOWN_LINES=1200 npm run docs:check` only when auditing a legacy file before splitting it; do not use that override to accept new oversized documentation.

## Review Checklist

- [ ] The file has one clear owner topic.
- [ ] The first non-empty line is the H1 title.
- [ ] Headings can be read as a coherent outline.
- [ ] Tables render with the intended number of columns.
- [ ] Commands are fenced and copyable.
- [ ] Local links resolve from the file location.
- [ ] Setup details are not duplicated outside `README.md` or `docs/deployment.md`.
- [ ] New feature, checklist, and planning notes were added to an existing owner doc when possible instead of creating a new `.md` file.
