# dsh-reader host API

The browser half talks to the host half over one prefix route:

```
/api/dsh-reader/*
```

Loopback-only, same origin as the Web GUI. Every response is `application/json; charset=utf-8`.
Errors use `{ "error": "<message>" }` with status 400 (bad request), 403 (forbidden path),
404 (unknown library/chapter), or 500 (I/O).

## Configuration (`cordis.patch.yml` row `dsh-reader`)

```yaml
libraries:
  - id: zhaoyun                  # optional, defaults to lib1, lib2, ...
    title: 赵云传                # optional, defaults to the root basename
    root: /abs/path/04_正文       # required, absolute or relative to CWD
    annotationDir: /abs/path/06_批注   # optional, absolute or relative to root
    recursive: false             # optional, default false
    include: ["\\.md$"]          # optional RegExp sources matched against the rel path
    exclude: ["^草稿/"]          # optional RegExp sources
annotation:
  types: [事实, 逻辑, 文风, 结构, 删减, 疑问]
  conclusions: [采纳, 驳回, 转细纲, 暂缓]
  locale: zh                     # zh | en, controls generated markdown headings
pathBase: /abs/path/project      # optional, makes prompt paths relative to this directory
promptTemplate: "请按 {annotationFile} 中的批注修改 {chapterFile}。"
maxChapterBytes: 2097152
```

`annotationDir` defaults to `<root>/annotations`. Unset `annotation.types` / `annotation.conclusions`
default to the six-type / four-conclusion vocabulary of the Chinese drafting workflow
(`事实 逻辑 文风 结构 删减 疑问` and `采纳 驳回 转细纲 暂缓`); override them for other projects.

## `GET /api/dsh-reader/health`

```json
{ "ok": true, "version": "0.1.0", "libraries": 1 }
```

## `GET /api/dsh-reader/books`

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
          "size": 6791,
          "mtime": 1793000000000,
          "annotationFile": "第001章.md",
          "annotationPath": "赵云传/06_批注/第001章.md"
        }
      ]
    }
  ],
  "annotation": { "types": ["事实"], "conclusions": ["采纳"], "locale": "zh" },
  "promptTemplate": "请按 {annotationFile} 中的批注修改 {chapterFile}。",
  "errors": []
}
```

Chapters are sorted naturally (numeric-aware collator) by file name. `block` values on comments
are **1-based paragraph numbers** (the markdown export prints them verbatim); the browser converts
its 0-based DOM block index when it saves. Hidden files, the
annotation directory, and non-markdown files are skipped. `title` is the first `#` heading
when present, otherwise the file stem. `annotationPath` uses `pathBase` for prompt text.

## `GET /api/dsh-reader/chapter?lib=<id>&file=<chapter id>`

```json
{ "id": "第001章.md", "title": "第001章 军报", "text": "# 第001章 军报\n\n..." }
```

Oversized files fail with 400 rather than truncating.

## `GET /api/dsh-reader/annotations?lib=<id>&file=<chapter id>`

```json
{
  "comments": [
    {
      "id": "A1",
      "type": "文风",
      "conclusion": "采纳",
      "quote": "血泼了他一脸",
      "block": 12,
      "note": "这一句太轻。",
      "resolved": false,
      "createdAt": 1793000000000,
      "updatedAt": 1793000000000
    }
  ],
  "annotationFile": "第001章.md",
  "annotationPath": "/abs/path/06_批注/第001章.md"
}
```

## `POST /api/dsh-reader/annotations`

Body:

```json
{ "lib": "zhaoyun", "file": "第001章.md", "op": "save", "comment": { "...": "..." } }
```

`op` is one of:

| op | extra fields | effect |
| --- | --- | --- |
| `save` | `comment` (without `id` to create) | create or replace one comment, returns the stored list |
| `delete` | `id` | remove one comment |
| `resolve` | `id`, `resolved` (bool) | set the resolved flag |

Response is the same shape as `GET /annotations` after the write.

## Storage

- `<annotationDir>/.dsh-reader.json` — machine-readable source of truth:
  `{ "version": 1, "chapters": { "<chapter id>": { "source": "<abs path>", "updatedAt": <ms>, "comments": [...] } } }`
- `<annotationDir>/<chapter stem>.md` — regenerated markdown export for humans and the agent:

```
# 第001章 军报 — 批注

> 源文件：`第001章.md`
> 机器可读数据：`.dsh-reader.json`

共 2 条，未结案 1 条。

| 编号 | 位置 | 类型 | 内容 | 结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | 第 12 段 | 文风 | 这一句太轻。 | 采纳 | 未结案 |

## 明细

### A1｜第 12 段｜文风｜采纳

> 原文：「血泼了他一脸」

这一句太轻。
```

Writes are atomic (tmp file + rename) so a crash cannot truncate the store. A corrupt store is
reported as HTTP 500 instead of being silently reset. Request bodies are capped at 1 MiB.
