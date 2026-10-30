# dsh_reader

A DeepSeek Harness (DSH) plugin that turns **a folder of markdown files into one continuous book**
in the right Sidebar — and makes itself the **default way to open `.md` files** — with **inline
annotations** you can hand to the agent in the chat.

Built for long-form reading — novels, drafts, documentation, notes — where the file boundary should
not be the reading boundary.

```
open 第026章.md  →  reader tab in the right Sidebar (chat stays visible)
                 →  scroll past the chapter end → 第027章 flows in
                 →  select a sentence, annotate it
                 →  →  copies "Revise …/04_正文/第026章.md according to …/06_批注/第026章.md."
                 →  paste in the chat; the agent reads the annotation file and revises the chapter
```

## Features

- **Default markdown opener.** The reader registers a right-Sidebar tab type for `*.md` /
  `*.markdown` in the extension band, which outranks the built-in preview. Any markdown file you
  open lands in the reader.
- **Chat stays visible.** The right Sidebar is a column, not a modal: the conversation pushes
  aside, and the Sidebar's own presentation switch gives you full-screen reading when you want it.
- **Reading progress remembered** per book and per folder, plus font size.
- **Continuous reading.** Chapters are discovered from the open file's folder (or a configured
  library), ordered by frontmatter `order` and then naturally (`第001章` < `第002章` <
  `第010章`), and appended as you scroll. No tab switching, no file tree hunting.
- **A bookshelf / directory.** The left Sidebar's **阅读** entry opens a page listing every
  configured library and its chapters; clicking a chapter reads it in place.
- **Inline annotations.** Select text → annotate → pick a type and a conclusion → save. Existing
  annotations are highlighted in the text; the drawer lists them and jumps back to the passage.
- **Annotations are plain project files.** Each chapter's annotations are written to
  `<annotationDir>/<chapter>.md` (human- and agent-readable) with a machine-readable
  `.dsh_reader.json` beside them. No database, no lock-in, git-friendly.
- **Send to chat.** One click copies a prompt that names the annotation file and the chapter, using
  project-relative paths for `pathBase`.
- **Generic and neutral.** Any folder of `.md` files is a book. Types and conclusions are
  configurable; the defaults are neutral (`note/question/fix/idea`, `accept/reject/defer`), and the
  default markdown export locale is `zh` because DSH's UI language is.
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

> Publishing: replace `dsh_reader` with `@<your-github-user>/dsh_reader` (or keep the name) in
> `package.json` (`name`), `cordis.patch.yml` (row `name`), and `client.js` (module id).

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
      types: [note, question, fix, idea]
      conclusions: [accept, reject, defer]
      locale: zh            # zh | en — headings of generated markdown
    claimMarkdown: all      # all | libraries | off
    sessions: []            # session ids allowed to claim markdown; [] = every session
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
| `annotation.types` / `conclusions` | annotation vocabulary offered in the form |
| `annotation.locale` | `zh` (default) or `en` for generated markdown |
| `claimMarkdown` | which `.md` files open in the reader: `all` (default), `libraries`, `off` |
| `sessions` | session ids that may claim markdown; `[]` (default) = every session |
| `pathBase` | workspace root: resolves workspace-relative addresses, shortens prompt paths |
| `promptTemplate` | copied by **Send to chat**; `{annotationFile}`, `{chapterFile}` |
| `maxChapterBytes` | refuse larger chapter files; default 2 MiB |

Files outside every library still open in the reader (`claimMarkdown: all`) but **read-only**:
the folder is treated as an ad-hoc book and no annotations are written.

Missing or invalid rows are listed in the bookshelf's empty state instead of crashing the plugin.

## Session-scoped rollout

Plugins are installed per profile, but the reader can be **limited to selected sessions** so the
rest of the app keeps its built-in markdown preview while you try it out:

```yaml
- id: dsh_reader
  config:
    sessions: ['session-b5738371-9751-46cf-a281-4c4f9dd87609']
    claimMarkdown: libraries     # start narrow, widen later
```

- The session id rides on every file address (`dsh-resource://file/session/<id>/…`), so a session
  outside the list always opens markdown in the built-in preview.
- A staged ramp works well: `claimMarkdown: off` (nothing intercepted; open the reader from the
  left Sidebar) → `libraries` (only configured books) → `all` for that session.
- The reader also refuses to claim anything until `/config` has answered, and a crash inside the
  reader is caught by an error boundary instead of blanking the Sidebar.

## Annotation files

`<annotationDir>/<chapter>.md` is regenerated after every edit:

```md
# 第001章 军报 — 批注

> 源文件：`第001章.md`
> 机器可读数据：`.dsh_reader.json`

| 编号 | 位置 | 类型 | 内容 | 结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | 第 12 段 | note | 这一句太轻。 | accept | 未结案 |

## 明细

### A1｜第 12 段｜note｜accept

> 原文：「血泼了他一脸」

这一句太轻。
```

`.dsh_reader.json` in the same directory is the source of truth the panel reads back.

## How it fits together

```
┌───────────── browser ─────────────┐       ┌────────── host ──────────┐
│ right-Sidebar tab type (*.md)     │ HTTP  │ /api/dsh_reader          │
│ reader · bookshelf · annotations  │ ────► │ config · books · resolve │
│ left-Sidebar entry → bookshelf    │       │ chapter · annotations    │
└───────────────────────────────────┘       └──────────────────────────┘
```

The host half reads the configured folders, resolves markdown addresses to a book, answers
`/api/dsh_reader/*` on the loopback interface, and owns the annotation store. The browser half
renders a right-Sidebar tab. See [`docs/API.md`](docs/API.md) for the route contract.

## Limitations (v0.1)

- One paragraph is the annotation anchor unit: a selection spanning paragraphs is recorded but may
  not be highlighted; annotations whose quoted text disappears are kept but stop matching.
- Markdown support is prose-oriented: headings, paragraphs, scene breaks, quotes, lists, fenced
  code, emphasis, code spans, links. Images and tables render as text.
- No full-text search, no editing of chapter files from the reader, no live reload when a chapter
  changes on disk (reopen the tab or switch chapters).
- Ad-hoc books (outside configured libraries) are read-only.

## Roadmap

- Host tool so the agent can list/resolve annotations without a paste round-trip.
- Images/tables, in-book search, per-book reading width, split panes.

## Development

```sh
node --test test/*.test.js     # host routes + client helpers, no browser needed
```

- `index.js` — host plugin: config, chapter discovery, annotation store, HTTP routes.
- `client.js` — browser plugin: sidebar tab types, reader UI, markdown renderer.
- `locale/` — plugin-manager display metadata.
- `docs/API.md` — host/browser contract.
- `examples/` — profile configurations.

## License

MIT
