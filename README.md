# dsh-reader

A DeepSeek Harness (DSH) Web GUI plugin that turns **a folder of markdown files into one
continuous book**, and lets you **annotate any sentence in place** and hand the annotations to
the agent in the chat.

Built for long-form reading — novels, drafts, documentation, notes — where the file boundary
should not be the reading boundary.

```
sidebar 阅读  →  full-screen reader  →  scroll to the end of 第001章, 第002章 flows in
                                      →  select a sentence, annotate it
                                      →  送往对话 copies "按 06_批注/第026章.md 修改第026章.md"
                                      →  paste in the chat, the agent reads the .md
```

## Features

- **Continuous reading.** Chapters are discovered from one folder, sorted naturally
  (`第001章` < `第002章` < `第010章`), and appended as you scroll. No tab switching, no file tree.
- **Reading progress remembered** per book, plus font size.
- **Inline annotations.** Select text → annotate → pick a type and a conclusion → save.
  Existing annotations are highlighted in the text; the drawer lists them, and clicking one jumps
  to the passage.
- **Annotations are plain project files.** Each chapter's annotations are written to
  `<annotationDir>/<chapter>.md` (human- and agent-readable) with a machine-readable
  `.dsh-reader.json` beside them. No database, no lock-in, git-friendly.
- **Send to chat.** One click copies a ready prompt that names the annotation file; DSH's native
  `@file` reference then hands it to the agent, who revises the chapter from the annotations.
- **Generic.** Any folder of `.md` files is a book. Configure as many libraries as you like, plus
  the annotation vocabulary (types, conclusions) and the prompt template.
- **Theme-native and dependency-free.** Plain browser JavaScript, no bundler, no npm dependencies;
  the UI uses DSH's theme tokens and follows light/dark automatically.

## Install

The plugin is a plain DSH bundle. Pick one:

**From the UI** (recommended, no restart):

1. Open **Plugins** in the DSH sidebar.
2. **Add plugin** → paste the **absolute path** of this directory (or a
   `github:<user>/<repo>` address once published).
3. **Enable now**, then reload the page.

**From the CLI:**

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-reader
dsh --profile desktop            # restart the profile if the bundle is not picked up live
```

Then select the bundle in **Plugins → Installed plugins** if it is off.

> Rename first if you plan to publish: replace `dsh-reader` in `package.json` (name),
> `cordis.patch.yml` (row `name`), and `client.js` (module id) with e.g.
> `@your-name/dsh-reader`.

## Configure books

A book is a directory of markdown files. Override the `dsh-reader` row in your profile's
`cordis.patch.yml` (usually `~/.dsh/profiles/desktop/cordis.patch.yml`):

```yaml
- id: dsh-reader
  name: dsh-reader
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
    annotation:
      types: [事实, 逻辑, 文风, 结构, 删减, 疑问]
      conclusions: [采纳, 驳回, 转细纲, 暂缓]
      locale: zh            # zh | en — headings of generated markdown
    pathBase: '/Users/you/Novel'   # makes prompt paths relative, e.g. 赵云传/06_批注/第026章.md
    promptTemplate: '请按 {annotationFile} 中的批注修改 {chapterFile}。'
```

| Key | Meaning |
| --- | --- |
| `libraries[].root` | directory to read; required |
| `libraries[].title` | display name; defaults to the folder name |
| `libraries[].annotationDir` | where annotations go; absolute, or relative to `root`; defaults to `<root>/annotations` |
| `libraries[].recursive` | include subfolders; default `false` |
| `libraries[].include` / `exclude` | RegExp sources matched against the relative path |
| `annotation.types` | annotation types offered in the form |
| `annotation.conclusions` | conclusions offered in the form |
| `annotation.locale` | `zh` (default) or `en` for the generated markdown |
| `pathBase` | base used to shorten paths in prompts and `@file` references |
| `promptTemplate` | text copied by **Send to chat**; `{annotationFile}`, `{chapterFile}` |
| `maxChapterBytes` | refuse larger chapter files; default 2 MiB |

Missing or invalid rows are listed in the reader's empty state instead of crashing the plugin.

## Annotation files

`<annotationDir>/<chapter>.md` is regenerated after every edit:

```md
# 第001章 军报 — 批注

> 源文件：`第001章.md`

| 编号 | 位置 | 类型 | 内容 | 结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | 第 12 段 | 文风 | 这一句太轻。 | 采纳 | 未结案 |

## 明细

### A1｜第 12 段｜文风｜采纳

> 原文：「血泼了他一脸」

这一句太轻。
```

`.dsh-reader.json` in the same directory is the source of truth that the panel reads back.

## How it fits together

```
┌──────────── browser ────────────┐        ┌────────── host ──────────┐
│ sidebar entry  →  reader panel  │  HTTP  │ /api/dsh-reader          │
│ markdown blocks, marks, form    │ ─────► │ books · chapter · annot. │
└─────────────────────────────────┘        │ annotation markdown      │
                                           └──────────────────────────┘
```

The host half reads the configured folders, answers `/api/dsh-reader/*` on the loopback
interface, and owns the annotation store. The browser half only renders. See
[`docs/API.md`](docs/API.md) for the route contract.

## Limitations (v0.1)

- One paragraph is the annotation anchor unit: a selection spanning paragraphs is recorded but may
  not be highlighted; annotations whose quoted text disappears are kept but stop matching (the
  drawer still lists them with their quote).
- Markdown support is prose-oriented: headings, paragraphs, scene breaks, quotes, lists, fenced
  code, emphasis, code spans, links. Images and tables render as text.
- No full-text search, no editing of chapter files from the reader, no live reload when a chapter
  changes on disk (reopen the reader or switch chapters).

## Roadmap

- Host tool so the agent can list/resolve annotations without a paste round-trip.
- Images/tables, in-book search, per-book reading width, split view with the chat.

## Development

```sh
node --test test/        # host route tests + client helper tests, no browser needed
```

- `index.js` — host plugin: config, chapter discovery, annotation store, HTTP routes.
- `client.js` — browser plugin: module-loader factory, reader UI, markdown renderer.
- `locale/` — plugin-manager display metadata.
- `docs/API.md` — host/browser contract.

## License

MIT
