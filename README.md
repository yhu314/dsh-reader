# dsh_reader

中文 | [English](README.en.md)

一个 DeepSeek Harness（DSH）插件：**给内置文档预览加一个「电子书」查看方式**。

打开 markdown 文件的方式完全不变——预览默认仍用 **Markdown**（也可以切 **Code**、**Plain Text**）——只是查看方式菜单里多了一个 **电子书 / Book**：

```
打开 第026章.md  →  右侧栏预览（对话仍在旁边）
                 →  查看方式：Markdown · Code · Plain Text · 电子书
                 →  选「电子书」：整个文件夹变成一本可滚动的书
                 →  滚到本章结尾，下一章自动接上
                 →  选中一句话就能写批注
                 →  「→」复制：请按 …/06_批注/第026章.md 中的批注修改 …/04_正文/第026章.md。
```

打开行为和默认查看方式都不变：电子书只是下拉菜单里的一个**可选项**，不是替换。

## 功能

- **现有菜单里的一个「电子书」选项。** 通过文档预览的查看器注册表（`ctx.documentPreviews`）注册，和 Markdown / Code / Plain Text 并列，支持 `*.md` / `*.markdown`；内置 Markdown 仍是默认查看方式。
- **对话同屏。** 阅读器渲染在右侧栏里，对话保留自己的列；右侧栏自带的全屏切换可以随时变成全屏阅读。
- **连续阅读。** 章节从当前文件所在文件夹（或配置的书库）里发现，先按 frontmatter `order`、再自然排序（`第001章` < `第002章` < `第010章`），滚动到底自动追加。
- **书架 / 目录。** 左侧栏底部的「阅读」会打开书架页，列出每个已配置的书库和章节；阅读器里的「目录」抽屉列出整本书。
- **行内批注。** 选中文字 → 右键 → **批注**（或点选中后浮出的按钮）→ 写一句话 → 保存。已有批注在正文里高亮，右键高亮可以编辑/删除；抽屉里点一条会**跳到正文中对应位置并闪烁高亮**。不需要选类型、不需要选结论——批注就是那句话本身。
- **批注是项目里的普通文件。** 每章批注写到 `<annotationDir>/<章节>.md`（人和 agent 都能读），旁边有机器可读的 `.dsh_reader.json`。没有数据库、不锁定格式、可进 git。
- **送往对话。** 一键复制一条包含批注文件和章节路径的指令；路径按 `pathBase` 生成项目相对路径。
- **给 agent 的工具。** Host 注册了 `reader_annotations` 工具：agent 可以直接列出某章批注（只看未处理的）、
  处理完把对应批注标记为已结案，无需复制粘贴；和阅读器共用同一份批注数据。
- **通用。** 任何 markdown 文件夹都是一本书；导出的批注 md 语言可配（默认 `zh`，因为 DSH 界面语言是中文）。
- **跟随主题、零依赖。** 纯浏览器 JavaScript，无打包、无 npm 依赖；样式使用 DSH 主题变量，明暗主题自动跟随。

## 安装

这是一个普通的 DSH bundle，两种方式：

**在界面里装（推荐，不用重启）：**

1. 打开 DSH 左侧栏的 **Plugins**
2. **Add plugin** → 填 `github:yhu314/dsh-reader`（或本地检出的绝对路径）
3. **Enable now**，然后刷新页面

**用命令行装：**

```sh
# 从 GitHub 安装
dsh plugin --profile desktop add github:yhu314/dsh-reader

# 或从本地目录安装
dsh plugin --profile desktop add /absolute/path/to/dsh_reader
```

如果 bundle 没有热更新生效，用 `dsh --profile desktop` 重启 profile。

## 配置书库

一本书就是一个 markdown 文件夹。在 profile 的 `cordis.patch.yml`（通常是
`~/.dsh/profiles/desktop/cordis.patch.yml`）里加：

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
      locale: zh            # zh | en —— 生成的批注 markdown 的标题语言
    pathBase: '/Users/you/Novel'   # 工作区根目录；对话里的路径会变成相对路径
    promptTemplate: '请按 {annotationFile} 中的批注修改 {chapterFile}。逐条处理，并回报每条批注的处理结果。'
```

| 配置项 | 含义 |
| --- | --- |
| `libraries[].root` | 要读的目录，必填 |
| `libraries[].title` | 显示名，默认取目录名 |
| `libraries[].annotationDir` | 批注写到哪；绝对路径或相对 `root`；默认 `<root>/annotations` |
| `libraries[].recursive` | 是否递归子目录，默认 `false` |
| `libraries[].include` / `exclude` | 按相对路径匹配的 RegExp 源字符串 |
| `libraries[].order` | `auto`（frontmatter `order`，再按自然排序）/ `filename` / `mtime` |
| `annotation.locale` | `zh`（默认）或 `en`，控制生成的批注 markdown |
| `pathBase` | 工作区根目录：解析工作区相对地址、缩短对话里的路径 |
| `promptTemplate` | 「送往对话」复制的内容；可用 `{annotationFile}`、`{chapterFile}` |
| `maxChapterBytes` | 超过这个大小的章节不读，默认 2 MiB |

没有配置成书库的文件夹，用**电子书**打开也能读：阅读器会把它当成一本临时的只读书（连续阅读，但不能批注）。书架页只列已配置的书库。

## 批注文件

每次编辑后都会重新生成 `<annotationDir>/<章节>.md`：

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

同目录的 `.dsh_reader.json` 是插件读回的数据源。

## 结构

```
┌───────────── 浏览器 ─────────────┐       ┌────────── Host ──────────┐
│ 内置文档预览                      │ HTTP  │ /api/dsh_reader          │
│   查看方式菜单 + 电子书渲染器      │ ────► │ config · books · resolve │
│   书架页（左侧栏入口）             │       │ chapter · annotations    │
└───────────────────────────────────┘       └──────────────────────────┘
```

Host 端读取配置的目录、把 markdown 路径解析成一本连续的书、在 loopback 上提供
`/api/dsh_reader/*` 接口，并负责批注存储。浏览器端是一个文档查看器加一个书架页。接口契约见
[`docs/API.md`](docs/API.md)。

## 已知限制（v0.1）

- 批注以「段落」为锚点：跨段选择会记录下来，但可能不会高亮；原文改动导致找不到引文时批注仍保留，
  只是匹配不上（抽屉里仍能看到）。
- Markdown 渲染偏重散文：标题、段落、场景分隔、引用、列表、代码块、强调、行内代码、链接。
  图片和表格按文本显示。
- 没有全文搜索、不能在阅读器里改正文、章节在磁盘上变化不会自动刷新（重载预览或切换章节）。
- 阅读器渲染失败时会显示错误信息，不会把标签页整块变空白。

## 后续计划

- 图片/表格、书内搜索、按书设置阅读宽度、分栏。
- 可选的「markdown 默认用电子书打开」（把查看器优先级提到 extension）。

## 开发

```sh
node --test test/*.test.js     # Host 路由 + 浏览器端纯逻辑，不需要浏览器
```

- `index.js` — Host 插件：配置、章节发现、批注存储、HTTP 路由。
- `client.js` — 浏览器插件：电子书查看器、书架页、markdown 渲染。
- `locale/` — 插件管理器的显示元数据。
- `docs/API.md` — Host/浏览器契约。
- `examples/` — profile 配置示例。

## 许可证

MIT
