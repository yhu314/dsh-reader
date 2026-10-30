# dsh_reader host API

The browser half (a right-Sidebar tab type) talks to the host half over one prefix:
`/api/dsh_reader/*`. Loopback-only, same origin as the Web GUI. Every response is JSON with
`cache-control: no-store`. Errors: `{ "error": "<message>" }` with 400 / 403 / 404 / 500.

## Configuration (`cordis.patch.yml` row `dsh_reader`)

```yaml
libraries:
  - id: zhaoyun                  # optional, defaults to lib1, lib2, ...
    title: 赵云传                # optional, defaults to the root basename
    root: /abs/path/04_正文       # required
    annotationDir: /abs/path/06_批注   # optional, absolute or relative to root; default <root>/annotations
    recursive: false             # optional
    include: ['\\.md$']          # optional RegExp sources, matched against the rel path
    exclude: ['^草稿/']          # optional
    order: auto                  # auto | filename | mtime
annotation:
  types: [note, question, fix, idea]           # neutral defaults
  conclusions: [accept, reject, defer]         # neutral defaults
  locale: zh                     # zh | en, headings of the generated markdown
claimMarkdown: all               # all | libraries | off
pathBase: /abs/path/project      # workspace root: resolves workspace-relative addresses,
                                 # and shortens paths in prompts
promptTemplate: "Revise {chapterFile} according to {annotationFile}."
maxChapterBytes: 2097152
```

`claimMarkdown` decides which `.md` resources the reader claims in the Sidebar:
`all` opens every markdown file in the reader (the default; files outside a library open
read-only), `libraries` claims only files inside a configured `root`, `off` claims none.

`order: auto` sorts by frontmatter `order` first (numeric, ascending), then naturally by file
name (`Intl.Collator` numeric, so `第001章` < `第002章` < `第010章`). `filename` ignores frontmatter;
`mtime` sorts by modification time.

Chapter `title`: frontmatter `title` > first `# ` heading > file stem.

## `GET /api/dsh_reader/health`

```json
{ "ok": true, "version": "0.1.0", "libraries": 1 }
```

## `GET /api/dsh_reader/config`

The browser needs this before it can decide which addresses to claim and how to build prompts.

```json
{
  "version": "0.1.0",
  "claimMarkdown": "all",
  "pathBase": "/abs/path/project",
  "annotation": { "types": ["note"], "conclusions": ["accept"], "locale": "zh" },
  "promptTemplate": "...",
  "libraries": [
    { "id": "zhaoyun", "title": "赵云传", "root": "/abs/path/04_正文", "annotationDir": "/abs/path/06_批注" }
  ],
  "errors": []
}
```

## `GET /api/dsh_reader/books`

```json
{
  "libraries": [
    {
      "id": "zhaoyun",
      "title": "赵云传",
      "root": "/abs/path/04_正文",
      "annotationDir": "/abs/path/06_批注",
      "chapters": [
        {
          "id": "第001章.md",
          "title": "第001章 军报",
          "order": 1,
          "size": 6791,
          "mtime": 1793000000000,
          "annotationFile": "第001章.md",
          "annotationPath": "赵云传/06_批注/第001章.md",
          "chapterPath": "赵云传/04_正文/第001章.md"
        }
      ]
    }
  ],
  "annotation": { "types": ["note"], "conclusions": ["accept"], "locale": "zh" },
  "promptTemplate": "...",
  "errors": []
}
```

Hidden files, the annotation directory, and non-markdown files are skipped. `order` is the
frontmatter order or `null`.

## `GET /api/dsh_reader/resolve?path=<path>`

Opens one markdown file as part of a continuous book. `path` is the decoded path carried by the
`dsh-resource://file/session/<sessionId>/<path>` address: absolute, or relative to `pathBase`.
Library mode wins when the file is inside a configured `root`; otherwise the file's directory
becomes an ad-hoc, read-only book.

```json
{
  "mode": "library",
  "path": "/abs/path/04_正文/第026章.md",
  "bookRoot": "/abs/path/04_正文",
  "libraryId": "zhaoyun",
  "annotationEnabled": true,
  "chapters": [
    { "id": "第026章.md", "title": "第二十六章 军报", "chapterPath": "赵云传/04_正文/第026章.md",
      "annotationPath": "赵云传/06_批注/第026章.md", "annotationFile": "第026章.md" }
  ],
  "index": 25
}
```

Ad-hoc mode: `mode: "adhoc"`, `libraryId: null`, `annotationEnabled: false`, chapters are the
markdown files of `bookRoot` (its parent directory) with `id` = file name and absolute
`chapterPath`s. `index` is the position of `path`. 404 when the path is missing, hidden, or not
a markdown file.

## `GET /api/dsh_reader/chapter`

Two forms:

| Query | Mode | Response |
| --- | --- | --- |
| `?lib=<id>&file=<chapter id>` | library | `{ id, title, text }` |
| `?path=<absolute .md path>` | ad-hoc | `{ id, title, text }` |

Oversized chapters fail with 400 instead of truncating (`maxChapterBytes`).

## `GET /api/dsh_reader/annotations?lib=<id>&file=<chapter id>`

```json
{
  "comments": [
    {
      "id": "A1",
      "type": "style",
      "conclusion": "accept",
      "quote": "血泼了他一脸",
      "block": 12,
      "note": "This sentence is too light.",
      "resolved": false,
      "createdAt": 1793000000000,
      "updatedAt": 1793000000000
    }
  ],
  "annotationFile": "第001章.md",
  "annotationPath": "/abs/path/06_批注/第001章.md"
}
```

`block` is a **1-based paragraph number** (the markdown export prints it verbatim); the browser
converts its 0-based DOM block index when saving. Comments may have `block: null` (whole file).

## `POST /api/dsh_reader/annotations`

Body: `{ "lib": "zhaoyun", "file": "第001章.md", "op": "save", "comment": { ... } }`

| op | extra fields | effect |
| --- | --- | --- |
| `save` | `comment` (omit `id` to create) | create or replace one comment |
| `delete` | `id` | remove one comment |
| `resolve` | `id`, `resolved` (boolean) | set the resolved flag |

The response is the same shape as `GET /annotations` after the write. Annotations are only
available in library mode; ad-hoc books are read-only.

## Storage

- `<annotationDir>/.dsh_reader.json` — machine-readable source of truth:
  `{ "version": 1, "chapters": { "<chapter id>": { "source": "<abs path>", "updatedAt": <ms>, "comments": [...] } } }`
- `<annotationDir>/<chapter stem>.md` — regenerated markdown export for humans and the agent:

```md
# 第001章 军报 — 批注

> 源文件：`第001章.md`
> 机器可读数据：`.dsh_reader.json`

| 编号 | 位置 | 类型 | 内容 | 结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | 第 12 段 | 文风 | 这一句太轻。 | 采纳 | 未结案 |

## 明细

### A1｜第 12 段｜文风｜采纳

> 原文：「血泼了他一脸」

这一句太轻。
```

Writes are atomic (`*.tmp` + rename). A corrupt store is reported as 500 instead of being silently
reset. Request bodies are capped at 1 MiB.

## Security

- Loopback host only; `GET`/`HEAD`/`POST`.
- Library reads and annotation writes are confined to their `root` / `annotationDir` (path
  traversal, absolute ids, hidden segments, symlink escapes rejected).
- Ad-hoc reads accept one absolute `.md`/`.markdown` regular file, nothing else.
