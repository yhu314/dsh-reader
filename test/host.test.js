// Tests for the dsh_reader host half.
//
// Run with:
//   node --test test/
//
// The suite builds a throw-away markdown library under os.tmpdir(), registers
// the plugin against a minimal mock Cordis context, and drives the captured
// raw `(req, res)` handler with fake request/response objects.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";

import { apply } from "../index.js";

// ── HTTP harness ───────────────────────────────────────────────────────────

/**
 * Register the plugin with a mock Cordis ctx and return the captured route
 * options. `opts.handler` is the raw Node handler.
 */
function createClient(config) {
  let captured = null;
  const ctx = {
    webServer: {
      register(options) {
        captured = options;
      },
    },
  };
  apply(ctx, config);
  assert.ok(captured !== null, "apply() must register a web server route");
  assert.equal(captured.kind, "prefix");
  assert.equal(captured.path, "/api/dsh_reader");
  return captured;
}

/** Minimal `res` that records status, headers, body and `end()` calls. */
function makeResponse() {
  const chunks = [];
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    headersSent: false,
    ended: false,
    writeHead(status, headers = {}) {
      res.statusCode = status;
      for (const [key, value] of Object.entries(headers)) {
        res.headers[key.toLowerCase()] = value;
      }
      res.headersSent = true;
      return res;
    },
    setHeader(name, value) {
      res.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null && chunk !== "") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      res.body = Buffer.concat(chunks).toString("utf8");
      res.ended = true;
    },
  };
  return res;
}

function query(pathname, params) {
  return `${pathname}?${new URLSearchParams(params)}`;
}

/**
 * Call the captured handler with a fake request.
 *
 * @param {{handler: Function}} client
 * @param {string} url request path + query
 * @param {{method?: string, body?: unknown, host?: string}} [options]
 */
async function request(client, url, options = {}) {
  const method = options.method ?? "GET";
  const rawBody =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);

  const req = Readable.from(rawBody === undefined ? [] : [rawBody]);
  req.method = method;
  req.url = url;
  req.headers = { host: options.host ?? "127.0.0.1:1234" };

  const res = makeResponse();
  await client.handler(req, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body,
    json: res.body === "" ? null : JSON.parse(res.body),
    ended: res.ended,
  };
}

// ── fixture ────────────────────────────────────────────────────────────────

let workspace;
let bookRoot;
let annotationDir;
let metaRoot;
let adhocRoot;
let exportRoot;
let client;

const CHAPTER_ONE = "# 第001章 军报\n\n第一段正文。\n\n血泼了他一脸。\n";
const CHAPTER_TWO = "第002章没有标题。\n\n正文。\n";
const CHAPTER_TEN = "第010章只有正文。\n\n正文。\n";

const baseConfig = () => ({
  libraries: [
    {
      id: "test-book",
      title: "测试书",
      root: bookRoot,
      annotationDir,
    },
  ],
  annotation: {
    types: ["事实", "逻辑", "文风", "结构", "删减", "疑问"],
    conclusions: ["采纳", "驳回", "转细纲", "暂缓"],
    locale: "zh",
  },
  pathBase: workspace,
  promptTemplate: "请按 {annotationFile} 中的批注修改 {chapterFile}。",
  maxChapterBytes: 1024 * 1024,
});

const metaConfig = (order) => ({
  libraries: [
    {
      id: "meta-book",
      root: metaRoot,
      ...(order === undefined ? {} : { order }),
    },
  ],
  annotation: { types: ["note"], conclusions: ["accept"], locale: "zh" },
  pathBase: workspace,
});

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), "dsh_reader-"));
  bookRoot = join(workspace, "book");
  annotationDir = join(bookRoot, "annotations");
  metaRoot = join(workspace, "meta");
  adhocRoot = join(workspace, "adhoc");
  exportRoot = join(workspace, "export");

  await mkdir(annotationDir, { recursive: true });
  await mkdir(join(bookRoot, "卷上"), { recursive: true });
  await mkdir(join(bookRoot, "草稿"), { recursive: true });
  await mkdir(join(bookRoot, "fake.md"), { recursive: true }); // non-regular "chapter"
  await mkdir(metaRoot, { recursive: true });
  await mkdir(adhocRoot, { recursive: true });
  await mkdir(exportRoot, { recursive: true });

  await writeFile(join(bookRoot, "第001章.md"), CHAPTER_ONE, "utf8");
  await writeFile(join(bookRoot, "第002章.md"), CHAPTER_TWO, "utf8");
  await writeFile(join(bookRoot, "第010章.md"), CHAPTER_TEN, "utf8");
  await writeFile(join(bookRoot, "卷上", "第003章.md"), "# 第003章 卷上\n\n正文。\n", "utf8");
  await writeFile(join(bookRoot, "草稿", "第004章.md"), "# 草稿\n", "utf8");
  await writeFile(join(bookRoot, ".隐藏.md"), "# 隐藏\n", "utf8");
  await writeFile(join(bookRoot, "notes.txt"), "not a chapter\n", "utf8");
  await writeFile(join(annotationDir, "leak.md"), "# stray export\n", "utf8");
  await writeFile(join(workspace, "secret.md"), "# outside the library\n", "utf8");

  // Frontmatter ordering / title fixtures.
  await writeFile(
    join(metaRoot, "c-tie.md"),
    "---\ntitle: 三号排前\norder: 1\n---\n\n正文一。\n",
    "utf8",
  );
  await writeFile(
    join(metaRoot, "z-first.md"),
    "---\ntitle: 第一章 起始\norder: 1\n---\n\n# 不应使用这个标题\n\n正文二。\n",
    "utf8",
  );
  await writeFile(
    join(metaRoot, "y-second.md"),
    '---\ntitle: "第二章 承接"\norder: 2\n---\n\n正文三。\n',
    "utf8",
  );
  await writeFile(join(metaRoot, "a-plain.md"), "# A 无 frontmatter\n\n正文四。\n", "utf8");
  await writeFile(join(metaRoot, "b-plain.md"), "没有标题，只有正文。\n", "utf8");

  // Ad-hoc book fixtures (outside any library root).
  await writeFile(join(adhocRoot, "a.md"), "# A 章\n\nA 正文。\n", "utf8");
  await writeFile(join(adhocRoot, "b.md"), "---\ntitle: B 章\n---\n\nB 正文。\n", "utf8");
  await writeFile(join(adhocRoot, ".hidden.md"), "# 隐藏\n", "utf8");
  await writeFile(join(adhocRoot, "notes.txt"), "not a chapter\n", "utf8");

  // A `.markdown` chapter plus its `<stem>.md` annotation export.
  await writeFile(join(exportRoot, "c.markdown"), "# C 章\n\nC 正文。\n", "utf8");
  await writeFile(
    join(exportRoot, "c.md"),
    "# C 章 — 批注\n\n> 机器可读数据：`.dsh_reader.json`\n",
    "utf8",
  );

  client = createClient(baseConfig());
});

after(async () => {
  if (workspace !== undefined) {
    await rm(workspace, { recursive: true, force: true });
  }
});

// ── health ─────────────────────────────────────────────────────────────────

test("GET /health reports plugin, version and library count", async () => {
  const res = await request(client, "/api/dsh_reader/health");
  assert.equal(res.status, 200);
  assert.equal(res.ended, true);
  assert.equal(res.json.ok, true);
  assert.match(res.json.version, /^\d+\.\d+\.\d+/);
  assert.equal(res.json.libraries, 1);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(res.headers["cache-control"], "no-store");
});

// ── config ─────────────────────────────────────────────────────────────────

test("GET /config exposes neutral defaults, claimMarkdown and no chapter data", async () => {
  const defaults = createClient({
    libraries: [{ id: "plain", root: bookRoot, annotationDir }],
  });

  let res = await request(defaults, "/api/dsh_reader/config");
  assert.equal(res.status, 200);
  assert.match(res.json.version, /^\d+\.\d+\.\d+/);
  assert.equal(res.json.claimMarkdown, "all");
  assert.equal(res.json.pathBase, null);
  assert.deepEqual(res.json.annotation, {
    types: ["note", "question", "fix", "idea"],
    conclusions: ["accept", "reject", "defer"],
    locale: "zh",
  });
  assert.equal(
    res.json.promptTemplate,
    "请按 {annotationFile} 中的批注修改 {chapterFile}。",
  );
  assert.deepEqual(res.json.errors, []);
  assert.deepEqual(res.json.libraries, [
    {
      id: "plain",
      title: "book",
      root: bookRoot,
      annotationDir,
    },
  ]);
  assert.deepEqual(
    Object.keys(res.json.libraries[0]).sort(),
    ["annotationDir", "id", "root", "title"],
  );
  assert.ok(!("chapters" in res.json.libraries[0]), "/config must not read chapters");

  // The English locale changes only the default prompt; explicit values win.
  res = await request(
    createClient({ libraries: [], claimMarkdown: "off", annotation: { locale: "en" } }),
    "/api/dsh_reader/config",
  );
  assert.equal(res.json.claimMarkdown, "off");
  assert.equal(res.json.annotation.locale, "en");
  assert.equal(
    res.json.promptTemplate,
    "Revise {chapterFile} according to {annotationFile}.",
  );
  assert.deepEqual(res.json.libraries, []);

  // Invalid claimMarkdown is reported but falls back to "all".
  res = await request(
    createClient({ libraries: [], claimMarkdown: "sometimes" }),
    "/api/dsh_reader/config",
  );
  assert.equal(res.json.claimMarkdown, "all");
  assert.ok(res.json.errors.some((message) => /claimMarkdown/.test(message)));
});

// ── books ──────────────────────────────────────────────────────────────────

test("GET /books sorts naturally, extracts titles and skips noise", async () => {
  const res = await request(client, "/api/dsh_reader/books");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.errors, []);
  assert.equal(res.json.libraries.length, 1);

  const library = res.json.libraries[0];
  assert.equal(library.id, "test-book");
  assert.equal(library.title, "测试书");
  assert.equal(library.root, bookRoot);
  assert.equal(library.annotationDir, annotationDir);

  // Natural sort and title extraction (H1 vs. file stem).
  assert.deepEqual(
    library.chapters.map((chapter) => chapter.id),
    ["第001章.md", "第002章.md", "第010章.md"],
  );
  assert.deepEqual(
    library.chapters.map((chapter) => chapter.title),
    ["第001章 军报", "第002章", "第010章"],
  );
  // No frontmatter in these fixtures.
  assert.deepEqual(
    library.chapters.map((chapter) => chapter.order),
    [null, null, null],
  );

  // Hidden files, non-markdown files, the annotation subtree, and (because
  // recursive is false) nested directories are all excluded.
  const ids = library.chapters.map((chapter) => chapter.id);
  assert.ok(!ids.includes(".隐藏.md"));
  assert.ok(!ids.includes("notes.txt"));
  assert.ok(!ids.includes("annotations/leak.md"));
  assert.ok(!ids.includes("卷上/第003章.md"));

  const first = library.chapters[0];
  assert.equal(first.annotationFile, "第001章.md");
  assert.equal(first.chapterPath, "book/第001章.md");
  assert.equal(first.annotationPath, "book/annotations/第001章.md");
  assert.ok(first.size > 0);
  assert.equal(typeof first.mtime, "number");
  assert.ok(Number.isInteger(first.mtime));

  assert.deepEqual(res.json.annotation.types, baseConfig().annotation.types);
  assert.equal(res.json.annotation.locale, "zh");
  assert.equal(
    res.json.promptTemplate,
    "请按 {annotationFile} 中的批注修改 {chapterFile}。",
  );
});

test("recursive, include and exclude are honoured", async () => {
  const recursive = createClient({
    ...baseConfig(),
    libraries: [
      {
        id: "recursive-book",
        root: bookRoot,
        annotationDir,
        recursive: true,
        include: ["\\.md$"],
        exclude: ["^草稿/"],
      },
    ],
  });

  const res = await request(recursive, "/api/dsh_reader/books");
  assert.equal(res.status, 200);
  const library = res.json.libraries[0];
  assert.deepEqual(
    library.chapters.map((chapter) => chapter.id),
    ["第001章.md", "第002章.md", "卷上/第003章.md", "第010章.md"],
  );
  assert.ok(!library.chapters.some((chapter) => chapter.id.startsWith("草稿/")));
  assert.ok(!library.chapters.some((chapter) => chapter.id === "annotations/leak.md"));
});

// ── frontmatter and ordering ───────────────────────────────────────────────

test("frontmatter title/order are parsed; auto sorts ordered files first", async () => {
  const metaClient = createClient(metaConfig());
  const res = await request(metaClient, "/api/dsh_reader/books");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.errors, []);

  const chapters = res.json.libraries[0].chapters;
  // order 1 (tie → natural name), order 2, then the unordered files naturally.
  assert.deepEqual(
    chapters.map((chapter) => chapter.id),
    ["c-tie.md", "z-first.md", "y-second.md", "a-plain.md", "b-plain.md"],
  );
  // frontmatter title > H1 > stem; quoted YAML titles are unquoted.
  assert.deepEqual(
    chapters.map((chapter) => chapter.title),
    ["三号排前", "第一章 起始", "第二章 承接", "A 无 frontmatter", "b-plain"],
  );
  assert.deepEqual(
    chapters.map((chapter) => chapter.order),
    [1, 1, 2, null, null],
  );

  // The same title resolution is used when a chapter is opened directly.
  const opened = await request(
    metaClient,
    query("/api/dsh_reader/chapter", { lib: "meta-book", file: "z-first.md" }),
  );
  assert.equal(opened.status, 200);
  assert.equal(opened.json.title, "第一章 起始");
  assert.match(opened.json.text, /# 不应使用这个标题/);
});

test("order: filename ignores frontmatter and sorts naturally by name", async () => {
  const filenameClient = createClient(metaConfig("filename"));
  const res = await request(filenameClient, "/api/dsh_reader/books");
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.libraries[0].chapters.map((chapter) => chapter.id),
    ["a-plain.md", "b-plain.md", "c-tie.md", "y-second.md", "z-first.md"],
  );
});

// ── chapter reading ────────────────────────────────────────────────────────

test("GET /chapter returns text and the extracted title", async () => {
  const res = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: "第001章.md" }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.id, "第001章.md");
  assert.equal(res.json.title, "第001章 军报");
  assert.match(res.json.text, /血泼了他一脸/);
});

test("unknown libraries and chapters return 404, bad requests 400", async () => {
  const unknownLibrary = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "nope", file: "第001章.md" }),
  );
  assert.equal(unknownLibrary.status, 404);

  const unknownChapter = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: "第999章.md" }),
  );
  assert.equal(unknownChapter.status, 404);

  const missingFile = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book" }),
  );
  assert.equal(missingFile.status, 400);
});

// ── path safety ────────────────────────────────────────────────────────────

test("path traversal, absolute paths and non-regular files are rejected", async () => {
  const traversal = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: "../secret.md" }),
  );
  assert.equal(traversal.status, 403);
  assert.equal(traversal.headers["cache-control"], "no-store");

  const absolute = await request(
    client,
    query("/api/dsh_reader/chapter", {
      lib: "test-book",
      file: join(workspace, "secret.md"),
    }),
  );
  assert.equal(absolute.status, 403);

  const directory = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: "fake.md" }),
  );
  assert.equal(directory.status, 404);

  const hidden = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: ".隐藏.md" }),
  );
  assert.equal(hidden.status, 404);

  const annotationExport = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: "annotations/leak.md" }),
  );
  assert.equal(annotationExport.status, 404);

  const nonMarkdown = await request(
    client,
    query("/api/dsh_reader/chapter", { lib: "test-book", file: "notes.txt" }),
  );
  assert.equal(nonMarkdown.status, 404);
});

// ── resolve / ad-hoc books ─────────────────────────────────────────────────

test("GET /resolve opens a library file with the full book and correct index", async () => {
  const books = await request(client, "/api/dsh_reader/books");
  const expectedChapters = books.json.libraries[0].chapters;
  const target = join(bookRoot, "第002章.md");

  let res = await request(client, query("/api/dsh_reader/resolve", { path: target }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "library");
  assert.equal(res.json.path, target);
  assert.equal(res.json.bookRoot, bookRoot);
  assert.equal(res.json.libraryId, "test-book");
  assert.equal(res.json.annotationEnabled, true);
  assert.equal(res.json.index, 1);
  assert.deepEqual(res.json.chapters, expectedChapters);

  // Relative paths resolve through pathBase …
  res = await request(client, query("/api/dsh_reader/resolve", { path: "book/第002章.md" }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "library");
  assert.equal(res.json.path, target);
  assert.equal(res.json.index, 1);

  // … and through library roots when pathBase is not configured.
  const noBase = createClient({
    libraries: [{ id: "plain", root: bookRoot, annotationDir }],
    annotation: { locale: "zh" },
  });
  res = await request(noBase, query("/api/dsh_reader/resolve", { path: "第002章.md" }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "library");
  assert.equal(res.json.libraryId, "plain");
  assert.equal(res.json.path, target);
});

test("GET /resolve opens a file outside libraries as an ad-hoc read-only book", async () => {
  const target = join(adhocRoot, "b.md");
  let res = await request(client, query("/api/dsh_reader/resolve", { path: target }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "adhoc");
  assert.equal(res.json.path, target);
  assert.equal(res.json.bookRoot, adhocRoot);
  assert.equal(res.json.libraryId, null);
  assert.equal(res.json.annotationEnabled, false);
  assert.equal(res.json.index, 1);
  assert.deepEqual(res.json.chapters, [
    {
      id: "a.md",
      title: "A 章",
      chapterPath: join(adhocRoot, "a.md"),
    },
    {
      id: "b.md",
      title: "B 章",
      chapterPath: target,
    },
  ]);

  // Relative ad-hoc paths resolve through pathBase too.
  res = await request(client, query("/api/dsh_reader/resolve", { path: "adhoc/a.md" }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "adhoc");
  assert.equal(res.json.path, join(adhocRoot, "a.md"));
  assert.equal(res.json.index, 0);

  // A `.markdown` chapter's own `<stem>.md` annotation export is not a chapter.
  res = await request(
    client,
    query("/api/dsh_reader/resolve", { path: join(exportRoot, "c.markdown") }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.chapters, [
    {
      id: "c.markdown",
      title: "C 章",
      chapterPath: join(exportRoot, "c.markdown"),
    },
  ]);
  assert.equal(res.json.index, 0);
});

test("GET /resolve falls back to an ad-hoc book for an in-root file the chapter list excludes", async () => {
  const target = join(bookRoot, "草稿", "第004章.md");
  const res = await request(client, query("/api/dsh_reader/resolve", { path: target }));
  assert.equal(res.status, 200);
  assert.equal(res.json.mode, "adhoc");
  assert.equal(res.json.path, target);
  assert.equal(res.json.bookRoot, join(bookRoot, "草稿"));
  assert.equal(res.json.libraryId, null);
  assert.equal(res.json.annotationEnabled, false);
  assert.ok(res.json.index >= 0);
  // Its read-only chapter form is reachable through /chapter?path=.
  const chapter = await request(client, query("/api/dsh_reader/chapter", { path: target }));
  assert.equal(chapter.status, 200);
  assert.equal(chapter.json.id, "第004章.md");
});

test("GET /resolve 404s for missing, hidden, non-markdown and directory paths", async () => {
  for (const badPath of [
    join(adhocRoot, "missing.md"),
    join(adhocRoot, ".hidden.md"),
    join(adhocRoot, "notes.txt"),
    join(bookRoot, ".隐藏.md"),
    adhocRoot,
  ]) {
    const res = await request(client, query("/api/dsh_reader/resolve", { path: badPath }));
    assert.equal(res.status, 404, `expected 404 for ${badPath}`);
  }

  const relativeMiss = await request(
    client,
    query("/api/dsh_reader/resolve", { path: "nowhere/nope.md" }),
  );
  assert.equal(relativeMiss.status, 404);

  const missingParam = await request(client, "/api/dsh_reader/resolve");
  assert.equal(missingParam.status, 400);
});

test("GET /chapter reads an absolute ad-hoc markdown path", async () => {
  let res = await request(
    client,
    query("/api/dsh_reader/chapter", { path: join(adhocRoot, "a.md") }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.id, "a.md");
  assert.equal(res.json.title, "A 章");
  assert.match(res.json.text, /A 正文/);

  // Frontmatter title wins in the ad-hoc form too.
  res = await request(
    client,
    query("/api/dsh_reader/chapter", { path: join(adhocRoot, "b.md") }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.title, "B 章");

  const relative = await request(
    client,
    query("/api/dsh_reader/chapter", { path: "adhoc/a.md" }),
  );
  assert.equal(relative.status, 400);

  for (const badPath of [
    join(adhocRoot, "notes.txt"),
    join(adhocRoot, "missing.md"),
    join(adhocRoot, ".hidden.md"),
    adhocRoot,
  ]) {
    const bad = await request(
      client,
      query("/api/dsh_reader/chapter", { path: badPath }),
    );
    assert.equal(bad.status, 404, `expected 404 for ${badPath}`);
  }

  const tiny = createClient({ ...baseConfig(), maxChapterBytes: 16 });
  const oversized = await request(
    tiny,
    query("/api/dsh_reader/chapter", { path: join(adhocRoot, "a.md") }),
  );
  assert.equal(oversized.status, 400);
  assert.match(oversized.json.error, /too large/i);
});

// ── annotations lifecycle ──────────────────────────────────────────────────

test("annotations: create, list, resolve, delete, and regenerate markdown", async () => {
  // Empty at first.
  let res = await request(
    client,
    query("/api/dsh_reader/annotations", { lib: "test-book", file: "第001章.md" }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.comments, []);
  assert.equal(res.json.annotationFile, "第001章.md");
  assert.equal(res.json.annotationPath, "book/annotations/第001章.md");

  // Create A1.
  res = await request(client, "/api/dsh_reader/annotations", {
    method: "POST",
    body: {
      lib: "test-book",
      file: "第001章.md",
      op: "save",
      comment: {
        type: "文风",
        conclusion: "采纳",
        quote: "血泼了他一脸",
        block: 12,
        note: "这一句太轻。",
      },
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.comments.length, 1);

  const a1 = res.json.comments[0];
  assert.equal(a1.id, "A1");
  assert.equal(a1.type, "文风");
  assert.equal(a1.conclusion, "采纳");
  assert.equal(a1.block, 12);
  assert.equal(a1.resolved, false);
  assert.equal(typeof a1.createdAt, "number");
  assert.equal(typeof a1.updatedAt, "number");
  assert.equal(a1.createdAt, a1.updatedAt);

  // Create A2 (auto id) with a pipe in the note to exercise table escaping.
  res = await request(client, "/api/dsh_reader/annotations", {
    method: "POST",
    body: {
      lib: "test-book",
      file: "第001章.md",
      op: "save",
      comment: {
        type: "逻辑",
        conclusion: "暂缓",
        block: 3,
        note: "需要核对 | 这里",
      },
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.comments.map((comment) => comment.id),
    ["A1", "A2"],
  );

  // GET returns the stored list.
  res = await request(
    client,
    query("/api/dsh_reader/annotations", { lib: "test-book", file: "第001章.md" }),
  );
  assert.equal(res.json.comments.length, 2);

  // Store file is the machine-readable source of truth.
  const store = JSON.parse(
    await readFile(join(annotationDir, ".dsh_reader.json"), "utf8"),
  );
  assert.equal(store.version, 1);
  const entry = store.chapters["第001章.md"];
  assert.equal(entry.source, join(bookRoot, "第001章.md"));
  assert.equal(typeof entry.updatedAt, "number");
  assert.equal(entry.comments.length, 2);

  // Generated markdown matches the documented layout.
  let markdown = await readFile(join(annotationDir, "第001章.md"), "utf8");
  assert.match(markdown, /^# 第001章 军报 — 批注\n/);
  assert.match(markdown, /> 源文件：`第001章\.md`/);
  assert.match(markdown, /> 机器可读数据：`\.dsh_reader\.json`/);
  assert.match(markdown, /\n共 2 条，未结案 2 条。\n/);
  assert.match(markdown, /\| 编号 \| 位置 \| 类型 \| 内容 \| 结论 \| 状态 \|/);
  assert.match(markdown, /\| A1 \| 第 12 段 \| 文风 \| 这一句太轻。 \| 采纳 \| 未结案 \|/);
  assert.match(markdown, /## 明细/);
  assert.match(markdown, /### A1｜第 12 段｜文风｜采纳/);
  assert.match(markdown, /> 原文：「血泼了他一脸」/);
  assert.match(markdown, /\| A2 \| 第 3 段 \| 逻辑 \| 需要核对 \\\| 这里 \| 暂缓 \| 未结案 \|/);
  assert.ok(!markdown.includes("\r"), "generated markdown must use \\n newlines");
  assert.ok(markdown.endsWith("\n"));

  // Resolve A2.
  res = await request(client, "/api/dsh_reader/annotations", {
    method: "POST",
    body: { lib: "test-book", file: "第001章.md", op: "resolve", id: "A2", resolved: true },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.comments.find((comment) => comment.id === "A2").resolved, true);

  markdown = await readFile(join(annotationDir, "第001章.md"), "utf8");
  assert.match(markdown, /共 2 条，未结案 1 条。/);
  assert.match(
    markdown,
    /\| A2 \| 第 3 段 \| 逻辑 \| 需要核对 \\\| 这里 \| 暂缓 \| 已结案 \|/,
  );

  // Delete A1.
  res = await request(client, "/api/dsh_reader/annotations", {
    method: "POST",
    body: { lib: "test-book", file: "第001章.md", op: "delete", id: "A1" },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.comments.map((comment) => comment.id),
    ["A2"],
  );

  markdown = await readFile(join(annotationDir, "第001章.md"), "utf8");
  assert.match(markdown, /共 1 条，未结案 0 条。/);
  assert.ok(!markdown.includes("### A1"));

  // The next created comment continues from the largest existing suffix.
  res = await request(client, "/api/dsh_reader/annotations", {
    method: "POST",
    body: {
      lib: "test-book",
      file: "第001章.md",
      op: "save",
      comment: { type: "事实", conclusion: "驳回", block: 1, note: "追加一条。" },
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.comments.map((comment) => comment.id),
    ["A2", "A3"],
  );

  // Unknown comments are a 404, not a silent no-op.
  res = await request(client, "/api/dsh_reader/annotations", {
    method: "POST",
    body: { lib: "test-book", file: "第001章.md", op: "delete", id: "A99" },
  });
  assert.equal(res.status, 404);
});

test("annotation.locale en localizes generated markdown", async () => {
  const englishClient = createClient({
    ...baseConfig(),
    libraries: [
      {
        id: "english-book",
        root: bookRoot,
        annotationDir: join(workspace, "annotations-en"),
      },
    ],
    annotation: { ...baseConfig().annotation, locale: "en" },
  });

  const res = await request(englishClient, "/api/dsh_reader/annotations", {
    method: "POST",
    body: {
      lib: "english-book",
      file: "第002章.md",
      op: "save",
      comment: {
        type: "文风",
        conclusion: "采纳",
        quote: "血泼了他一脸",
        block: 5,
        note: "这一句太轻。",
      },
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.annotationPath, "annotations-en/第002章.md");

  const markdown = await readFile(
    join(workspace, "annotations-en", "第002章.md"),
    "utf8",
  );
  assert.match(markdown, /^# 第002章 — Annotations\n/);
  assert.match(markdown, /> Source file: `第002章\.md`/);
  assert.match(markdown, /\n1 comment, 1 open\.\n/);
  assert.match(markdown, /\| ID \| Location \| Type \| Content \| Conclusion \| Status \|/);
  assert.match(markdown, /### A1 · Paragraph 5 · 文风 · 采纳/);
  assert.match(markdown, /> Quote: “/);
});

test("annotationPath is absolute when pathBase is not configured", async () => {
  const plainClient = createClient({
    libraries: [{ id: "plain", root: bookRoot, annotationDir }],
    annotation: { locale: "zh" },
  });
  const res = await request(
    plainClient,
    query("/api/dsh_reader/annotations", { lib: "plain", file: "第001章.md" }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.annotationPath, join(annotationDir, "第001章.md"));
});

// ── limits and config errors ───────────────────────────────────────────────

test("oversized chapters fail with 400 instead of truncating", async () => {
  const tiny = createClient({
    ...baseConfig(),
    maxChapterBytes: 32,
    libraries: [{ id: "tiny", root: bookRoot, annotationDir }],
  });
  const res = await request(
    tiny,
    query("/api/dsh_reader/chapter", { lib: "tiny", file: "第001章.md" }),
  );
  assert.equal(res.status, 400);
  assert.match(res.json.error, /too large/i);
  assert.match(res.json.error, /maxChapterBytes/);
});

test("invalid libraries land in /books errors instead of throwing", async () => {
  let captured = null;
  assert.doesNotThrow(() => {
    apply(
      {
        webServer: {
          register(options) {
            captured = options;
          },
        },
      },
      {
        libraries: [
          { id: "missing-root" },
          { id: "bad-root", root: join(workspace, "does-not-exist") },
          { id: "bad-regex", root: bookRoot, include: ["("] },
          { id: "ok", root: bookRoot, annotationDir },
        ],
        annotation: { locale: "klingon" },
      },
    );
  });
  assert.ok(captured !== null);

  const res = await request(captured, "/api/dsh_reader/books");
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.json.libraries.map((library) => library.id),
    ["ok"],
  );
  assert.ok(res.json.errors.some((message) => /missing-root/.test(message)));
  assert.ok(res.json.errors.some((message) => /bad-root/.test(message)));
  assert.ok(res.json.errors.some((message) => /bad-regex/.test(message)));
  assert.equal(res.json.annotation.locale, "zh");

  // A completely unusable libraries value is reported, not thrown.
  const broken = createClient({ libraries: "nope" });
  const brokenRes = await request(broken, "/api/dsh_reader/books");
  assert.equal(brokenRes.status, 200);
  assert.deepEqual(brokenRes.json.libraries, []);
  assert.ok(brokenRes.json.errors.some((message) => /libraries must be an array/.test(message)));

  // apply() itself must accept null / garbage config.
  assert.doesNotThrow(() => apply({ webServer: { register() {} } }, null));
  assert.doesNotThrow(() => apply({ webServer: { register() {} } }, "not-an-object"));
});

// ── HTTP guards ────────────────────────────────────────────────────────────

test("non-loopback hosts and unsupported methods are rejected as JSON", async () => {
  const remote = await request(client, "/api/dsh_reader/health", {
    host: "evil.example:80",
  });
  assert.equal(remote.status, 403);
  assert.equal(remote.headers["cache-control"], "no-store");
  assert.match(remote.json.error, /forbidden host/);

  const method = await request(client, "/api/dsh_reader/health", {
    method: "POST",
    body: {},
  });
  assert.equal(method.status, 405);

  const unknown = await request(client, "/api/dsh_reader/nope");
  assert.equal(unknown.status, 404);
});
