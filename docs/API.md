# dsh_reader host API

The browser half (a **Book** viewer in the built-in document preview) talks to the host half over
one prefix: `/api/dsh_reader/*`. Loopback-only, same origin as the Web GUI. Every response is JSON with
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
  locale: zh                     # zh | en, headings of the generated markdown
pathBase: /abs/path/project      # workspace root: resolves workspace-relative addresses,
                                 # and shortens paths in prompts
promptTemplate: "Revise {chapterFile} according to {annotationFile}."
maxChapterBytes: 2097152
```

The browser half adds one entry to the **built-in document preview's viewer menu** (Markdown /
Code / Plain Text / **Book**). It never claims the open action itself, so markdown still opens with
the built-in Markdown viewer unless the person picks Book for that tab. Choosing Book asks
`/resolve` for the continuous book around the open file and renders it with the same chapter and
annotation routes described below.

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
  "pathBase": "/abs/path/project",
  "annotation": { "locale": "zh" },
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
  "annotation": { "locale": "zh" },
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
becomes an ad-hoc book (annotated into a `.dsh_reader` sidecar next to it).

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

Ad-hoc mode: `mode: "adhoc"`, `libraryId: null`, `annotationEnabled: true`, chapters are the
markdown files of `bookRoot` (its parent directory) with `id` = file name and absolute
`chapterPath`s. `index` is the position of `path`. A markdown file inside a library root that the
chapter list excludes (a draft subfolder, an annotation export, an include/exclude filter) also
falls back to ad-hoc mode, annotated into that folder's own `.dsh_reader`. 404 only when the path
is missing, hidden, or not a markdown file.

## `GET /api/dsh_reader/chapter`

Two forms:

| Query | Mode | Response |
| --- | --- | --- |
| `?lib=<id>&file=<chapter id>` | library | `{ id, title, text }` |
| `?path=<absolute .md path>` | ad-hoc | `{ id, title, text }` |

Oversized chapters fail with 400 instead of truncating (`maxChapterBytes`).

## `GET /api/dsh_reader/search`

Case-insensitive substring search over one book. `lib=<id>` scans a configured library;
`path=<absolute .md>` scans the markdown files next to that file (ad-hoc book).

| Query | Meaning |
| --- | --- |
| `q` | required, 1–200 characters |
| `lib` / `path` | one of them selects the book |
| `limit` | max chapters returned, default 50, capped at 200 |

```json
{
  "query": "赵云",
  "libraryId": "zhaoyun",
  "matches": [
    { "chapterId": "第001章.md", "title": "第一章 常山雪", "snippet": "…赵云在河滩上练枪…", "count": 2 }
  ],
  "truncated": false
}
```

One match per chapter (its first hit plus the total count). The browser loads the chapter and jumps
to the block containing the query, so no offsets need to match across implementations.

## `GET /api/dsh_reader/annotations`

Two forms:

| Query | Mode |
| --- | --- |
| `?lib=<id>&file=<chapter id>` | configured library chapter |
| `?path=<absolute .md path>` | ad-hoc book (the file's own folder) |

```json
{
  "comments": [
    {
      "id": "A1",
      "quote": "血泼了他一脸",
      "block": 12,
      "note": "This sentence is too light.",
      "resolved": false,
      "replies": [
        { "id": "R1", "author": "author", "text": "Let me try a shorter version.", "createdAt": 1793000001000 },
        { "id": "R2", "author": "ai", "text": "Done in v2.", "createdAt": 1793000002000 }
      ],
      "createdAt": 1793000000000,
      "updatedAt": 1793000002000
    }
  ],
  "annotationFile": "第001章.md",
  "annotationPath": "/abs/path/06_批注/第001章.md"
}
```

`block` is a **1-based paragraph number** (the markdown export prints it verbatim); the browser
converts its 0-based DOM block index when saving. Comments may have `block: null` (whole file).
Ad-hoc annotations are stored in `<book folder>/.dsh_reader/` instead of the library's
`annotationDir`.

## `POST /api/dsh_reader/annotations`

Body: `{ "lib": "zhaoyun", "file": "第001章.md", "op": "save", "comment": { ... } }`
— or `{ "path": "/abs/path/a.md", "op": "save", "comment": { ... } }` for an ad-hoc book.

| op | extra fields | effect |
| --- | --- | --- |
| `save` | `comment` = `{ quote, block, note, resolved }` (omit `id` to create) | create or replace one comment |
| `delete` | `id` | remove one comment |
| `resolve` | `id`, `resolved` (boolean) | set the resolved flag |
| `reply` | `id`, `text`, `author?` (`author` \| `ai`, default `author`) | append one message to the annotation's thread |

The response is the same shape as `GET /annotations` after the write. The `path` form (ad-hoc)
stores annotations in a `.dsh_reader` sidecar next to the book; the `lib` form uses the library's
`annotationDir`.

## Agent tool: `reader_annotations`

The Host registers one model-facing tool so the agent can read and settle the same annotations the
viewer writes, without a copy-paste round trip.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `action` | `list` \| `resolve` \| `reply` (required) | read annotations, mark them resolved/reopened, or post a reply |
| `library` | string | library id; optional when exactly one library is configured |
| `chapter` | string | chapter id relative to the library root (`第026章.md`); required for `resolve` |
| `onlyOpen` | boolean | `list`: return only unresolved annotations |
| `ids` | string[] | `resolve`: annotation ids (e.g. `["A1"]`) |
| `all` | boolean | `resolve`: every annotation in the chapter |
| `reopen` | boolean | `resolve`: set `resolved=false` instead of true |
| `id` / `text` / `author` | string | `reply`: annotation id, message, and who posts it (`ai` by default) |

`list` with a `chapter` returns `{ action, library, chapter, counts, annotations }`; without one it
returns one row per annotated chapter (`chapters`) plus aggregate counts. Every annotation row is
`{ id, note, quote, paragraph, resolved, replies }` (paragraph is the 1-based block number;
`replies` are `{ author, text, createdAt }`). `reply` posts an AI answer into that thread. `resolve`
regenerates the markdown export and returns the updated list plus `changed`.

The tool and the HTTP routes share one store: anything the agent resolves shows up in the viewer's
drawer, and vice versa.

## Storage

- `<annotationDir>/.dsh_reader.json` — machine-readable source of truth:
  `{ "version": 1, "chapters": { "<chapter id>": { "source": "<abs path>", "updatedAt": <ms>, "comments": [...] } } }`
- `<annotationDir>/<chapter stem>.md` — regenerated markdown export for humans and the agent:

For configured libraries, `annotationDir` is the library's `annotationDir` (default
`<root>/annotations`). For ad-hoc books, `annotationDir` is the book folder's `.dsh_reader/`
subdirectory, so a folder opened directly annotates into `<folder>/.dsh_reader/` without any config.

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

回复：
- **作者**：改成吐血试试。
- **AI**：已改。
```

Writes are atomic (`*.tmp` + rename). A corrupt store is reported as 500 instead of being silently
reset. Request bodies are capped at 1 MiB.

## Security

- Loopback host only; `GET`/`HEAD`/`POST`.
- Library reads and annotation writes are confined to their `root` / `annotationDir` (path
  traversal, absolute ids, hidden segments, symlink escapes rejected).
- Ad-hoc reads and annotation writes accept one absolute `.md`/`.markdown` regular file; annotations
  are written only to that file's own directory (`<dir>/.dsh_reader/`).
