// dsh_reader — host half.
//
// Serves a markdown book reader and its annotation store behind one prefix
// route on the DSH Web GUI:
//
//   GET  /api/dsh_reader/health       -> { ok, version, libraries }
//   GET  /api/dsh_reader/config       -> { version, pathBase, annotation, libraries, ... }
//   GET  /api/dsh_reader/books        -> { libraries, annotation, promptTemplate, errors }
//   GET  /api/dsh_reader/resolve      -> { mode, path, bookRoot, chapters, index, ... }
//   GET  /api/dsh_reader/chapter      -> { id, title, text }
//   GET  /api/dsh_reader/annotations  -> { comments, annotationFile, annotationPath }
//   POST /api/dsh_reader/annotations  -> same shape, after save/delete/resolve
//
// Loopback only: the route reads local files from configured library roots.
// Every library path coming from the browser is resolved and checked against
// its root; escapes are rejected with 403. Ad-hoc reads accept one explicit
// absolute markdown file (exactly what the Sidebar handed us).
//
// Annotations live in `<annotationDir>/.dsh_reader.json` (source of truth) and
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

const ROUTE_PREFIX = "/api/dsh_reader";
const STORE_FILE = ".dsh_reader.json";
const HEAD_BYTES = 8 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_MAX_CHAPTER_BYTES = 2 * 1024 * 1024;
const FALLBACK_VERSION = "0.1.0";
const DEFAULT_PROMPT_TEMPLATE_ZH = "请按 {annotationFile} 中的批注修改 {chapterFile}。";
const DEFAULT_PROMPT_TEMPLATE_EN = "Revise {chapterFile} according to {annotationFile}.";
const CHAPTER_ORDERS = new Set(["auto", "filename", "mtime"]);
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const MARKDOWN_FILE = /\.(?:md|markdown)$/i;
const H1_HEADING = /^#\s+(.+?)\s*$/m;
const FRONTMATTER_KEY = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/;
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

// ── config normalization ───────────────────────────────────────────────────

/**
 * Turn the raw Cordis `config` object into the internal settings shape.
 *
 * This is deliberately defensive: a missing root, a duplicate id or a broken
 * RegExp is collected in `errors` (surfaced by `/config` and `/books`) instead
 * of throwing, so a bad profile entry can never stop the plugin from loading.
 *
 * @param {unknown} config raw plugin config from `cordis.patch.yml`
 * @returns {{
 *   libraries: Array<object>,
 *   errors: string[],
 *   annotation: { locale: "zh"|"en" },
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

  const defaultPrompt =
    annotation.locale === "en" ? DEFAULT_PROMPT_TEMPLATE_EN : DEFAULT_PROMPT_TEMPLATE_ZH;
  const maxChapterBytes = Number(source.maxChapterBytes);
  return {
    libraries,
    errors,
    annotation,
    pathBase,
    promptTemplate:
      typeof source.promptTemplate === "string" && source.promptTemplate.trim() !== ""
        ? source.promptTemplate
        : defaultPrompt,
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

  let order = "auto";
  if (entry.order !== undefined && entry.order !== null) {
    const value = typeof entry.order === "string" ? entry.order.trim().toLowerCase() : "";
    if (CHAPTER_ORDERS.has(value)) {
      order = value;
    } else {
      errors.push(`library "${id}": order must be one of auto, filename, mtime; using "auto"`);
    }
  }

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
    order,
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

/** Strip one pair of matching YAML quotes from a scalar value. */
function unquoteFrontmatterValue(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

/**
 * Parse a leading `---` … `---` frontmatter block.
 *
 * Only the two fields this plugin understands are exposed: `title` (string)
 * and `order` (finite number). The block is treated as frontmatter only when a
 * closing fence exists *and* it looks like YAML keys, matching the browser
 * half's `stripFrontmatter`; a leading `---` scene break therefore stays part
 * of the chapter text.
 *
 * @param {string} text the 8 KiB head (or a whole chapter)
 * @returns {{ title: string|null, order: number|null, body: string }}
 */
function parseFrontmatter(text) {
  const source = typeof text === "string" ? text : "";
  const none = { title: null, order: null, body: source };
  const lines = source.split("\n");
  if (lines.length < 2 || lines[0].trim() !== "---") return none;

  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === "---" || line === "...") {
      end = index;
      break;
    }
  }
  if (end === -1) return none;

  const block = lines.slice(1, end);
  if (!block.some((line) => FRONTMATTER_KEY.test(line.trim()))) return none;

  let title = null;
  let order = null;
  for (const line of block) {
    const match = FRONTMATTER_KEY.exec(line.trim());
    if (match === null) continue;
    const key = match[1].toLowerCase();
    const raw = match[2].trim();
    if (raw === "") continue;
    if (key === "title") {
      const value = unquoteFrontmatterValue(raw);
      if (value !== "") title = value;
    } else if (key === "order") {
      const value = Number(unquoteFrontmatterValue(raw));
      if (Number.isFinite(value)) order = value;
    }
  }

  return { title, order, body: lines.slice(end + 1).join("\n") };
}

/**
 * Resolve chapter title and order from file text.
 *
 * Title precedence: frontmatter `title` > first `# ` heading > file stem.
 *
 * @param {string} text the head (or whole chapter)
 * @param {string} fallback file stem
 * @returns {{ title: string, order: number|null }}
 */
function chapterMeta(text, fallback) {
  const meta = parseFrontmatter(text);
  return {
    title: meta.title !== null ? meta.title : titleFromText(meta.body, fallback),
    order: meta.order,
  };
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

/**
 * Path spelling for the chapter itself, used by `{chapterFile}` in prompts.
 *
 * Follows `pathBase` exactly like `annotationPathFor`, so the copied prompt
 * carries project-relative paths that read well in the chat.
 */
function chapterPathFor(library, chapterId) {
  const absolute = join(library.root, chapterId.split("/").join(sep));
  if (library.pathBase === null) return absolute;
  return toPosixPath(relative(library.pathBase, absolute));
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
 * `include` / `exclude` to the library-relative POSIX path. Sorting happens
 * later, once each chapter's frontmatter order is known.
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

  return found;
}

/** Build the JSON entry for one chapter file (plus internal sort fields). */
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
  const meta = chapterMeta(head, stem);
  const annotationFile = `${stem}.md`;
  return {
    id: file.id,
    title: meta.title,
    order: meta.order,
    size: info.size,
    mtime: Number.isFinite(info.mtimeMs) ? Math.trunc(info.mtimeMs) : 0,
    annotationFile,
    annotationPath: annotationPathFor(library, annotationFile),
    chapterPath: chapterPathFor(library, file.id),
    // Internal fields, stripped before the entry reaches the browser.
    name: file.name,
  };
}

/** Natural file-name order (`第2章` before `第10章`). */
function naturalCompare(a, b) {
  return (
    chapterCollator.compare(a.name, b.name) || chapterCollator.compare(a.id, b.id)
  );
}

/**
 * Comparator for one library's `order` mode.
 *
 * `auto` puts finite frontmatter orders first (ascending), then ties and
 * order-less files follow natural file-name order. `filename` ignores
 * frontmatter entirely; `mtime` sorts by modification time, ties by name.
 */
function chapterComparator(order) {
  if (order === "filename") return naturalCompare;
  if (order === "mtime") {
    return (a, b) => a.mtime - b.mtime || naturalCompare(a, b);
  }
  return (a, b) => {
    if (a.order !== null && b.order !== null) {
      return a.order - b.order || naturalCompare(a, b);
    }
    if (a.order !== null) return -1;
    if (b.order !== null) return 1;
    return naturalCompare(a, b);
  };
}

/**
 * List one library's chapters, sorted according to its `order` config.
 *
 * The returned objects are exactly the `/books` chapter shape (`order` is the
 * frontmatter order or `null`), so `/resolve` can hand them to the browser
 * unchanged.
 */
async function listChapters(library) {
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
  const chapters = described.filter((chapter) => chapter !== null);
  chapters.sort(chapterComparator(library.order));
  return chapters.map(({ name, ...chapter }) => chapter);
}

/** `/books`: one library with its chapters, or a per-library error message. */
async function describeLibrary(library) {
  return {
    id: library.id,
    title: library.title,
    root: library.root,
    annotationDir: library.annotationDir,
    chapters: await listChapters(library),
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

// ── ad-hoc file resolution ─────────────────────────────────────────────────

/** True when any path segment names a dotfile / hidden directory. */
function hasHiddenSegment(value) {
  return value
    .split(/[\\/]+/)
    .some(
      (segment) =>
        segment !== "" &&
        segment !== "." &&
        segment !== ".." &&
        segment.startsWith("."),
    );
}

/** `stat` that returns `null` instead of throwing. */
async function statOrNull(absPath) {
  try {
    return await stat(absPath);
  } catch {
    return null;
  }
}

/**
 * Resolve a browser-supplied ad-hoc path to one readable markdown file.
 *
 * Order: absolute → as-is; otherwise `pathBase` + path; when that does not
 * exist and the path is relative, each library root with the path, then with
 * the bare basename. The final file must be a non-hidden, regular
 * `.md`/`.markdown` file.
 *
 * @param {object} settings normalized settings
 * @param {string} rawPath decoded `path` query value
 * @param {{requireAbsolute?: boolean}} [options]
 * @returns {Promise<{absPath: string, info: import("node:fs").Stats}>}
 */
async function resolveAdhocFile(settings, rawPath, options = {}) {
  if (typeof rawPath !== "string" || rawPath === "") {
    throw new HttpError(400, "missing path parameter");
  }
  if (rawPath.includes("\0")) throw new HttpError(400, "invalid path parameter");

  const absolute = isAbsoluteAnywhere(rawPath);
  if (options.requireAbsolute === true && !absolute) {
    throw new HttpError(400, "path must be absolute");
  }

  let candidate = null;
  if (absolute) {
    candidate = resolve(rawPath);
  } else if (settings.pathBase !== null) {
    candidate = resolve(settings.pathBase, rawPath);
  }

  if (candidate === null || (await statOrNull(candidate)) === null) {
    candidate = null;
    if (!absolute) {
      for (const library of settings.libraries) {
        for (const attempt of [
          resolve(library.root, rawPath),
          resolve(library.root, basename(rawPath)),
        ]) {
          if ((await statOrNull(attempt)) !== null) {
            candidate = attempt;
            break;
          }
        }
        if (candidate !== null) break;
      }
    }
  }

  if (candidate === null) throw new HttpError(404, "unknown-file");
  // Only the requested path is checked for hidden segments; an absolute
  // address may legitimately live under a dot-directory chosen by the user.
  if (basename(candidate).startsWith(".")) throw new HttpError(404, "unknown-file");
  if (!absolute && hasHiddenSegment(rawPath)) throw new HttpError(404, "unknown-file");
  if (!MARKDOWN_FILE.test(candidate)) throw new HttpError(404, "unknown-file");

  const info = await statOrNull(candidate);
  if (info === null || !info.isFile()) throw new HttpError(404, "unknown-file");
  return { absPath: candidate, info };
}

/**
 * Build the ad-hoc chapter list for one file's directory.
 *
 * Only direct `.md`/`.markdown` regular files are considered, dotfiles are
 * skipped, and a sibling `<stem>.md` that is this file's annotation export is
 * not offered as a chapter. Entries are sorted naturally by file name.
 */
async function listAdhocChapters(absPath) {
  const bookRoot = dirname(absPath);
  const ownExport = `${chapterStem(basename(absPath))}.md`;

  let entries;
  try {
    entries = await readdir(bookRoot, { withFileTypes: true });
  } catch (error) {
    throw new HttpError(404, `cannot list book directory: ${error?.message ?? error}`);
  }

  const found = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!MARKDOWN_FILE.test(entry.name)) continue;
    const candidate = join(bookRoot, entry.name);
    if (candidate !== absPath && entry.name === ownExport) continue;

    const info = await statOrNull(candidate);
    if (info === null || !info.isFile()) continue;

    const head = await readHead(candidate, info.size).catch(() => "");
    const stem = chapterStem(entry.name);
    found.push({
      id: entry.name,
      title: chapterMeta(head, stem).title,
      chapterPath: candidate,
      name: entry.name,
    });
  }

  found.sort((a, b) => chapterCollator.compare(a.name, b.name));
  return {
    bookRoot,
    chapters: found.map(({ name, ...chapter }) => chapter),
  };
}

/**
 * `/resolve`: open one file as a library chapter list or as an ad-hoc book.
 *
 * Library mode wins whenever the file sits inside a configured root; the
 * chapters are the exact `/books` objects for that library. Anything else is
 * read-only ad-hoc mode.
 */
async function resolveBook(settings, rawPath) {
  const { absPath } = await resolveAdhocFile(settings, rawPath);
  const library = settings.libraries.find((candidate) => isWithin(candidate.root, absPath));

  if (library !== undefined) {
    const chapters = await listChapters(library);
    const id = toPosixPath(relative(library.root, absPath));
    const index = chapters.findIndex((chapter) => chapter.id === id);
    if (index !== -1) {
      return {
        mode: "library",
        path: absPath,
        bookRoot: library.root,
        libraryId: library.id,
        annotationEnabled: true,
        chapters,
        index,
      };
    }
    // A markdown file inside a library root that the chapter list excludes
    // (a draft subfolder, an annotation export, an include/exclude filter)
    // still opens, read-only, as its own ad-hoc book instead of failing.
  }

  const adhoc = await listAdhocChapters(absPath);
  const index = adhoc.chapters.findIndex((chapter) => chapter.chapterPath === absPath);
  return {
    mode: "adhoc",
    path: absPath,
    bookRoot: adhoc.bookRoot,
    libraryId: null,
    annotationEnabled: false,
    chapters: adhoc.chapters,
    index,
  };
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
 * Load `.dsh_reader.json`.
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

function statusLabel(comment, chinese) {
  if (comment.resolved) return chinese ? "已结案" : "Resolved";
  return chinese ? "未结案" : "Open";
}

/** `A1｜第 12 段` (or the ` · ` form in English). */
function detailHeading(comment, chinese) {
  return [comment.id, positionLabel(comment, chinese)].join(chinese ? "｜" : " · ");
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
    lines.push("> 机器可读数据：`.dsh_reader.json`");
  } else {
    lines.push(`> Source file: \`${chapterId}\``);
    lines.push("> Machine-readable data: `.dsh_reader.json`");
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
    ? ["编号", "位置", "内容", "状态"]
    : ["ID", "Location", "Note", "Status"];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const comment of comments) {
    const cells = [
      comment.id,
      positionLabel(comment, chinese),
      comment.note,
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
  const title = chapterMeta(head, chapter.stem).title;
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

/**
 * `/config`: everything the browser needs before it can claim addresses or
 * build prompts. Deliberately metadata only — it never reads chapter files.
 */
async function handleConfig(settings) {
  return {
    version: await readOwnVersion(),
    pathBase: settings.pathBase,
    annotation: { locale: settings.annotation.locale },
    promptTemplate: settings.promptTemplate,
    libraries: settings.libraries.map((library) => ({
      id: library.id,
      title: library.title,
      root: library.root,
      annotationDir: library.annotationDir,
    })),
    errors: [...settings.errors],
  };
}

/**
 * `/resolve`: open one markdown file as a continuous book.
 *
 * The `path` query value arrives already URL-decoded; absolute paths win, and
 * relative ones are resolved through `pathBase` / library roots.
 */
async function handleResolve(settings, url) {
  return resolveBook(settings, url.searchParams.get("path"));
}

/**
 * `/search`: case-insensitive substring search over the book's chapters.
 *
 * Library mode (`?lib=`) scans the configured library; ad-hoc mode (`?path=`)
 * scans the markdown files next to the given file. Matches carry a short
 * context snippet; the browser loads the chapter and jumps to the block that
 * contains the query.
 */
async function handleSearch(settings, url) {
  const query = (url.searchParams.get("q") || "").trim();
  if (query === "") throw new HttpError(400, "missing q parameter");
  if (query.length > 200) throw new HttpError(400, "q must be 200 characters or fewer");
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, Math.trunc(rawLimit)) : 50;

  const libId = url.searchParams.get("lib");
  const pathParam = url.searchParams.get("path");
  let entries = [];

  if (libId !== null && libId !== "") {
    const library = findLibrary(settings, libId);
    const chapters = await listChapters(library);
    entries = chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      absPath: join(library.root, chapter.id.split("/").join(sep)),
    }));
  } else if (pathParam !== null && pathParam !== "") {
    const { absPath } = await resolveAdhocFile(settings, pathParam, { requireAbsolute: true });
    const adhoc = await listAdhocChapters(absPath);
    entries = adhoc.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      absPath: chapter.chapterPath,
    }));
  } else {
    throw new HttpError(400, "missing lib or path parameter");
  }

  const needle = query.toLocaleLowerCase();
  const matches = [];
  let truncated = false;
  for (const entry of entries) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    let text;
    try {
      const info = await statOrNull(entry.absPath);
      if (info === null || !info.isFile() || info.size > settings.maxChapterBytes) continue;
      text = await readFile(entry.absPath, "utf8");
    } catch {
      continue;
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const haystack = text.toLocaleLowerCase();
    const at = haystack.indexOf(needle);
    if (at < 0) continue;
    let count = 1;
    let cursor = at + needle.length;
    while (true) {
      const next = haystack.indexOf(needle, cursor);
      if (next < 0) break;
      count += 1;
      cursor = next + needle.length;
      if (count > 999) break;
    }
    const from = Math.max(0, at - 24);
    const to = Math.min(text.length, at + needle.length + 24);
    matches.push({
      chapterId: entry.id,
      title: entry.title,
      snippet: text.slice(from, to).replace(/\s+/g, " ").trim(),
      count,
    });
  }

  return { query, libraryId: libId || null, matches, truncated };
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
    annotation: { locale: settings.annotation.locale },
    promptTemplate: settings.promptTemplate,
    errors,
  };
}

/** Refuse a chapter that would be truncated at `maxChapterBytes`. */
function ensureChapterSize(size, settings) {
  if (size > settings.maxChapterBytes) {
    throw new HttpError(
      400,
      `chapter is too large: ${size} bytes exceeds the ${settings.maxChapterBytes}-byte limit (maxChapterBytes)`,
    );
  }
}

/**
 * `/chapter`: read one markdown file, refusing to truncate oversized ones.
 *
 * `?path=<absolute .md>` is the ad-hoc, read-only form; `?lib=&file=` is the
 * library form. Both return `{ id, title, text }`.
 */
async function handleChapter(settings, url) {
  const pathParam = url.searchParams.get("path");
  if (pathParam !== null) {
    const { absPath, info } = await resolveAdhocFile(settings, pathParam, {
      requireAbsolute: true,
    });
    ensureChapterSize(info.size, settings);

    let text;
    try {
      text = await readFile(absPath, "utf8");
    } catch (error) {
      throw new HttpError(500, `cannot read chapter: ${error?.message ?? error}`);
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const name = basename(absPath);
    return { id: name, title: chapterMeta(text, chapterStem(name)).title, text };
  }

  const libId = url.searchParams.get("lib");
  const fileParam = url.searchParams.get("file");
  if (libId === null || libId === "") throw new HttpError(400, "missing lib parameter");
  const library = findLibrary(settings, libId);
  const chapter = await resolveChapter(library, fileParam);

  ensureChapterSize(chapter.size, settings);

  let text;
  try {
    text = await readFile(chapter.absPath, "utf8");
  } catch (error) {
    throw new HttpError(500, `cannot read chapter: ${error?.message ?? error}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { id: chapter.id, title: chapterMeta(text, chapter.stem).title, text };
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

/** Send JSON with the headers every dsh_reader response carries. */
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

/** Map `/api/dsh_reader/...` to the bare route name. */
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
        case "config":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleConfig(settings);
          break;
        case "books":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleBooks(settings);
          break;
        case "resolve":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleResolve(settings, url);
          break;
        case "chapter":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleChapter(settings, url);
          break;
        case "search":
          if (method === "POST") throw new HttpError(405, "method not allowed");
          payload = await handleSearch(settings, url);
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

// ── agent tool ─────────────────────────────────────────────────────────────

const TOOL_NAME = "reader_annotations";

const TOOL_DESCRIPTION = [
  "Read and resolve the annotations written in the dsh_reader Book viewer.",
  '`list` returns the annotations of one chapter, or every annotated chapter in a library;',
  '`resolve` marks annotations as resolved after you have applied them to the chapter.',
  "Annotations are plain markdown notes under the library's annotationDir; the returned chapterPath and annotationPath are the same paths the viewer shows, so you can read or edit the files directly.",
].join(" ");

/** Resolve the library argument against a possibly multi-library config. */
function toolLibrary(settings, requested) {
  if (typeof requested === "string" && requested.trim() !== "") {
    return findLibrary(settings, requested.trim());
  }
  if (settings.libraries.length === 0) {
    throw new Error("dsh_reader has no libraries configured");
  }
  if (settings.libraries.length === 1) return settings.libraries[0];
  throw new Error(
    `library is required; configured libraries: ${settings.libraries.map((library) => library.id).join(", ")}`,
  );
}

/** Compact model-facing view of one stored comment. */
function annotationView(comment) {
  return {
    id: comment.id,
    note: comment.note,
    quote: comment.quote,
    paragraph: Number.isInteger(comment.block) ? comment.block : null,
    resolved: comment.resolved === true,
  };
}

/** The library fields the browser and the tool both see. */
function libraryView(library) {
  return {
    id: library.id,
    title: library.title,
    root: library.root,
    annotationDir: library.annotationDir,
  };
}

/** Paths for one chapter, in the same spelling `/books` and `/resolve` use. */
function chapterView(library, chapter, extra = {}) {
  const annotationFile = extra.annotationFile || chapter.annotationFile || annotationFileFor(chapter);
  return {
    id: chapter.id,
    title: extra.title || chapter.title || chapter.id,
    chapterPath: chapterPathFor(library, chapter.id),
    annotationPath: annotationPathFor(library, annotationFile),
  };
}

function countsOf(comments) {
  const open = comments.filter((comment) => !comment.resolved).length;
  return { total: comments.length, open, resolved: comments.length - open };
}

/** `list` implementation: one chapter, or every annotated chapter of a library. */
async function listAnnotations(settings, args) {
  const library = toolLibrary(settings, args.library);
  const store = await loadAnnotationStore(library.annotationDir);
  const onlyOpen = args.onlyOpen === true;

  if (typeof args.chapter === "string" && args.chapter.trim() !== "") {
    const chapter = await resolveChapter(library, args.chapter.trim());
    const meta = (await listChapters(library)).find((candidate) => candidate.id === chapter.id);
    const entry = store.chapters[chapter.id];
    const all = entry === undefined ? [] : entry.comments;
    const annotations = all.filter((comment) => !onlyOpen || !comment.resolved).map(annotationView);
    return {
      action: "list",
      library: libraryView(library),
      chapter: chapterView(library, chapter, meta || {}),
      counts: countsOf(all),
      annotations,
    };
  }

  const chapters = await listChapters(library);
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const rows = [];
  for (const [chapterId, entry] of Object.entries(store.chapters)) {
    if (!entry || !Array.isArray(entry.comments) || entry.comments.length === 0) continue;
    const chapter = byId.get(chapterId);
    if (chapter === undefined) continue;
    const counts = countsOf(entry.comments);
    if (onlyOpen && counts.open === 0) continue;
    rows.push({
      id: chapterId,
      title: chapter.title,
      annotationPath: chapter.annotationPath,
      total: counts.total,
      open: counts.open,
    });
  }
  rows.sort((left, right) => chapterComparator(library.order)(byId.get(left.id), byId.get(right.id)));
  const aggregate = rows.reduce(
    (sum, row) => ({ total: sum.total + row.total, open: sum.open + row.open }),
    { total: 0, open: 0 },
  );
  return {
    action: "list",
    library: libraryView(library),
    chapters: rows,
    counts: { total: aggregate.total, open: aggregate.open, resolved: aggregate.total - aggregate.open },
    annotations: [],
  };
}

/** `resolve` implementation: mark ids (or every comment) resolved/reopened. */
async function resolveAnnotations(settings, args) {
  const library = toolLibrary(settings, args.library);
  if (typeof args.chapter !== "string" || args.chapter.trim() === "") {
    throw new Error("chapter is required for action=resolve");
  }
  const chapter = await resolveChapter(library, args.chapter.trim());
  const meta = (await listChapters(library)).find((candidate) => candidate.id === chapter.id);
  const store = await loadAnnotationStore(library.annotationDir);
  const entry = store.chapters[chapter.id];
  if (entry === undefined || entry.comments.length === 0) {
    throw new Error(`no annotations found for ${chapter.id}`);
  }

  const all = args.all === true;
  const wanted = new Set((Array.isArray(args.ids) ? args.ids : []).map(String));
  if (!all && wanted.size === 0) {
    throw new Error("pass ids (e.g. [\"A1\"]) or all=true for action=resolve");
  }
  const nextResolved = args.reopen !== true;
  const now = Date.now();
  let changed = 0;
  for (const comment of entry.comments) {
    if (!all && !wanted.has(comment.id)) continue;
    if (comment.resolved === nextResolved) continue;
    comment.resolved = nextResolved;
    comment.updatedAt = now;
    changed += 1;
  }
  if (!all) {
    const missing = [...wanted].filter((id) => !entry.comments.some((comment) => comment.id === id));
    if (missing.length > 0) throw new Error(`unknown annotation ids: ${missing.join(", ")}`);
  }
  entry.updatedAt = now;
  store.chapters[chapter.id] = entry;
  await saveAnnotationStore(library.annotationDir, store);
  await writeAnnotationExport(library, chapter, entry);

  return {
    action: "resolve",
    library: libraryView(library),
    chapter: chapterView(library, chapter, meta || {}),
    counts: countsOf(entry.comments),
    annotations: entry.comments.map(annotationView),
    changed,
  };
}

/**
 * Build the registry-ready `reader_annotations` tool for one configured profile.
 *
 * @param {object} settings normalized plugin settings
 * @returns {object} tool definition for `ctx.tools.register`
 */
export function createAnnotationsTool(settings) {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["list", "resolve"],
          description: "list: read annotations; resolve: mark annotations resolved (or reopen them).",
        },
        library: {
          type: "string",
          description: "Library id. Optional when exactly one library is configured.",
        },
        chapter: {
          type: "string",
          description:
            "Chapter id relative to the library root, e.g. 第026章.md. Omit in list to summarise every annotated chapter.",
        },
        onlyOpen: {
          type: "boolean",
          description: "list: return only unresolved annotations (default false).",
        },
        ids: {
          type: "array",
          items: { type: "string" },
          description: "resolve: annotation ids to change, e.g. [\"A1\", \"A2\"].",
        },
        all: {
          type: "boolean",
          description: "resolve: apply to every annotation in the chapter.",
        },
        reopen: {
          type: "boolean",
          description: "resolve: set resolved=false instead of true.",
        },
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["action", "library", "counts", "annotations"],
        properties: {
          action: { type: "string" },
          changed: { type: "integer" },
          library: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "root", "annotationDir"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              root: { type: "string" },
              annotationDir: { type: "string" },
            },
          },
          chapter: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "chapterPath", "annotationPath"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              chapterPath: { type: "string" },
              annotationPath: { type: "string" },
            },
          },
          chapters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "annotationPath", "total", "open"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                annotationPath: { type: "string" },
                total: { type: "integer" },
                open: { type: "integer" },
              },
            },
          },
          counts: {
            type: "object",
            additionalProperties: false,
            required: ["total", "open", "resolved"],
            properties: {
              total: { type: "integer" },
              open: { type: "integer" },
              resolved: { type: "integer" },
            },
          },
          annotations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "note", "quote", "paragraph", "resolved"],
              properties: {
                id: { type: "string" },
                note: { type: "string" },
                quote: { type: "string" },
                paragraph: { type: ["integer", "null"] },
                resolved: { type: "boolean" },
              },
            },
          },
        },
      },
      render: (args, value) => {
        const lines = [];
        if (value.chapter) lines.push(`${value.chapter.title || value.chapter.id} — ${value.counts.open} open / ${value.counts.total}`);
        else lines.push(`${value.library.title}: ${value.counts.open} open / ${value.counts.total} annotations`);
        for (const annotation of value.annotations || []) {
          const paragraph = Number.isInteger(annotation.paragraph) ? ` ¶${annotation.paragraph}` : "";
          lines.push(`- ${annotation.id}${paragraph}${annotation.resolved ? " (resolved)" : ""}: ${annotation.note}`);
        }
        for (const chapter of value.chapters || []) {
          lines.push(`- ${chapter.id}: ${chapter.open} open / ${chapter.total}`);
        }
        if (value.changed !== undefined) lines.push(`changed: ${value.changed}`);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args) {
      const action = args && args.action;
      if (action === "list") return listAnnotations(settings, args);
      if (action === "resolve") return resolveAnnotations(settings, args);
      throw new Error(`unknown action: ${String(action)}`);
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Reader annotations",
      kind: "other",
      rawInput: args,
    }),
  };
}

// ── plugin entry point ─────────────────────────────────────────────────────


export const name = "dsh_reader";

// Exported for tests and for compositions that want to inspect a profile first.
export { normalizeConfig };
export const inject = ["webServer", "tools"];

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
    console.warn(`[dsh_reader] failed to register HTTP routes: ${error?.message ?? error}`);
  }

  // Agent tool: the same annotation store the viewer writes, without copy-paste.
  if (ctx.tools && typeof ctx.tools.register === "function") {
    const registerTool = () => {
      const disposal = ctx.tools.register(createAnnotationsTool(settings));
      return typeof disposal === "function" ? disposal : () => undefined;
    };
    try {
      if (typeof ctx.effect === "function") ctx.effect(registerTool, "dsh_reader: annotations tool");
      else registerTool();
    } catch (error) {
      console.warn(`[dsh_reader] failed to register the annotations tool: ${error?.message ?? error}`);
    }
  }
}
