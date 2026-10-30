# dsh_reader

A DeepSeek Harness (DSH) plugin that adds a **Book** viewer to the built-in document preview.

Opening a markdown file still works exactly as before — the preview opens with **Markdown** (or
**Code**, **Plain Text**, a PDF renderer…) — and now the viewer menu also offers **Book**:

```
open 第026章.md  →  right Sidebar preview (chat stays visible)
                  →  viewer menu: Markdown · Code · Plain Text · 电子书/Book
                  →  pick Book: the whole folder becomes one scrollable book
                  →  scroll past the chapter end → 第027章 flows in
                  →  select a sentence, annotate it
                  →  →  copies "请按 …/06_批注/第026章.md 中的批注修改 …/04_正文/第026章.md。"
```

Nothing about opening or default viewer selection changes: the Book entry is an **alternative**
renderer in the existing dropdown, not a replacement.

## Features

- **A Book option in the existing viewer menu.** It registers through the document-preview
  registry (`ctx.documentPreviews`), so it sits beside Markdown / Code / Plain Text for `*.md` and
  `*.markdown`. The built-in Markdown remains the default renderer.
- **Chat stays visible.** The Book viewer renders inside the right Sidebar; the conversation keeps
  its column, and the Sidebar's own presentation switch provides full-screen reading.
- **Continuous reading.** Chapters are discovered from the open file's folder (or a configured
  library), ordered by frontmatter `order` and then naturally (`第001章` < `第002章` <
  `第010章`), and appended as you scroll.
- **A bookshelf / directory.** The left Sidebar's **阅读** entry opens a page listing every
  configured library and its chapters; clicking a chapter reads it in place. Inside the reader a
  **目录** drawer lists the whole book.
- **Inline annotations.** Select text → right-click → **批注** (or use the floating button that
  appears on selection) → write the note → save. Right-click an existing highlight to edit or
  delete it. Existing annotations are highlighted in the text; the drawer lists them and jumps back
  to the passage. No type and no conclusion to pick — the note is the whole annotation.
  Annotations need a configured library: a folder opened as an ad-hoc book is read-only.
- **Annotations are plain project files.** Each chapter's annotations are written to
  `<annotationDir>/<chapter>.md` (human- and agent-readable) with a machine-readable
  `.dsh_reader.json` beside them. No database, no lock-in, git-friendly.
- **Send to chat.** One click copies a prompt naming the annotation file and the chapter, using
  project-relative paths for `pathBase`.
- **Generic.** Any folder of `.md` files is a book; the generated markdown export language is
  configurable (`zh` by default because DSH's UI language is).
- **Theme-native, dependency-free.** Plain browser JavaScript, no bundler, no npm dependencies; the
  UI uses DSH's theme tokens and follows light/dark.

## Install

The plugin is a plain DSH bundle. Pick one:

**From the UI** (recommended, no restart):

1. Open **Plugins** in the DSH sidebar.
2. **Add plugin** → paste the **absolute path** of this directory (or
   `github:<user>/dsh_reader` once published).
3. **Enable now**, then reload the page.

**From the CLI:**

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh_reader
dsh --profile desktop            # restart the profile if the bundle is not picked up live
```

## Configure books

A book is a directory of markdown files. Add to your profile's `cordis.patch.yml` (usually
`~/.dsh/profiles/desktop/cordis.patch.yml`):

```yaml
- id: dsh_reader
  name: dsh_reader
  config:
    libraries:
      - id: zhaoyun
        title: 赵云传
        root: '/Users/you/Novel/赵云传/04_正文'
        annotationDir: '/Users/you/Novel/赵云传/06_批注'
      - id: docs
        title: Handbook
        root: '/Users/you/handbook/docs'
        recursive: true
        exclude: ['^drafts/']
        order: auto
    annotation:
      locale: zh            # zh | en — headings of generated markdown
    pathBase: '/Users/you/Novel'   # workspace root; makes prompt paths relative
    promptTemplate: 'Revise {chapterFile} according to the annotations in {annotationFile}.'
```

| Key | Meaning |
| --- | --- |
| `libraries[].root` | directory to read; required |
| `libraries[].title` | display name; defaults to the folder name |
| `libraries[].annotationDir` | where annotations go; absolute or relative to `root`; default `<root>/annotations` |
| `libraries[].recursive` | include subfolders; default `false` |
| `libraries[].include` / `exclude` | RegExp sources matched against the relative path |
| `libraries[].order` | `auto` (frontmatter `order`, then natural name), `filename`, or `mtime` |
| `annotation.locale` | `zh` (default) or `en` for generated markdown |
| `pathBase` | workspace root: resolves workspace-relative addresses, shortens prompt paths |
| `promptTemplate` | copied by **Send to chat**; `{annotationFile}`, `{chapterFile}` |
| `maxChapterBytes` | refuse larger chapter files; default 2 MiB |

A folder that is not configured as a library still works when its file is opened with **Book**:
the viewer treats the folder as an ad-hoc, read-only book (continuous reading, no annotations).
The bookshelf page only lists configured libraries.

## Annotation files

`<annotationDir>/<chapter>.md` is regenerated after every edit:

```md
# 第001章 军报 — 批注

> 源文件：`第001章.md`
> 机器可读数据：`.dsh_reader.json`

共 1 条，未结案 1 条。

| 编号 | 位置 | 内容 | 状态 |
| --- | --- | --- | --- |
| A1 | 第 12 段 | 这一句太轻。 | 未结案 |

## 明细

### A1｜第 12 段

> 原文：「血泼了他一脸」

这一句太轻。
```

`.dsh_reader.json` in the same directory is the source of truth the panel reads back.

## How it fits together

```
┌───────────── browser ─────────────┐       ┌────────── host ──────────┐
│ built-in document preview         │ HTTP  │ /api/dsh_reader          │
│   viewer menu + Book renderer     │ ────► │ config · books · resolve │
│   bookshelf page (left Sidebar)   │       │ chapter · annotations    │
└───────────────────────────────────┘       └──────────────────────────┘
```

The host half reads the configured folders, resolves a markdown path to a continuous book, answers
`/api/dsh_reader/*` on the loopback interface, and owns the annotation store. The browser half is a
document viewer plus one bookshelf page. See [`docs/API.md`](docs/API.md) for the route contract.

## Limitations (v0.1)

- One paragraph is the annotation anchor unit: a selection spanning paragraphs is recorded but may
  not be highlighted; annotations whose quoted text disappears are kept but stop matching.
- Markdown support is prose-oriented: headings, paragraphs, scene breaks, quotes, lists, fenced
  code, emphasis, code spans, links. Images and tables render as text.
- No full-text search, no editing of chapter files from the reader, no live reload when a chapter
  changes on disk (reload the preview or switch chapters).
- If the reader cannot render, an error boundary shows the message instead of blanking the tab.

## Roadmap

- Host tool so the agent can list/resolve annotations without a paste round-trip.
- Images/tables, in-book search, per-book reading width, split panes.
- Optional "open markdown as Book by default" (raise the viewer's priority band).

## Development

```sh
node --test test/*.test.js     # host routes + client helpers, no browser needed
```

- `index.js` — host plugin: config, chapter discovery, annotation store, HTTP routes.
- `client.js` — browser plugin: the Book document viewer, bookshelf page, markdown renderer.
- `locale/` — plugin-manager display metadata.
- `docs/API.md` — host/browser contract.
- `examples/` — profile configurations.

## License

MIT
