# dsh_reader

English | [中文](README.md)

A DeepSeek Harness (DSH) plugin that adds a **Book** viewer to the built-in document preview, for
continuous markdown reading with inline annotations.

Opening a markdown file still works exactly as before — the preview opens with **Markdown** (or
**Code**, **Plain Text**, a PDF renderer…) — and now the viewer menu also offers **Book**:

```
open 第026章.md  →  right Sidebar preview (chat stays visible)
                  →  viewer menu: Markdown · Code · Plain Text · Book
                  →  pick Book: the whole folder becomes one scrollable book
                  →  scroll past the chapter end → the next chapter flows in
                  →  select a sentence, annotate it
```

No library configuration is required: any folder of markdown files is a book — open one of its files
and switch the viewer to **Book** to read and annotate.

## Features

- **A Book option in the existing viewer menu.** It registers through the document-preview
  registry (`ctx.documentPreviews`), so it sits beside Markdown / Code / Plain Text for `*.md` and
  `*.markdown`. The built-in Markdown remains the default renderer.
- **Chat stays visible.** The Book viewer renders inside the right Sidebar; the conversation keeps
  its column, and the Sidebar's own presentation switch provides full-screen reading.
- **Continuous reading.** Chapters are discovered from the open file's folder, ordered by frontmatter
  `order` and then naturally (`第001章` < `第002章` < `第010章`), and appended as you scroll.
- **Contents drawer.** A **目录** drawer inside the reader lists the whole book; click a chapter to
  jump straight to it.
- **Inline annotations.** Select text → right-click → **批注** (or use the floating button that
  appears on selection) → write the note → save. Existing annotations are highlighted in the text;
  right-click a highlight to edit or delete it. The drawer lists them and jumps back to the passage.
  No type and no conclusion to pick — the note is the whole annotation. Annotations work on any
  folder you open; no configured library is required.
- **Annotations are plain project files.** Each chapter's annotations are written to
  `<book folder>/.dsh_reader/<chapter>.md` (human- and agent-readable) with a machine-readable
  `.dsh_reader.json` beside them. No database, no lock-in, git-friendly.
- **Send to chat.** One click copies a prompt naming the annotation file and the chapter, using
  project-relative paths for `pathBase`.
- **In-book search as you type.** The toolbar's magnifier searches the whole book server-side;
  keystrokes trigger a debounced query (~220 ms) and results refresh live, showing the chapter and a
  context snippet. Enter searches at once, and `Ctrl+F` / `⌘F` opens the search field while working
  inside the reader (outside it, the browser's own find still applies). Clicking a result jumps to
  the paragraph and flashes it.
- **Images and tables.** Local images load through DSH's authenticated `/api/file` route (relative
  paths resolve next to the chapter), and tables render as real HTML tables.
- **Code blocks and syntax highlighting.** Fenced code blocks (```lang … ```) are syntax-highlighted
  with a language label and a copy button; task lists (`- [ ]` / `- [x]`) render as checkboxes.
- **Per-book reading width.** The width button cycles 620 / 760 / 920 px and stores the choice per
  book.
- **In-book links.** A markdown link to another file in the **same directory** jumps inside the book
  (`#heading` scrolls to that heading and flashes it); a link to a **different directory or another
  file** opens in a new Sidebar tab; http(s) links stay with the browser.
- **Theme-native, dependency-free.** Plain browser JavaScript, no bundler, no npm dependencies; the
  UI uses DSH's theme tokens and follows light/dark.

## Install

The plugin is a plain DSH bundle. Pick one:

**From the UI** (recommended, no restart):

1. Open **Plugins** in the DSH sidebar.
2. **Add plugin** → paste `github:yhu314/dsh-reader` (or the absolute path of a local checkout).
3. **Enable now**, then reload the page.

**From the CLI:**

```sh
# from GitHub
dsh plugin --profile desktop add github:yhu314/dsh-reader

# or from a local checkout
dsh plugin --profile desktop add /absolute/path/to/dsh_reader
```

`dsh --profile desktop` restarts the profile if the bundle is not picked up live.

## Annotation files

`<book folder>/.dsh_reader/<chapter>.md` is regenerated after every edit:

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

`.dsh_reader/.dsh_reader.json` in the same directory is the source of truth the panel reads back.

## Optional configuration

Zero configuration is the default: open any markdown and read/annotate with **Book**. Optionally, a
`libraries` block in your profile's `cordis.patch.yml` (usually
`~/.dsh/profiles/desktop/cordis.patch.yml`) customizes the annotation directory, exposes the
`reader_annotations` agent tool, and so on:

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

A folder that is not configured as a library still works when its file is opened with **Book**: the
viewer treats the folder as an ad-hoc book and writes its annotations to `.dsh_reader/` inside that
folder.

## How it fits together

```
┌───────────── browser ─────────────┐       ┌────────── host ──────────┐
│ built-in document preview         │ HTTP  │ /api/dsh_reader          │
│   viewer menu + Book renderer     │ ────► │ config · resolve        │
│                                   │       │ chapter · annotations    │
└───────────────────────────────────┘       └──────────────────────────┘
```

The host half resolves a markdown path to a continuous book, answers `/api/dsh_reader/*` on the
loopback interface, and owns the annotation store. The browser half is a document viewer. See
[`docs/API.md`](docs/API.md) for the route contract.

## Limitations

- One paragraph is the annotation anchor unit: a selection spanning paragraphs is recorded but may
  not be highlighted; annotations whose quoted text disappears are kept but stop matching.
- Markdown support is prose-oriented: headings, paragraphs, scene breaks, quotes, lists (including
  task lists), fenced code blocks (with syntax highlighting), emphasis, code spans, links, images and
  tables; no embedded HTML or footnotes.
- No editing of chapter files from the reader, and no live reload when a chapter changes on disk
  (reload the preview or switch chapters).
- If the reader cannot render, an error boundary shows the message instead of blanking the tab.

## Development

```sh
node --test test/*.test.js     # host routes + client helpers, no browser needed
```

- `index.js` — host plugin: config, chapter discovery, annotation store, HTTP routes.
- `client.js` — browser plugin: the Book document viewer and markdown renderer.
- `locale/` — plugin-manager display metadata.
- `docs/API.md` — host/browser contract.
- `examples/` — optional profile configurations.

## License

MIT
