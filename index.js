// dsh-reader — host half.
//
// Serves a markdown book reader and its annotation store behind one prefix
// route on the DSH Web GUI:
//
//   GET  /api/dsh-reader/health       -> { ok, version, libraries }
//   GET  /api/dsh-reader/books        -> { libraries, annotation, promptTemplate, errors }
//   GET  /api/dsh-reader/chapter      -> { id, title, text }
//   GET  /api/dsh-reader/annotations  -> { comments, annotationFile, annotationPath }
//   POST /api/dsh-reader/annotations  -> same shape, after save/delete/resolve
//
// Loopback only: the route reads local files from configured library roots.
// Every path coming from the browser is resolved and checked against its
// library root; escapes are rejected with 403.
//
// Annotations live in `<annotationDir>/.dsh-reader.json` (source of truth) and
// are mirrored to `<annotationDir>/<chapter stem>.md` for humans and agents.
// Both files are written atomically (tmp file + rename).

import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// ── constants ──────────────────────────────────────────────────────────────

const ROUTE_PREFIX = "/api/dsh-reader";
const STORE_FILE = ".dsh-reader.json";
const HEAD_BYTES = 8 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_CHAPTER_BYTES = 2 * 1024 * 1024;
const FALLBACK_VERSION = "0.1.0";
const DEFAULT_PROMPT_TEMPLATE = "请按 {annotationFile} 中的批注修改 {chapterFile}。";
const DEFAULT_TYPES = ["事实", "逻辑", "文风", "结构", "删减", "疑问"];
const DEFAULT_CONCLUSIONS = ["采纳", "驳回", "转细纲", "暂缓"];
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const MARKDOWN_FILE = /\.(?:md|markdown)$/i;
const H1_HEADING = /^#\s+(.+?)\s*$/m;
const PACKAGE_JSON = join(dirname(fileURLToPath(import.meta.url)), "package.json");

// Natural, numeric-aware order for chapter file names ("第2章" before "第10章").
const chapterCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// ── small helpers ──────────────────────────────────────────────────────────

/** An HTTP failure that maps directly onto a JSON error response. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** True for `{...}` objects (and false for arrays / null). */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Convert a platform path into the POSIX form used by chapter ids. */
function toPosixPath(value) {
  return value.split(sep).join("/");
}

/** True when `target` is `base` itself or lives underneath it. */
function isWithin(base, target) {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Reject POSIX, Windows drive-letter, and UNC absolute paths. */
function isAbsoluteAnywhere(value) {
  return isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/** Strip the `.md` / `.markdown` suffix from a file name. */
function chapterStem(fileName) {
  return fileName.replace(MARKDOWN_FILE, "");
}

/** Collapse CR/LF and escape table-breaking pipes. */
function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/\r\n|[\r\n]/g, " ")
    .replace(/\|/g, "\\|");
}

/** Collapse embedded newlines for blockquote-style lines. */
function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\r\n|[\r\n]/g, " ")
    .trim();
}

/** Normalize newlines without touching the rest of the content. */
function normalizeNewlines(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

/** First non-empty string array, falling back to a copy of `fallback`. */
function stringArray(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const cleaned = value
    .filter((item) => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());
  return cleaned.length > 0 ? cleaned : [...fallback];
}

// ── config normalization ───────────────────────────────────────────────────

/**
 * Turn the raw Cordis `config` object into the internal settings shape.
 *
 * This is deliberately defensive: a missing root, a duplicate id or a broken
 * RegExp is collected in `errors` (surfaced by `/books`) instead of throwing,
 * so a bad profile entry can never stop the plugin from loading.
 *
 * @param {unknown} config raw plugin config from `cordis.patch.yml`
 * @returns {{
 *   libraries: Array<object>,
 *   errors: string[],
 *   annotation: { types: string[], conclusions: string[], locale: "zh"|"en" },
 *   pathBase: string|null,
 *   promptTemplate: string,
 *   maxChapterBytes: number,
 * }}
 */
function normalizeConfig(config) {
  const errors = [];
  if (config !== undefined && config !== null && !isPlainObject(config)) {
    errors.push("config must be an object; using defaults");
  }
  const source = isPlainObject(config) ? config : {};

  const annotationSource = isPlainObject(source.annotation) ? source.annotation : {};
  const annotation = {
    types: stringArray(annotationSource.types, DEFAULT_TYPES),
    conclusions: stringArray(annotationSource.conclusions, DEFAULT_CONCLUSIONS),
    locale:
      typeof annotationSource.locale === "string" &&
      annotationSource.locale.toLowerCase().startsWith("en")
        ? "en"
        : "zh",
  };

  const pathBase =
    typeof source.pathBase === "string" && source.pathBase.trim() !== ""
      ? resolve(process.cwd(), source.pathBase)
      : null;

  const libraries = [];
  const seenIds = new Set();
  if (source.libraries !== undefined && source.libraries !== null && !Array.isArray(source.libraries)) {
    errors.push("config.libraries must be an array of library objects");
  }
  const entries = Array.isArray(source.libraries) ? source.libraries : [];
  entries.forEach((entry, index) => {
    try {
      const library = normalizeLibrary(entry, index, pathBase, errors, seenIds);
      if (library !== null) {
        library.locale = annotation.locale;
        libraries.push(library);
      }
    } catch (error) {
      errors.push(`libraries[${index}]: ${error?.message ?? error}`);
    }
  });

  const maxChapterBytes = Number(source.maxChapterBytes);
  return {
    libraries,
    errors,
    annotation,
    pathBase,
    promptTemplate:
      typeof source.promptTemplate === "string" && source.promptTemplate.trim() !== ""
        ? source.promptTemplate
        : DEFAULT_PROMPT_TEMPLATE,
    maxChapterBytes:
      Number.isFinite(maxChapterBytes) && maxChapterBytes > 0
        ? Math.floor(maxChapterBytes)
        : DEFAULT_MAX_CHAPTER_BYTES,
  };
}

/**
 * Validate one `libraries[]` entry and resolve its paths.
 *
 * @returns {object|null} the normalized library, or `null` when invalid
 *   (the reason is appended to `errors`).
 */
function normalizeLibrary(entry, index, pathBase, errors, seenIds) {
  const fallbackId = `lib${index + 1}`;
  if (!isPlainObject(entry)) {
    errors.push(`libraries[${index}] is not an object`);
    return null;
  }

  const rootValue = typeof entry.root === "string" ? entry.root.trim() : "";
  const id =
    typeof entry.id === "string" && entry.id.trim() !== "" ? entry.id.trim() : fallbackId;
  if (rootValue === "") {
    errors.push(`library "${id}": root is required`);
    return null;
  }
  if (seenIds.has(id)) {
    errors.push(`library "${id}": duplicate id`);
    return null;
  }
  if (entry.annotationDir !== undefined && typeof entry.annotationDir !== "string") {
    errors.push(`library "${id}": annotationDir must be a string`);
    return null;
  }

  const include = compilePatterns(entry.include, "include", id, errors);
  const exclude = compilePatterns(entry.exclude, "exclude", id, errors);
  if (include === null || exclude === null) return null;

  const root = resolve(process.cwd(), rootValue);
  const annotationDir =
    typeof entry.annotationDir === "string" && entry.annotationDir.trim() !== ""
      ? resolve(root, entry.annotationDir.trim())
      : join(root, "annotations");

  seenIds.add(id);
  return {
    id,
    title:
      typeof entry.title === "string" && entry.title.trim() !== ""
        ? entry.title.trim()
        : basename(root) || id,
    root,
    annotationDir,
    recursive: entry.recursive === true,
    include,
    exclude,
    pathBase,
  };
}

/**
 * Compile `include` / `exclude` RegExp sources.
 *
 * @returns {RegExp[]|null} `null` when the list is invalid (already reported).
 */
function compilePatterns(value, label, libraryId, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push(`library "${libraryId}": ${label} must be an array of RegExp source strings`);
    return null;
  }
  const patterns = [];
  for (const source of value) {
    if (typeof source !== "string") {
      errors.push(`library "${libraryId}": ${label} entries must be strings`);
      return null;
    }
    try {
      patterns.push(new RegExp(source));
    } catch (error) {
      errors.push(
        `library "${libraryId}": ${label} has an invalid RegExp ${JSON.stringify(source)} (${error.message})`,
      );
      return null;
    }
  }
  return patterns;
}

// ── chapter discovery and title extraction ─────────────────────────────────

/** Read at most the first 8 KiB of a file (enough for the H1 heading). */
async function readHead(absPath, size) {
  const length = Number.isFinite(size) ? Math.min(size, HEAD_BYTES) : HEAD_BYTES;
  if (length <= 0) return "";
  const handle = await open(absPath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return decodeHead(buffer.subarray(0, bytesRead), size > length);
  } finally {
    await handle.close();
  }
}

/** Decode a UTF-8 head buffer, dropping a half-read final line. */
function decodeHead(buffer, truncated) {
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (truncated) {
    const lastNewline = text.lastIndexOf("\n");
    text = lastNewline === -1 ? "" : text.slice(0, lastNewline);
  }
  return text;
}

/**
 * Chapter title = first `# ` heading, else the file stem.
 *
 * @param {string} text text to scan (only the head is needed)
 * @param {string} fallback file stem
 */
function titleFromText(text, fallback) {
  if (typeof text === "string") {
    const match = H1_HEADING.exec(text);
    if (match !== null) {
      const heading = match[1].trim();
      if (heading !== "") return heading;
    }
  }
  return fallback;
}

/** A chapter's annotation markdown file name (`<stem>.md`). */
function annotationFileFor(chapter) {
  return `${chapterStem(chapter.name)}.md`;
}

/**
 * Path spelling handed to the browser for prompts.
 *
 * With `pathBase` configured this is relative to it (POSIX separators), which
 * keeps prompt text independent of the machine's home directory. Otherwise the
 * absolute annotation path is returned.
 */
function annotationPathFor(library, annotationFile) {
  if (library.pathBase === null) return join(library.annotationDir, annotationFile);
  const rel = toPosixPath(relative(library.pathBase, library.annotationDir));
  return rel === "" ? annotationFile : `${rel}/${annotationFile}`;
}

/** True when the annotation directory is a proper subtree of the library. */
function isAnnotationSubtree(library, absPath) {
  if (library.annotationDir === library.root) return false;
  return isWithin(library.root, library.annotationDir) && isWithin(library.annotationDir, absPath);
}

/**
 * Follow symlinks and confirm the real file still sits inside the real root.
 * Used as defence in depth next to the plain `path.relative` check.
 */
async function escapesViaSymlink(root, absPath) {
  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(absPath)]);
    return !isWithin(realRoot, realFile);
  } catch {
    return false;
  }
}

/**
 * Walk a library root and collect chapter files.
 *
 * Skips dotfiles, non-markdown files, and the annotation directory subtree;
 * descends into subdirectories only when `recursive` is enabled; applies
 * `include` / `exclude` to the library-relative POSIX path; finally sorts by
 * file name with the natural collator.
 */
async function collectChapterFiles(library) {
  const found = [];
  const queue = [{ dir: library.root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (depth === 0) throw error;
      continue; // an unreadable subdirectory must not hide the whole library
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absPath = join(dir, entry.name);
      if (isAnnotationSubtree(library, absPath)) continue;
      if (entry.isDirectory()) {
        if (library.recursive) queue.push({ dir: absPath, depth: depth + 1 });
        continue;
      }
      if (!MARKDOWN_FILE.test(entry.name)) continue;

      const id = toPosixPath(relative(library.root, absPath));
      if (id.split("/").some((segment) => segment.startsWith("."))) continue;
      if (library.include.length > 0 && !library.include.some((pattern) => pattern.test(id))) {
        continue;
      }
      if (library.exclude.some((pattern) => pattern.test(id))) continue;
      found.push({ absPath, id, name: entry.name });
    }
  }

  found.sort(
    (a, b) => chapterCollator.compare(a.name, b.name) || chapterCollator.compare(a.id, b.id),
  );
  return found;
}

/** Build the JSON entry for one chapter file. */
async function describeChapter(library, file) {
  let info;
  try {
    info = await stat(file.absPath);
  } catch {
    return null; // raced with a delete between readdir and stat
  }
  if (!info.isFile()) return null;
  if (await escapesViaSymlink(library.root, file.absPath)) return null;

  const stem = chapterStem(file.name);
  const head = await readHead(file.absPath, info.size).catch(() => "");
  const title = titleFromText(head, stem);
  const annotationFile = `${stem}.md`;
  return {
    id: file.id,
    title,
    size: info.size,
    mtime: Number.isFinite(info.mtimeMs) ? Math.trunc(info.mtimeMs) : 0,
    annotationFile,
    annotationPath: annotationPathFor(library, annotationFile),
  };
}

/** `/books`: one library with its chapters, or a per-library error message. */
async function describeLibrary(library) {
  let rootInfo;
  try {
    rootInfo = await stat(library.root);
  } catch (error) {
    throw new Error(
      `library "${library.id}": root is not accessible (${library.root}): ${error?.code ?? error?.message ?? error}`,
    );
  }
  if (!rootInfo.isDirectory()) {
    throw new Error(`library "${library.id}": root is not a directory (${library.root})`);
  }

  let files;
  try {
    files = await collectChapterFiles(library);
  } catch (error) {
    throw new Error(
      `library "${library.id}": cannot list root (${library.root}): ${error?.message ?? error}`,
    );
  }

  const described = await Promise.all(files.map((file) => describeChapter(library, file)));
  return {
    id: library.id,
    title: library.title,
    root: library.root,
    annotationDir: library.annotationDir,
    chapters: described.filter((chapter) => chapter !== null),
  };
}

// ── chapter path safety ────────────────────────────────────────────────────

/**
 * Resolve a browser-supplied chapter id inside its library.
 *
 * Rejects absolute ids, traversal, hidden/annotation paths, non-markdown
 * names, non-regular files, and symlinks that resolve outside the root.
 *
 * @returns {Promise<{absPath: string, id: string, name: string, stem: string,
 *   size: number, mtime: number}>}
 */
async function resolveChapter(library, fileParam) {
  if (typeof fileParam !== "string" || fileParam === "") {
    throw new HttpError(400, "missing file parameter");
  }
  if (fileParam.includes("\0")) throw new HttpError(400, "invalid file parameter");
  if (isAbsoluteAnywhere(fileParam)) {
    throw new HttpError(403, "absolute paths are not allowed");
  }

  const absPath = resolve(library.root, fileParam);
  const rel = relative(library.root, absPath);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new HttpError(403, "path escapes the library root");
  }
  const segments = rel.split(sep);
  if (segments.some((segment) => segment.startsWith("."))) {
    throw new HttpError(404, "unknown-chapter");
  }
  if (isAnnotationSubtree(library, absPath)) throw new HttpError(404, "unknown-chapter");
  if (!MARKDOWN_FILE.test(absPath)) throw new HttpError(404, "unknown-chapter");

  let info;
  try {
    info = await stat(absPath);
  } catch {
    throw new HttpError(404, "unknown-chapter");
  }
  if (!info.isFile()) throw new HttpError(404, "unknown-chapter");
  if (await escapesViaSymlink(library.root, absPath)) {
    throw new HttpError(403, "path escapes the library root");
  }

  const name = basename(absPath);
  return {
    absPath,
    id: toPosixPath(rel),
    name,
    stem: chapterStem(name),
    size: info.size,
    mtime: Number.isFinite(info.mtimeMs) ? Math.trunc(info.mtimeMs) : 0,
  };
}

/** Find a configured library by id or fail with 404. */
function findLibrary(settings, id) {
  const library = settings.libraries.find((candidate) => candidate.id === id);
  if (library === undefined) throw new HttpError(404, "unknown-library");
  return library;
}

// ── annotation store ───────────────────────────────────────────────────────

/** A store value with a null prototype, so odd chapter ids cannot pollute. */
function emptyStore() {
  return { version: 1, chapters: Object.create(null) };
}

/** Canonicalize one stored comment; unknown fields are dropped. */
function normalizeComment(raw) {
  return {
    id: String(raw.id),
    type: typeof raw.type === "string" ? raw.type : "",
    conclusion: typeof raw.conclusion === "string" ? raw.conclusion : "",
    quote: typeof raw.quote === "string" ? raw.quote : "",
    block: Number.isFinite(raw.block) ? Math.trunc(raw.block) : null,
    note: typeof raw.note === "string" ? raw.note : "",
    resolved: raw.resolved === true,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

/** Canonicalize a stored chapter entry. */
function normalizeChapterEntry(raw) {
  if (!isPlainObject(raw)) return { source: "", updatedAt: 0, comments: [] };
  return {
    source: typeof raw.source === "string" ? raw.source : "",
    updatedAt: Number.isFinite(raw.updatedAt) ? Math.trunc(raw.updatedAt) : 0,
    comments: Array.isArray(raw.comments)
      ? raw.comments
          .filter((comment) => isPlainObject(comment) && typeof comment.id === "string" && comment.id !== "")
          .map(normalizeComment)
      : [],
  };
}

/**
 * Load `.dsh-reader.json`.
 *
 * A missing file means "no annotations yet"; a corrupt file is a 500 so the
 * user never silently loses their notes to a reset.
 */
async function loadAnnotationStore(annotationDir) {
  const storePath = join(annotationDir, STORE_FILE);
  let raw;
  try {
    raw = await readFile(storePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return emptyStore();
    throw new HttpError(500, `cannot read annotation store: ${error?.message ?? error}`);
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(500, `annotation store is corrupt (${storePath}): invalid JSON`);
  }
  if (!isPlainObject(parsed)) {
    throw new HttpError(500, `annotation store is corrupt (${storePath}): expected an object`);
  }
  if (parsed.chapters !== undefined && !isPlainObject(parsed.chapters)) {
    throw new HttpError(500, `annotation store is corrupt (${storePath}): "chapters" must be an object`);
  }

  const store = emptyStore();
  const chapters = isPlainObject(parsed.chapters) ? parsed.chapters : {};
  for (const [chapterId, entry] of Object.entries(chapters)) {
    store.chapters[chapterId] = normalizeChapterEntry(entry);
  }
  return store;
}

/** Persist the store atomically. */
async function saveAnnotationStore(annotationDir, store) {
  const text = `${JSON.stringify({ version: 1, chapters: store.chapters }, null, 2)}\n`;
  await writeFileAtomic(join(annotationDir, STORE_FILE), text);
}

/**
 * Write a text file atomically: write a sibling `*.tmp`, then rename it over
 * the destination. A crash can leave the tmp file behind, never a truncated
 * destination.
 */
async function writeFileAtomic(target, contents) {
  const dir = dirname(target);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(
    dir,
    `.${basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  try {
    await writeFile(tmpPath, contents, "utf8");
    await rename(tmpPath, target);
  } catch (error) {
    try {
      await rm(tmpPath, { force: true });
    } catch {
      // best effort — the original error is more useful
    }
    throw error;
  }
}

// ── annotation markdown export ─────────────────────────────────────────────

/** Localized label for a comment's block position. */
function positionLabel(comment, chinese) {
  if (Number.isInteger(comment.block)) {
    return chinese ? `第 ${comment.block} 段` : `Paragraph ${comment.block}`;
  }
  return chinese ? "全文" : "Whole text";
}

function typeLabel(comment, chinese) {
  return comment.type !== "" ? comment.type : chinese ? "未分类" : "Uncategorized";
}

function conclusionLabel(comment, chinese) {
  return comment.conclusion !== "" ? comment.conclusion : chinese ? "未定" : "Undecided";
}

function statusLabel(comment, chinese) {
  if (comment.resolved) return chinese ? "已结案" : "Resolved";
  return chinese ? "未结案" : "Open";
}

/** `A1｜第 12 段｜文风｜采纳` (or the ` · ` form in English). */
function detailHeading(comment, chinese) {
  const parts = [
    comment.id,
    positionLabel(comment, chinese),
    typeLabel(comment, chinese),
    conclusionLabel(comment, chinese),
  ];
  return parts.join(chinese ? "｜" : " · ");
}

/**
 * Render `<annotationDir>/<chapter stem>.md`.
 *
 * The layout is the one documented in `docs/API.md`: a title line, provenance
 * blockquote, counts, a summary table, then a detail section per comment. The
 * output always uses `\n` newlines and ends with exactly one newline.
 *
 * @param {{ title: string, chapterId: string, comments: object[], locale: "zh"|"en" }} input
 * @returns {string}
 */
function renderAnnotationMarkdown({ title, chapterId, comments, locale }) {
  const chinese = locale !== "en";
  const openCount = comments.filter((comment) => !comment.resolved).length;
  const lines = [];

  lines.push(`# ${title} — ${chinese ? "批注" : "Annotations"}`);
  lines.push("");
  if (chinese) {
    lines.push(`> 源文件：\`${chapterId}\``);
    lines.push("> 机器可读数据：`.dsh-reader.json`");
  } else {
    lines.push(`> Source file: \`${chapterId}\``);
    lines.push("> Machine-readable data: `.dsh-reader.json`");
  }
  lines.push("");
  if (chinese) {
    lines.push(`共 ${comments.length} 条，未结案 ${openCount} 条。`);
  } else {
    const noun = comments.length === 1 ? "comment" : "comments";
    lines.push(`${comments.length} ${noun}, ${openCount} open.`);
  }
  lines.push("");

  const headers = chinese
    ? ["编号", "位置", "类型", "内容", "结论", "状态"]
    : ["ID", "Location", "Type", "Content", "Conclusion", "Status"];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const comment of comments) {
    const cells = [
      comment.id,
      positionLabel(comment, chinese),
      typeLabel(comment, chinese),
      comment.note,
      conclusionLabel(comment, chinese),
      statusLabel(comment, chinese),
    ];
    lines.push(`| ${cells.map(escapeTableCell).join(" | ")} |`);
  }

  lines.push("");
  lines.push(chinese ? "## 明细" : "## Details");
  for (const comment of comments) {
    lines.push("");
    lines.push(`### ${detailHeading(comment, chinese)}`);
    const quote = collapseWhitespace(comment.quote);
    if (quote !== "") {
      lines.push("");
      lines.push(chinese ? `> 原文：「${quote}」` : `> Quote: “${quote}”`);
    }
    const note = normalizeNewlines(comment.note).trimEnd();
    if (note !== "") {
      lines.push("");
      lines.push(note);
    }
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/** Rebuild the markdown export for one chapter from the stored comments. */
async function writeAnnotationExport(library, chapter, entry) {
  const head = await readHead(chapter.absPath, chapter.size).catch(() => "");
  const title = titleFromText(head, chapter.stem);
  const markdown = renderAnnotationMarkdown({
    title,
    chapterId: chapter.id,
    comments: entry.comments,
    locale: library.locale,
  });
  await writeFileAtomic(join(library.annotationDir, `${chapter.stem}.md`), markdown);
}

/** Next free `A<n>` id: max existing numeric suffix + 1. */
function nextCommentId(comments) {
  let max = 0;
  for (const comment of comments) {
    const match = /^A(\d+)$/.exec(comment.id);
    if (match !== null) max = Math.max(max, Number(match[1]));
  }
  return `A${max + 1}`;
}

/** Pick only the comment fields a client is allowed to set. */
function sanitizeCommentFields(input) {
  const fields = {};
  if (typeof input.type === "string") fields.type = input.type.trim();
  if (typeof input.conclusion === "string") fields.conclusion = input.conclusion.trim();
  if (typeof input.quote === "string") fields.quote = input.quote;
  if (typeof input.note === "string") fields.note = input.note;
  if (typeof input.block === "number" && Number.isFinite(input.block)) {
    fields.block = Math.trunc(input.block);
  } else if (input.block === null) {
    fields.block = null;
  }
  return fields;
}

/** The `GET /annotations` / POST response body. */
function annotationResponse(library, chapter, comments) {
  const annotationFile = annotationFileFor(chapter);
  return {
    comments,
    annotationFile,
    annotationPath: annotationPathFor(library, annotationFile),
  };
}

// ── route handlers ─────────────────────────────────────────────────────────

/** `/health` payload. */
async function handleHealth(settings) {
  return {
    ok: true,
    version: await readOwnVersion(),
    libraries: settings.libraries.length,
  };
}

/** `/books`: list every readable library, collecting per-library failures. */
async function handleBooks(settings) {
  const libraries = [];
  const errors = [...settings.errors];
  for (const library of settings.libraries) {
    try {
      libraries.push(await describeLibrary(library));
    } catch (error) {
      errors.push(String(error?.message ?? error));
    }
  }
  return {
    libraries,
    annotation: {
      types: [...settings.annotation.types],
      conclusions: [...settings.annotation.conclusions],
      locale: settings.annotation.locale,
    },
    promptTemplate: settings.promptTemplate,
    errors,
  };
}

/** `/chapter`: read one markdown file, refusing to truncate oversized ones. */
async function handleChapter(settings, url) {
  const libId = url.searchParams.get("lib");
  const fileParam = url.searchParams.get("file");
  if (libId === null || libId === "") throw new HttpError(400, "missing lib parameter");
  const library = findLibrary(settings, libId);
  const chapter = await resolveChapter(library, fileParam);

  if (chapter.size > settings.maxChapterBytes) {
    throw new HttpError(
      400,
      `chapter is too large: ${chapter.size} bytes exceeds the ${settings.maxChapterBytes}-byte limit (maxChapterBytes)`,
    );
  }

  let text;
  try {
    text = await readFile(chapter.absPath, "utf8");
  } catch (error) {
    throw new HttpError(500, `cannot read chapter: ${error?.message ?? error}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { id: chapter.id, title: titleFromText(text, chapter.stem), text };
}

/** `/annotations` (GET): comments plus the paths the browser shows. */
async function handleAnnotationsList(settings, url) {
  const libId = url.searchParams.get("lib");
  const fileParam = url.searchParams.get("file");
  if (libId === null || libId === "") throw new HttpError(400, "missing lib parameter");
  const library = findLibrary(settings, libId);
  const chapter = await resolveChapter(library, fileParam);

  const store = await loadAnnotationStore(library.annotationDir);
  const entry = store.chapters[chapter.id];
  return annotationResponse(library, chapter, entry === undefined ? [] : entry.comments);
}

/** `/annotations` (POST): save / delete / resolve, then regenerate the export. */
async function handleAnnotationsWrite(settings, req) {
  const body = await readJsonBody(req);
  if (!isPlainObject(body)) throw new HttpError(400, "request body must be a JSON object");

  const libId = typeof body.lib === "string" ? body.lib : "";
  if (libId === "") throw new HttpError(400, "missing lib");
  const library = findLibrary(settings, libId);
  const chapter = await resolveChapter(library, body.file);

  const op = body.op;
  if (op !== "save" && op !== "delete" && op !== "resolve") {
    throw new HttpError(400, "unknown op");
  }

  const store = await loadAnnotationStore(library.annotationDir);
  const now = Date.now();
  const existingEntry = store.chapters[chapter.id];
  const entry = existingEntry === undefined
    ? { source: chapter.absPath, updatedAt: now, comments: [] }
    : existingEntry;
  entry.source = chapter.absPath;
  const comments = entry.comments;

  if (op === "save") {
    if (!isPlainObject(body.comment)) throw new HttpError(400, "comment must be an object");
    const patch = sanitizeCommentFields(body.comment);
    const requestedId =
      typeof body.comment.id === "string" && body.comment.id !== "" ? body.comment.id : null;

    if (requestedId === null) {
      comments.push(
        normalizeComment({
          ...patch,
          id: nextCommentId(comments),
          resolved: body.comment.resolved === true,
          createdAt: now,
          updatedAt: now,
        }),
      );
    } else {
      const index = comments.findIndex((comment) => comment.id === requestedId);
      if (index === -1) throw new HttpError(404, "unknown comment");
      const previous = comments[index];
      comments[index] = normalizeComment({
        ...previous,
        ...patch,
        id: previous.id,
        resolved:
          typeof body.comment.resolved === "boolean"
            ? body.comment.resolved
            : previous.resolved,
        createdAt: previous.createdAt,
        updatedAt: now,
      });
    }
  } else if (op === "delete") {
    if (typeof body.id !== "string" || body.id === "") {
      throw new HttpError(400, "missing comment id");
    }
    const index = comments.findIndex((comment) => comment.id === body.id);
    if (index === -1) throw new HttpError(404, "unknown comment");
    comments.splice(index, 1);
  } else {
    if (typeof body.id !== "string" || body.id === "") {
      throw new HttpError(400, "missing comment id");
    }
    if (typeof body.resolved !== "boolean") {
      throw new HttpError(400, "resolved must be a boolean");
    }
    const target = comments.find((comment) => comment.id === body.id);
    if (target === undefined) throw new HttpError(404, "unknown comment");
    target.resolved = body.resolved;
    target.updatedAt = now;
  }

  entry.updatedAt = now;
  store.chapters[chapter.id] = entry;
  await saveAnnotationStore(library.annotationDir, store);
  await writeAnnotationExport(library, chapter, entry);
  return annotationResponse(library, chapter, comments);
}

// ── HTTP plumbing ──────────────────────────────────────────────────────────

/**
 * Read and parse a JSON request body; `undefined` means "not JSON" (or a body
 * above the cap, which is intentionally treated as a bad request).
 */
function readJsonBody(req) {
  return new Promise((resolveBody) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolveBody(value);
    };
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        finish(undefined);
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      try {
        finish(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        finish(undefined);
      }
    });
    req.on("error", () => finish(undefined));
  });
}

/** Send JSON with the headers every dsh-reader response carries. */
function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(payload)),
    "cache-control": "no-store",
  });
  res.end(payload);
}

/** Map `/api/dsh-reader/...` to the bare route name. */
function routeOf(pathname) {
  let route = pathname;
  if (route === ROUTE_PREFIX) {
    route = "";
  } else if (route.startsWith(`${ROUTE_PREFIX}/`)) {
    route = route.slice(ROUTE_PREFIX.length + 1);
  }
  return route.replace(/\/+$/, "");
}

/** Read the plugin version once; fall back to a constant on any failure. */
let versionPromise = null;
function readOwnVersion() {
  if (versionPromise === null) {
    versionPromise = (async () => {
      try {
        const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
        return typeof pkg.version === "string" && pkg.version !== ""
          ? pkg.version
          : FALLBACK_VERSION;
      } catch {
        return FALLBACK_VERSION;
      }
    })();
  }
  return versionPromise;
}

/**
 * Build the raw `(req, res) => Promise<void>` handler registered with
 * `ctx.webServer.register`.
 *
 * The handler mirrors the explorer plugin's guards: loopback host only,
 * GET/HEAD/POST only, a JSON body reader for POST. Every code path ends the
 * response, and every response is JSON with `cache-control: no-store`.
 */
function createHandler(settings) {
  return async function handler(req, res) {
    const method = String(req?.method ?? "GET").toUpperCase();
    try {
      if (method !== "GET" && method !== "HEAD" && method !== "POST") {
        throw new HttpError(405, "method not allowed");
      }
      // Loopback-only: this route serves local workspace files.
      const host = String(req?.headers?.host ?? "");
      if (!LOOPBACK_HOST.test(host)) throw new HttpError(403, "forbidden host");

      const url = new URL(req?.url ?? "/", "http://127.0.0.1");
      const route = routeOf(url.pathname);
      let payload;

      switch (route) {
        case "health":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleHealth(settings);
          break;
        case "books":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleBooks(settings);
          break;
        case "chapter":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleChapter(settings, url);
          break;
        case "annotations":
          payload =
            method === "POST"
              ? await handleAnnotationsWrite(settings, req)
              : await handleAnnotationsList(settings, url);
          break;
        default:
          throw new HttpError(404, "unknown-endpoint");
      }

      sendJson(res, 200, payload);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
      } else {
        sendJson(res, 500, { error: String(error?.message ?? error) });
      }
    }
  };
}

// ── plugin entry point ─────────────────────────────────────────────────────

export const name = "dsh-reader";
export const inject = ["webServer"];

/**
 * Cordis entry point: normalize config, then register the prefixed route.
 *
 * Configuration problems never throw here — they are reported by `/books` — so
 * a broken profile row cannot stop the host from loading.
 *
 * @param {object} ctx Cordis context (needs `webServer`)
 * @param {object} [config] plugin config
 */
export function apply(ctx, config) {
  let settings;
  try {
    settings = normalizeConfig(config);
  } catch {
    settings = normalizeConfig(undefined);
  }

  if (ctx === null || ctx === undefined) return;
  if (ctx.webServer === undefined || typeof ctx.webServer.register !== "function") return;

  const handler = createHandler(settings);
  const register = () =>
    ctx.webServer.register({
      kind: "prefix",
      path: ROUTE_PREFIX,
      handler,
    });

  try {
    if (typeof ctx.effect === "function") ctx.effect(register);
    else register();
  } catch (error) {
    // Never let a host registration problem look like a config failure.
    console.warn(`[dsh-reader] failed to register HTTP routes: ${error?.message ?? error}`);
  }
}
