// Tests for the dsh-reader host half.
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
  assert.equal(captured.path, "/api/dsh-reader");
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

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), "dsh-reader-"));
  bookRoot = join(workspace, "book");
  annotationDir = join(bookRoot, "annotations");

  await mkdir(annotationDir, { recursive: true });
  await mkdir(join(bookRoot, "卷上"), { recursive: true });
  await mkdir(join(bookRoot, "草稿"), { recursive: true });
  await mkdir(join(bookRoot, "fake.md"), { recursive: true }); // non-regular "chapter"

  await writeFile(join(bookRoot, "第001章.md"), CHAPTER_ONE, "utf8");
  await writeFile(join(bookRoot, "第002章.md"), CHAPTER_TWO, "utf8");
  await writeFile(join(bookRoot, "第010章.md"), CHAPTER_TEN, "utf8");
  await writeFile(join(bookRoot, "卷上", "第003章.md"), "# 第003章 卷上\n\n正文。\n", "utf8");
  await writeFile(join(bookRoot, "草稿", "第004章.md"), "# 草稿\n", "utf8");
  await writeFile(join(bookRoot, ".隐藏.md"), "# 隐藏\n", "utf8");
  await writeFile(join(bookRoot, "notes.txt"), "not a chapter\n", "utf8");
  await writeFile(join(annotationDir, "leak.md"), "# stray export\n", "utf8");
  await writeFile(join(workspace, "secret.md"), "# outside the library\n", "utf8");

  client = createClient(baseConfig());
});

after(async () => {
  if (workspace !== undefined) {
    await rm(workspace, { recursive: true, force: true });
  }
});

// ── health ─────────────────────────────────────────────────────────────────

test("GET /health reports plugin, version and library count", async () => {
  const res = await request(client, "/api/dsh-reader/health");
  assert.equal(res.status, 200);
  assert.equal(res.ended, true);
  assert.equal(res.json.ok, true);
  assert.match(res.json.version, /^\d+\.\d+\.\d+/);
  assert.equal(res.json.libraries, 1);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(res.headers["cache-control"], "no-store");
});

// ── books ──────────────────────────────────────────────────────────────────

test("GET /books sorts naturally, extracts titles and skips noise", async () => {
  const res = await request(client, "/api/dsh-reader/books");
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

  // Hidden files, non-markdown files, the annotation subtree, and (because
  // recursive is false) nested directories are all excluded.
  const ids = library.chapters.map((chapter) => chapter.id);
  assert.ok(!ids.includes(".隐藏.md"));
  assert.ok(!ids.includes("notes.txt"));
  assert.ok(!ids.includes("annotations/leak.md"));
  assert.ok(!ids.includes("卷上/第003章.md"));

  const first = library.chapters[0];
  assert.equal(first.annotationFile, "第001章.md");
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

  const res = await request(recursive, "/api/dsh-reader/books");
  assert.equal(res.status, 200);
  const library = res.json.libraries[0];
  assert.deepEqual(
    library.chapters.map((chapter) => chapter.id),
    ["第001章.md", "第002章.md", "卷上/第003章.md", "第010章.md"],
  );
  assert.ok(!library.chapters.some((chapter) => chapter.id.startsWith("草稿/")));
  assert.ok(!library.chapters.some((chapter) => chapter.id === "annotations/leak.md"));
});

// ── chapter reading ────────────────────────────────────────────────────────

test("GET /chapter returns text and the extracted title", async () => {
  const res = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: "第001章.md" }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.id, "第001章.md");
  assert.equal(res.json.title, "第001章 军报");
  assert.match(res.json.text, /血泼了他一脸/);
});

test("unknown libraries and chapters return 404, bad requests 400", async () => {
  const unknownLibrary = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "nope", file: "第001章.md" }),
  );
  assert.equal(unknownLibrary.status, 404);

  const unknownChapter = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: "第999章.md" }),
  );
  assert.equal(unknownChapter.status, 404);

  const missingFile = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book" }),
  );
  assert.equal(missingFile.status, 400);
});

// ── path safety ────────────────────────────────────────────────────────────

test("path traversal, absolute paths and non-regular files are rejected", async () => {
  const traversal = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: "../secret.md" }),
  );
  assert.equal(traversal.status, 403);
  assert.equal(traversal.headers["cache-control"], "no-store");

  const absolute = await request(
    client,
    query("/api/dsh-reader/chapter", {
      lib: "test-book",
      file: join(workspace, "secret.md"),
    }),
  );
  assert.equal(absolute.status, 403);

  const directory = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: "fake.md" }),
  );
  assert.equal(directory.status, 404);

  const hidden = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: ".隐藏.md" }),
  );
  assert.equal(hidden.status, 404);

  const annotationExport = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: "annotations/leak.md" }),
  );
  assert.equal(annotationExport.status, 404);

  const nonMarkdown = await request(
    client,
    query("/api/dsh-reader/chapter", { lib: "test-book", file: "notes.txt" }),
  );
  assert.equal(nonMarkdown.status, 404);
});

// ── annotations lifecycle ──────────────────────────────────────────────────

test("annotations: create, list, resolve, delete, and regenerate markdown", async () => {
  // Empty at first.
  let res = await request(
    client,
    query("/api/dsh-reader/annotations", { lib: "test-book", file: "第001章.md" }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.comments, []);
  assert.equal(res.json.annotationFile, "第001章.md");
  assert.equal(res.json.annotationPath, "book/annotations/第001章.md");

  // Create A1.
  res = await request(client, "/api/dsh-reader/annotations", {
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
  res = await request(client, "/api/dsh-reader/annotations", {
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
    query("/api/dsh-reader/annotations", { lib: "test-book", file: "第001章.md" }),
  );
  assert.equal(res.json.comments.length, 2);

  // Store file is the machine-readable source of truth.
  const store = JSON.parse(
    await readFile(join(annotationDir, ".dsh-reader.json"), "utf8"),
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
  assert.match(markdown, /> 机器可读数据：`\.dsh-reader\.json`/);
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
  res = await request(client, "/api/dsh-reader/annotations", {
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
  res = await request(client, "/api/dsh-reader/annotations", {
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
  res = await request(client, "/api/dsh-reader/annotations", {
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
  res = await request(client, "/api/dsh-reader/annotations", {
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

  const res = await request(englishClient, "/api/dsh-reader/annotations", {
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
    query("/api/dsh-reader/annotations", { lib: "plain", file: "第001章.md" }),
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
    query("/api/dsh-reader/chapter", { lib: "tiny", file: "第001章.md" }),
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

  const res = await request(captured, "/api/dsh-reader/books");
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
  const brokenRes = await request(broken, "/api/dsh-reader/books");
  assert.equal(brokenRes.status, 200);
  assert.deepEqual(brokenRes.json.libraries, []);
  assert.ok(brokenRes.json.errors.some((message) => /libraries must be an array/.test(message)));

  // apply() itself must accept null / garbage config.
  assert.doesNotThrow(() => apply({ webServer: { register() {} } }, null));
  assert.doesNotThrow(() => apply({ webServer: { register() {} } }, "not-an-object"));
});

// ── HTTP guards ────────────────────────────────────────────────────────────

test("non-loopback hosts and unsupported methods are rejected as JSON", async () => {
  const remote = await request(client, "/api/dsh-reader/health", {
    host: "evil.example:80",
  });
  assert.equal(remote.status, 403);
  assert.equal(remote.headers["cache-control"], "no-store");
  assert.match(remote.json.error, /forbidden host/);

  const method = await request(client, "/api/dsh-reader/health", {
    method: "POST",
    body: {},
  });
  assert.equal(method.status, 405);

  const unknown = await request(client, "/api/dsh-reader/nope");
  assert.equal(unknown.status, 404);
});
