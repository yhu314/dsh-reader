window.__ModuleLoader__.load({
  id: 'dsh_reader',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useState, useEffect, useRef, useCallback, useMemo } = React
    const h = React.createElement

    // ── dictionaries (locale/*.json only carries plugin-manager metadata) ──
    const NS = 'dsh_reader'
    const zh = {
      title: '阅读器',
      reader: '阅读',
      openReader: '打开阅读器',
      shelf: '书架',
      back: '返回',
      toc: '目录',
      prev: '上一章',
      next: '下一章',
      fontSmaller: '缩小字号',
      fontLarger: '放大字号',
      annotations: '批注',
      sendToChat: '送往对话',
      copied: '已复制修改指令，去对话里粘贴即可',
      close: '关闭',
      addAnnotation: '批注',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      resolve: '结案',
      reopen: '重新打开',
      resolved: '已结案',
      type: '类型',
      conclusion: '结论',
      notePlaceholder: '写下你的意见…',
      edit: '编辑',
      noAnnotations: '这一章还没有批注',
      readOnly: '只读：这个目录不是已配置的书库，配置后可批注',
      loading: '加载中…',
      endOfBook: '已经读到最后一章',
      emptyBook: '这个目录里没有 markdown 文件',
      setupTitle: '还没有配置书库',
      setupBody:
        '在 profile 的 cordis.patch.yml 里给 dsh_reader 这一行配置 libraries（一个目录就是一本书，按 frontmatter order / 文件名自然排序），保存后刷新页面。示例见插件 README。',
      setupErrors: '配置里有问题：',
      error: '出错了',
      retry: '重试',
      blockAt: '第 {n} 段',
      chapter: '章',
      copyPath: '复制路径',
      chapterCount: '章',
      totalChapters: '共 {n} 章',
      unsupported: '这个标签页没有可读的地址',
      notThisSession: '阅读器未在这个会话启用',
      notThisSessionBody:
        '插件里配置了 sessions 白名单，当前会话不在名单内。刷新页面即可恢复内置预览；要在这里启用，把会话 id 加进 sessions。',
    }
    const en = {
      title: 'Reader',
      reader: 'Read',
      openReader: 'Open reader',
      shelf: 'Library',
      back: 'Back',
      toc: 'Contents',
      prev: 'Previous',
      next: 'Next',
      fontSmaller: 'Smaller text',
      fontLarger: 'Larger text',
      annotations: 'Annotations',
      sendToChat: 'Send to chat',
      copied: 'Copied — paste it in the chat',
      close: 'Close',
      addAnnotation: 'Annotate',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      resolve: 'Resolve',
      reopen: 'Reopen',
      resolved: 'Resolved',
      type: 'Type',
      conclusion: 'Conclusion',
      notePlaceholder: 'Write your note…',
      edit: 'Edit',
      noAnnotations: 'No annotations in this chapter yet',
      readOnly: 'Read-only: this folder is not a configured library',
      loading: 'Loading…',
      endOfBook: 'End of the book',
      emptyBook: 'No markdown files in this folder',
      setupTitle: 'No libraries configured',
      setupBody:
        'Add `libraries` to the dsh_reader row in your profile’s cordis.patch.yml — one folder is one book, ordered by frontmatter order or natural file name — then reload the page. See the plugin README.',
      setupErrors: 'Configuration problems:',
      error: 'Something went wrong',
      retry: 'Retry',
      blockAt: 'Paragraph {n}',
      chapter: 'chapter',
      copyPath: 'Copy path',
      chapterCount: 'chapters',
      totalChapters: '{n} chapters',
      unsupported: 'This tab has no readable address',
      notThisSession: 'Reader is not enabled in this session',
      notThisSessionBody:
        'The plugin has a `sessions` allowlist and this session is not on it. Reload the page to get the built-in preview back; add this session id to `sessions` to use the reader here.',
    }
    const DICTS = { zh, en }
    function tr(t, key) {
      if (typeof t === 'function') {
        const value = t(key)
        if (typeof value === 'string' && value !== key) return value
      }
      return DICTS.zh[key] || key
    }
    function fill(template, vars) {
      let value = template
      for (const [key, replacement] of Object.entries(vars)) {
        value = value.split('{' + key + '}').join(String(replacement))
      }
      return value
    }

    // ── styles ────────────────────────────────────────────────────────────
    const CSS_TAG = 'dsh_reader/reader.css'
    const css = `
.dsr-root{position:relative;height:100%;min-height:240px;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary,#e8e9ee);font-size:13px;line-height:1.5;overflow:hidden}
.dsr-bar{flex:none;display:flex;align-items:center;gap:2px;height:34px;padding:0 4px 0 6px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}
.dsr-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#a9adba);padding:0 4px}
.dsr-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;min-width:26px;padding:0 6px;border:1px solid transparent;border-radius:7px;background:0 0;color:var(--dsw-alias-label-secondary,#a9adba);font:inherit;font-size:12px;line-height:1;white-space:nowrap}
.dsr-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07));color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-btn:disabled{opacity:.35;cursor:default;background:0 0}
.dsr-btnOn,.dsr-btnOn:hover{background:var(--dsw-alias-interactive-bg-hover-accent,rgba(77,107,254,.18));color:var(--dsw-alias-brand-primary,#7d97ff)}
.dsr-btnPrimary{background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;font-weight:600}
.dsr-btnPrimary:hover{filter:brightness(1.08);background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}
.dsr-btnDanger{color:var(--dsw-alias-state-error-primary,#ff7b72)}
.dsr-count{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b8090);font-variant-numeric:tabular-nums;padding:0 4px}
.dsr-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsr-doc{padding:16px 18px 34vh;font-size:var(--dsr-fs,16px);line-height:1.95;letter-spacing:.01em}
.dsr-chapter{position:relative}
.dsr-chapter + .dsr-chapter{margin-top:26px;padding-top:26px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}
.dsr-chapterNo{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#7b8090);margin-bottom:6px}
.dsr-h1,.dsr-h2,.dsr-h3,.dsr-h4{color:var(--dsw-alias-label-primary,#e8e9ee);font-weight:650;line-height:1.4;margin:1.2em 0 .6em}
.dsr-h1{font-size:1.22em;margin-top:0}
.dsr-h2{font-size:1.12em}
.dsr-h3{font-size:1.04em}
.dsr-h4{font-size:1em}
.dsr-p{margin:0 0 .85em;text-align:justify;overflow-wrap:break-word}
.dsr-quote{margin:0 0 .9em;padding:2px 0 2px 12px;border-left:2px solid var(--dsw-alias-border-l3,rgba(255,255,255,.2));color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-ul,.dsr-ol{margin:0 0 .9em;padding-left:1.4em}
.dsr-li{margin:0 0 .3em}
.dsr-hr{border:none;height:1px;margin:1.6em auto;width:36%;background:var(--dsw-alias-border-l2,rgba(255,255,255,.14))}
.dsr-pre{margin:0 0 .9em;padding:10px 12px;border-radius:9px;background:var(--dsw-alias-bg-layer-2,#23252b);overflow-x:auto;font-size:.85em;line-height:1.6}
.dsr-code{font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:.9em;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,#23252b)}
.dsr-link{color:var(--dsw-alias-brand-primary,#7d97ff);text-decoration:none}
.dsr-mark{background:rgba(77,107,254,.2);box-shadow:inset 0 -2px 0 rgba(77,107,254,.55);border-radius:3px;cursor:pointer;color:inherit;padding:0 1px}
.dsr-mark:hover{background:rgba(77,107,254,.3)}
.dsr-markResolved{background:rgba(120,130,145,.18);box-shadow:inset 0 -2px 0 rgba(120,130,145,.45)}
.dsr-sentinel{height:1px}
.dsr-hint{display:flex;justify-content:center;padding:16px 0 0;color:var(--dsw-alias-label-tertiary,#7b8090);font-size:11px}
.dsr-empty{padding:28px 18px;text-align:center;color:var(--dsw-alias-label-tertiary,#7b8090);font-size:12px;line-height:1.8}
.dsr-book{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;cursor:pointer;color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-book:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.dsr-bookTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.dsr-bookMeta{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b8090);font-variant-numeric:tabular-nums}
.dsr-chapterRow{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 20px;border-radius:7px;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-chapterRow:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-chapterRowOn,.dsr-chapterRowOn:hover{background:var(--dsw-alias-interactive-bg-hover-accent,rgba(77,107,254,.18));color:var(--dsw-alias-brand-primary,#7d97ff)}
.dsr-chapterName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsr-chapterNoB{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary,#7b8090);font-variant-numeric:tabular-nums;min-width:24px;text-align:right}
.dsr-drawer{position:absolute;top:34px;bottom:0;right:0;width:min(320px,92%);display:flex;flex-direction:column;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#23252b));border-left:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));box-shadow:-8px 0 24px rgba(0,0,0,.25);z-index:5}
.dsr-drawerHead{flex:none;display:flex;align-items:center;gap:6px;height:32px;padding:0 6px 0 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-drawerBody{flex:1;min-height:0;overflow-y:auto;padding:6px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2)}
.dsr-ann{padding:8px 9px;border-radius:9px;margin-bottom:5px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));border:1px solid transparent;cursor:pointer}
.dsr-ann:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.12))}
.dsr-annTop{display:flex;align-items:center;gap:5px;margin-bottom:4px;flex-wrap:wrap}
.dsr-badge{display:inline-flex;align-items:center;height:17px;padding:0 5px;border-radius:4px;font-size:10px;line-height:1;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08));color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-badgeBrand{background:rgba(77,107,254,.16);color:var(--dsw-alias-brand-primary,#7d97ff)}
.dsr-badgeMuted{background:rgba(120,130,145,.16);color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-annId{font-size:10px;color:var(--dsw-alias-label-tertiary,#7b8090);font-variant-numeric:tabular-nums}
.dsr-annQuote{margin:0 0 3px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#a9adba);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsr-annNote{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary,#e8e9ee);white-space:pre-wrap;overflow-wrap:break-word}
.dsr-annActions{display:flex;gap:2px;justify-content:flex-end;margin-top:4px;opacity:0;transition:opacity .12s}
.dsr-ann:hover .dsr-annActions{opacity:1}
.dsr-tool{position:fixed;z-index:2147483000;display:flex;gap:3px;padding:3px;border-radius:9px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#23252b));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 10px 28px rgba(0,0,0,.4)}
.dsr-pop{position:fixed;z-index:2147483000;width:320px;max-height:min(76vh,500px);overflow-y:auto;padding:11px;border-radius:11px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#23252b));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 14px 40px rgba(0,0,0,.45)}
.dsr-popHead{display:flex;align-items:center;gap:7px;margin-bottom:7px;font-size:12px;color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-quoted{margin:0 0 9px;padding:6px 9px;border-radius:7px;background:rgba(77,107,254,.1);border-left:2px solid rgba(77,107,254,.6);font-size:11px;line-height:1.55;color:var(--dsw-alias-label-secondary,#a9adba);max-height:86px;overflow:auto;white-space:pre-wrap}
.dsr-field{margin-bottom:7px}
.dsr-label{display:block;margin-bottom:3px;font-size:10px;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-input,.dsr-textarea{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-bg-layer-2,#23252b);color:var(--dsw-alias-label-primary,#e8e9ee);font:inherit;font-size:12px;outline:none}
.dsr-input:focus,.dsr-textarea:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsr-textarea{min-height:76px;resize:vertical;line-height:1.55}
.dsr-row{display:flex;gap:7px}
.dsr-row > .dsr-field{flex:1;min-width:0}
.dsr-popFoot{display:flex;align-items:center;gap:5px;margin-top:9px}
.dsr-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:6;max-width:90%;padding:8px 13px;border-radius:9px;background:var(--dsw-alias-bg-mask-3,rgba(0,0,0,.72));color:#fff;font-size:11px;box-shadow:0 8px 22px rgba(0,0,0,.35);pointer-events:none}
.dsr-toastErr{background:rgba(180,40,40,.92)}
.dsr-setup{max-width:420px;margin:28px auto;padding:0 18px;color:var(--dsw-alias-label-secondary,#a9adba);font-size:12px;line-height:1.8}
.dsr-setup h2{margin:0 0 8px;font-size:14px;color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-setup code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,#23252b);font-size:11px}
.dsr-pathRow{display:flex;align-items:center;gap:6px;margin:8px 4px 0;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));font-size:10px;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-pathText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.dsr-openBtn{cursor:pointer;display:flex;align-items:center;gap:8px;height:36px;width:100%;padding:0 12px;border:none;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary,#a9adba);font:inherit;font-size:13px;line-height:1;text-align:left}
.dsr-openBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07));color:var(--dsw-alias-label-primary,#e8e9ee)}
`
    function ensureStyle() {
      const selector = `style[data-plugin-css=${JSON.stringify(CSS_TAG)}]`
      const existing = document.querySelector(selector)
      if (existing) return existing
      const el = document.createElement('style')
      el.dataset.plugin = 'dsh_reader'
      el.dataset.pluginCss = CSS_TAG
      el.textContent = css
      document.head.appendChild(el)
      return el
    }

    // ── host API ──────────────────────────────────────────────────────────
    const API = '/api/dsh_reader'
    let configValue = null
    let configPromise = null
    function loadConfig(force) {
      if (force) {
        configPromise = null
        configValue = null
      }
      if (!configPromise) {
        configPromise = fetch(API + '/config')
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
          .then((data) => {
            configValue = data
            return data
          })
      }
      return configPromise
    }
    async function callApi(path, options) {
      const response = await fetch(API + path, {
        headers: { 'content-type': 'application/json' },
        ...options,
      })
      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }
      if (!response.ok) throw new Error(data && data.error ? data.error : `HTTP ${response.status}`)
      return data
    }
    function enc(value) {
      return encodeURIComponent(String(value === undefined || value === null ? '' : value))
    }

    // ── resource addresses: dsh-resource://file/session/<id>/<path> ────────
    function decodeSegments(rest) {
      try {
        return rest.split('/').map((segment) => decodeURIComponent(segment)).join('/')
      } catch {
        return null
      }
    }
    function parseFileAddress(address) {
      if (typeof address !== 'string') return null
      const clean = address.replace(/[?#].*$/, '')
      const sessionPrefix = 'dsh-resource://file/session/'
      if (clean.startsWith(sessionPrefix)) {
        const rest = clean.slice(sessionPrefix.length)
        const slash = rest.indexOf('/')
        if (slash <= 0) return null
        const sessionId = decodeSegments(rest.slice(0, slash))
        const path = decodeSegments(rest.slice(slash + 1))
        if (sessionId === null || path === null || path === '') return null
        return { sessionId, path }
      }
      const absolutePrefix = 'dsh-resource://file/absolute/'
      if (clean.startsWith(absolutePrefix)) {
        const path = decodeSegments(clean.slice(absolutePrefix.length))
        if (path === null || path === '') return null
        return { sessionId: '', path }
      }
      return null
    }
    function basenameOf(path) {
      const parts = String(path || '').split('/')
      return parts[parts.length - 1] || ''
    }
    function titleOfAddress(address) {
      const parsed = parseFileAddress(address)
      if (!parsed) return DICTS.zh.reader
      return basenameOf(parsed.path).replace(/\.(md|markdown)$/i, '')
    }
    function resolveClientPathFor(config, relativePath) {
      if (!relativePath) return relativePath
      if (relativePath.startsWith('/')) return relativePath
      if (config && config.pathBase) {
        return String(config.pathBase).replace(/\/+$/, '') + '/' + relativePath
      }
      return relativePath
    }
    function resolveClientPath(relativePath) {
      return resolveClientPathFor(configValue, relativePath)
    }
    function insideRoot(path, root) {
      if (!path || !root) return false
      const normalized = String(root).replace(/\/+$/, '')
      return path === normalized || path.startsWith(normalized + '/')
    }
    /**
     * Decide whether the reader takes a markdown resource away from the built-in
     * preview. Errs on the safe side everywhere: an unknown config, an unknown
     * address, or an error means "do not claim".
     */
    function claimWith(config, address) {
      try {
        const parsed = parseFileAddress(address)
        if (!parsed) return false
        const path = resolveClientPathFor(config, parsed.path)
        if (!path) return false
        // Until the host answers /config, keep the built-in preview in charge.
        if (!config) return false
        if (config.claimMarkdown === 'off') return false
        const only = Array.isArray(config.sessions) ? config.sessions : []
        if (only.length > 0) {
          // Session-scoped rollout: every other session keeps the built-in preview.
          if (!parsed.sessionId || !only.includes(parsed.sessionId)) return false
        }
        if (config.claimMarkdown === 'libraries') {
          return (config.libraries || []).some((library) => insideRoot(path, library.root))
        }
        return true
      } catch {
        return false
      }
    }
    function claimAddress(address) {
      return claimWith(configValue, address)
    }

    // ── markdown: blocks + inline renderer (dependency-free, prose-first) ──
    function stripFrontmatter(lines) {
      if (lines.length === 0) return lines
      if (lines[0].trim() !== '---') return lines
      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i].trim()
        if (line === '---' || line === '...') {
          const body = lines.slice(1, i)
          const looksLikeYaml = body.some((entry) => /^[A-Za-z0-9_-]+\s*:/.test(entry))
          return looksLikeYaml ? lines.slice(i + 1) : lines
        }
      }
      return lines
    }
    const CJK_END = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]$/
    const CJK_START = /^[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/
    function joinLines(left, right) {
      if (!left) return right
      if (!right) return left
      if (CJK_END.test(left) && CJK_START.test(right)) return left + right
      return left + ' ' + right
    }
    function splitBlocks(text) {
      const lines = stripFrontmatter(String(text || '').replace(/\r\n?/g, '\n').split('\n'))
      const blocks = []
      let paragraph = []
      let quote = []
      let code = null
      let list = null
      const flushParagraph = () => {
        if (paragraph.length > 0) {
          blocks.push({ kind: 'p', text: paragraph.reduce((left, right) => joinLines(left, right), '') })
          paragraph = []
        }
      }
      const flushQuote = () => {
        if (quote.length > 0) {
          blocks.push({ kind: 'quote', text: quote.join('\n') })
          quote = []
        }
      }
      const flushList = () => {
        if (list) {
          blocks.push(list)
          list = null
        }
      }
      const flushAll = () => {
        flushParagraph()
        flushQuote()
        flushList()
      }
      for (const raw of lines) {
        if (code !== null) {
          if (/^```/.test(raw.trim())) {
            blocks.push({ kind: 'pre', text: code.join('\n') })
            code = null
          } else code.push(raw)
          continue
        }
        if (/^```/.test(raw.trim())) {
          flushAll()
          code = []
          continue
        }
        const line = raw.replace(/\s+$/, '')
        if (line.trim() === '') {
          flushAll()
          continue
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          flushAll()
          blocks.push({ kind: 'h' + heading[1].length, text: heading[2].trim() })
          continue
        }
        if (/^([-*_]\s*){3,}$/.test(line.trim())) {
          flushAll()
          blocks.push({ kind: 'hr', text: '' })
          continue
        }
        const quoted = line.match(/^>\s?(.*)$/)
        if (quoted) {
          flushParagraph()
          flushList()
          quote.push(quoted[1])
          continue
        }
        const bullet = line.match(/^([-*+])\s+(.*)$/)
        const numbered = line.match(/^(\d+)[.)]\s+(.*)$/)
        if (bullet || numbered) {
          flushParagraph()
          flushQuote()
          const kind = bullet ? 'ul' : 'ol'
          if (!list || list.kind !== kind) {
            flushList()
            list = { kind, items: [] }
          }
          list.items.push((bullet ? bullet[2] : numbered[2]).trim())
          continue
        }
        if (list) {
          list.items[list.items.length - 1] += ' ' + line.trim()
          continue
        }
        flushQuote()
        paragraph.push(line.trim())
      }
      flushAll()
      if (code !== null) blocks.push({ kind: 'pre', text: code.join('\n') })
      return blocks
    }
    function inlineNodes(value, keyPrefix) {
      const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
      const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|~~(.+?)~~/g
      const nodes = []
      let last = 0
      let match
      let index = 0
      while ((match = pattern.exec(text)) !== null) {
        if (text.slice(last, match.index)) nodes.push(text.slice(last, match.index))
        const key = `${keyPrefix || 'i'}-${index++}`
        if (match[2] !== undefined) nodes.push(h('strong', { key }, match[2]))
        else if (match[4] !== undefined) nodes.push(h('em', { key }, match[4]))
        else if (match[5] !== undefined) nodes.push(h('code', { key, className: 'dsr-code' }, match[5]))
        else if (match[6] !== undefined) {
          nodes.push(h('a', { key, className: 'dsr-link', href: match[7], target: '_blank', rel: 'noreferrer noopener', onClick: (event) => event.stopPropagation() }, match[6]))
        } else if (match[8] !== undefined) nodes.push(h('del', { key }, match[8]))
        last = pattern.lastIndex
      }
      if (text.slice(last)) nodes.push(text.slice(last))
      return nodes
    }
    function computeSegments(value, items) {
      const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
      const ranges = []
      for (const item of items || []) {
        const quote = String(item.quote || '').trim()
        if (!quote) continue
        let from = 0
        while (from <= text.length) {
          const at = text.indexOf(quote, from)
          if (at < 0) break
          ranges.push({ start: at, end: at + quote.length, id: item.id })
          from = at + quote.length
          if (ranges.length > 200) break
        }
      }
      ranges.sort((a, b) => a.start - b.start || b.end - a.end)
      const segments = []
      let cursor = 0
      for (const range of ranges) {
        if (range.end <= cursor) continue
        if (range.start >= text.length) break
        const start = Math.max(range.start, cursor)
        if (start > cursor) segments.push({ text: text.slice(cursor, start) })
        segments.push({ text: text.slice(start, range.end), id: range.id })
        cursor = range.end
      }
      if (cursor < text.length) segments.push({ text: text.slice(cursor) })
      return segments
    }
    function buildPrompt(template, annotationFile, chapterFile) {
      const source = template && String(template).trim() ? String(template) : 'Revise {chapterFile} according to {annotationFile}.'
      return source.split('{annotationFile}').join(annotationFile || '').split('{chapterFile}').join(chapterFile || '')
    }
    function formatBlockLabel(t, blockNumber) {
      if (!blockNumber) return '—'
      return fill(tr(t, 'blockAt'), { n: blockNumber })
    }

    // ── persisted UI state ────────────────────────────────────────────────
    const UI_KEY = 'dsh_reader.ui.v1'
    const PROGRESS_KEY = 'dsh_reader.pos.v1'
    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key)
        return raw ? JSON.parse(raw) : fallback
      } catch {
        return fallback
      }
    }
    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* ignore */
      }
    }

    // ── icons ─────────────────────────────────────────────────────────────
    function IconBook({ size }) {
      const s = size || 16
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 1.5, y: 2, width: 13, height: 12, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M4.6 4.6h6.8M4.6 7.2h6.8M4.6 9.8h4.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.75 }))
    }
    function IconClose({ size }) {
      const s = size || 13
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
    }
    function IconChevron({ dir, size }) {
      const s = size || 13
      const path = dir === 'left' ? 'M9.6 3.6L5.2 8l4.4 4.4' : 'M6.4 3.6L10.8 8l-4.4 4.4'
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: path, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }
    function IconNote({ size }) {
      const s = size || 13
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.2 3.4h9.6v6.4L9.4 13H3.2z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }),
        h('path', { d: 'M6.2 6.4h4M6.2 8.6h2.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.7 }))
    }
    function IconList({ size }) {
      const s = size || 13
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 4.2h10M3 8h10M3 11.8h6.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
    }

    // ── left-Sidebar entry → bookshelf page in the right Sidebar ──────────
    let sidebarRightRef = null
    function openBookshelf() {
      const controller = sidebarRightRef
      if (!controller || typeof controller.openTab !== 'function') return
      try {
        controller.openTab('dsh_reader/books')
      } catch {
        /* no on-screen session: the Sidebar cannot open */
      }
    }
    function OpenButton({ t, wide, useSessions }) {
      let currentSession = null
      try {
        currentSession = typeof useSessions === 'function' ? useSessions((state) => state.current) : null
      } catch {
        currentSession = null
      }
      const onlySessions = configValue && Array.isArray(configValue.sessions) ? configValue.sessions : []
      if (onlySessions.length > 0 && currentSession && !onlySessions.includes(currentSession)) return null
      const label = tr(t, 'openReader')
      return h('button', {
        type: 'button',
        className: 'dsr-openBtn',
        title: label,
        'aria-label': label,
        style: wide ? undefined : { justifyContent: 'center', padding: 0 },
        onClick: openBookshelf,
      }, h(IconBook, { size: wide ? 14 : 18 }), wide ? h('span', null, label) : null)
    }

    // ── bookshelf page (page tab body) ────────────────────────────────────
    function BookshelfBody(props) {
      const t = props.t
      const [state, setState] = useState({ status: 'loading' })
      const [expanded, setExpanded] = useState('')
      const [active, setActive] = useState(null)

      const load = useCallback(async () => {
        setState({ status: 'loading' })
        try {
          const data = await callApi('/books')
          setState({ status: 'ready', data })
          const first = (data.libraries || [])[0]
          if (first) setExpanded((current) => current || first.id)
        } catch (error) {
          setState({ status: 'error', error: String(error && error.message ? error.message : error) })
        }
      }, [])
      useEffect(() => {
        load()
      }, [load])

      if (active) {
        return h(Reader, { t, book: active, config: configValue, onBack: () => setActive(null), backLabel: tr(t, 'shelf') })
      }
      if (state.status === 'loading') {
        return h('div', { className: 'dsr-root' }, h('div', { className: 'dsr-empty' }, tr(t, 'loading')))
      }
      if (state.status === 'error') {
        return h('div', { className: 'dsr-root' },
          h('div', { className: 'dsr-empty' },
            h('div', null, tr(t, 'error') + '：' + state.error),
            h('div', { style: { marginTop: 10 } },
              h('button', { type: 'button', className: 'dsr-btn', onClick: load }, tr(t, 'retry')))))
      }
      const libraries = (state.data && state.data.libraries) || []
      const errors = (state.data && state.data.errors) || []
      if (libraries.length === 0) {
        return h('div', { className: 'dsr-root' },
          h('div', { className: 'dsr-setup' },
            h('h2', null, tr(t, 'setupTitle')),
            h('p', null, tr(t, 'setupBody')),
            errors.length > 0
              ? h('div', null, h('div', null, tr(t, 'setupErrors')),
                  h('ul', null, errors.map((message, index) => h('li', { key: index }, String(message)))))
              : null))
      }
      return h('div', { className: 'dsr-root' },
        h('div', { className: 'dsr-bar' },
          h('div', { className: 'dsr-title' }, tr(t, 'shelf')),
          h('div', { style: { flex: 1 } }),
          h('span', { className: 'dsr-count' }, libraries.length + ' ' + tr(t, 'chapterCount'))),
        h('div', { className: 'dsr-scroll' },
          libraries.map((library) => {
            const isOpen = expanded === library.id
            return h('div', { key: library.id },
              h('div', { className: 'dsr-book', onClick: () => setExpanded(isOpen ? '' : library.id) },
                h(IconChevron, { dir: isOpen ? 'down' : 'right' }),
                h('span', { className: 'dsr-bookTitle' }, library.title),
                h('span', { className: 'dsr-bookMeta' }, (library.chapters || []).length + ' ' + tr(t, 'chapterCount'))),
              isOpen
                ? (library.chapters || []).map((chapter, index) =>
                    h('div', {
                      key: chapter.id,
                      className: 'dsr-chapterRow',
                      onClick: () => setActive({
                        mode: 'library',
                        libraryId: library.id,
                        bookRoot: library.root,
                        annotationEnabled: true,
                        chapters: library.chapters,
                        index,
                        restore: true,
                      }),
                    },
                      h('span', { className: 'dsr-chapterNoB' }, index + 1),
                      h('span', { className: 'dsr-chapterName' }, chapter.title || chapter.id)))
                : null)
          })))
    }

    // ── file tab body (resource tab registered for *.md) ──────────────────
    function FileTabBody(props) {
      const t = props.t
      const [state, setState] = useState({ status: 'loading' })
      const [attempt, setAttempt] = useState(0)
      const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
      const address =
        (info && info.tab && info.tab.contentId) ||
        (props.tab && props.tab.contentId) ||
        props.resourceAddress ||
        props.contentId ||
        ''
      const onlySessions = configValue && Array.isArray(configValue.sessions) ? configValue.sessions : []
      const sessionAllowed =
        onlySessions.length === 0 || !props.sessionId || onlySessions.includes(props.sessionId)

      useEffect(() => {
        if (!address || !sessionAllowed) return undefined
        let cancelled = false
        ;(async () => {
          setState({ status: 'loading' })
          try {
            await loadConfig()
            const parsed = parseFileAddress(address)
            if (!parsed) throw new Error('unsupported address')
            const path = resolveClientPath(parsed.path)
            const data = await callApi('/resolve?path=' + enc(path))
            if (cancelled) return
            setState({
              status: 'ready',
              book: {
                mode: data.mode,
                libraryId: data.libraryId,
                bookRoot: data.bookRoot,
                annotationEnabled: data.annotationEnabled === true,
                chapters: data.chapters || [],
                index: Number.isInteger(data.index) ? data.index : 0,
              },
            })
          } catch (error) {
            if (!cancelled) setState({ status: 'error', error: String(error && error.message ? error.message : error) })
          }
        })()
        return () => {
          cancelled = true
        }
      }, [address, attempt, sessionAllowed])

      if (!address) return h(BookshelfBody, props)
      if (!sessionAllowed) {
        return h('div', { className: 'dsr-root' },
          h('div', { className: 'dsr-setup' },
            h('h2', null, tr(t, 'notThisSession')),
            h('p', null, tr(t, 'notThisSessionBody'))))
      }
      if (state.status === 'loading') return h('div', { className: 'dsr-root' }, h('div', { className: 'dsr-empty' }, tr(t, 'loading')))
      if (state.status === 'error') {
        return h('div', { className: 'dsr-root' },
          h('div', { className: 'dsr-empty' },
            h('div', null, tr(t, 'error') + '：' + state.error),
            h('div', { style: { marginTop: 10 } },
              h('button', { type: 'button', className: 'dsr-btn', onClick: () => setAttempt((value) => value + 1) }, tr(t, 'retry')))))
      }
      return h(Reader, { t, book: state.book, config: configValue })
    }

    // ── reader (shared by file tabs and the bookshelf) ────────────────────
    function Reader({ t, book, config, onBack, backLabel }) {
      const chaptersMeta = book.chapters || []
      const [loaded, setLoaded] = useState({})
      const [active, setActive] = useState(book.index || 0)
      const [tocOpen, setTocOpen] = useState(false)
      const [annOpen, setAnnOpen] = useState(false)
      const [form, setForm] = useState(null)
      const [selection, setSelection] = useState(null)
      const [toast, setToast] = useState(null)
      const [fontSize, setFontSize] = useState(() => readJson(UI_KEY, {}).fontSize || 16)
      const [error, setError] = useState('')

      const scrollRef = useRef(null)
      const sentinelRef = useRef(null)
      const pendingRef = useRef(new Set())
      const loadedRef = useRef(loaded)
      loadedRef.current = loaded
      const activeRef = useRef(active)
      activeRef.current = active
      const formRef = useRef(form)
      formRef.current = form
      const selectionRef = useRef(selection)
      selectionRef.current = selection
      const toastTimer = useRef(null)

      const showToast = useCallback((text, isError) => {
        if (toastTimer.current) window.clearTimeout(toastTimer.current)
        setToast({ text, isError: Boolean(isError) })
        toastTimer.current = window.setTimeout(() => setToast(null), 2600)
      }, [])
      useEffect(() => () => {
        if (toastTimer.current) window.clearTimeout(toastTimer.current)
      }, [])
      useEffect(() => {
        const saved = readJson(UI_KEY, {})
        writeJson(UI_KEY, { ...saved, fontSize })
      }, [fontSize])

      const load = useCallback(
        async (index) => {
          if (index < 0 || index >= chaptersMeta.length) return null
          if (loadedRef.current[index] || pendingRef.current.has(index)) return null
          pendingRef.current.add(index)
          const meta = chaptersMeta[index]
          try {
            const chapterQuery =
              book.mode === 'library'
                ? `/chapter?lib=${enc(book.libraryId)}&file=${enc(meta.id)}`
                : `/chapter?path=${enc(meta.chapterPath)}`
            const annotationQuery =
              book.mode === 'library' && book.annotationEnabled
                ? `/annotations?lib=${enc(book.libraryId)}&file=${enc(meta.id)}`
                : null
            const [chapterData, annotationData] = await Promise.all([
              callApi(chapterQuery),
              annotationQuery ? callApi(annotationQuery).catch(() => ({ comments: [] })) : Promise.resolve({ comments: [] }),
            ])
            const entry = {
              index,
              id: meta.id,
              title: chapterData.title || meta.title,
              text: chapterData.text || '',
              annotationPath: annotationData.annotationPath || meta.annotationPath || '',
              comments: Array.isArray(annotationData.comments) ? annotationData.comments : [],
            }
            setLoaded((previous) => (previous[index] ? previous : { ...previous, [index]: entry }))
            return entry
          } finally {
            pendingRef.current.delete(index)
          }
        },
        [book.mode, book.libraryId, book.annotationEnabled, chaptersMeta],
      )

      const bookKey = book.mode === 'library' ? 'lib:' + book.libraryId : 'root:' + (book.bookRoot || '')
      useEffect(() => {
        let cancelled = false
        const saved = readJson(PROGRESS_KEY, {})
        const remembered = Number.isInteger(saved[bookKey]) && saved[bookKey] >= 0 && saved[bookKey] < chaptersMeta.length ? saved[bookKey] : null
        const start = book.restore === true && remembered !== null ? remembered : book.index || 0
        setActive(start)
        ;(async () => {
          try {
            await load(start)
            if (!cancelled) await load(start + 1)
            if (!cancelled && start !== (book.index || 0)) window.setTimeout(() => jumpTo(start).catch(() => {}), 40)
          } catch (caught) {
            if (!cancelled) setError(String(caught && caught.message ? caught.message : caught))
          }
        })()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [book])

      useEffect(() => {
        if (chaptersMeta.length === 0) return
        const saved = readJson(PROGRESS_KEY, {})
        if (saved[bookKey] === active) return
        writeJson(PROGRESS_KEY, { ...saved, [bookKey]: active })
      }, [active, bookKey, chaptersMeta.length])

      const loadedIndexes = useMemo(() => Object.keys(loaded).map(Number).sort((a, b) => a - b), [loaded])

      useEffect(() => {
        const sentinel = sentinelRef.current
        const root = scrollRef.current
        if (!sentinel || !root) return undefined
        const observer = new window.IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return
            const last = loadedIndexes[loadedIndexes.length - 1]
            const next = loadedIndexes.length === 0 ? book.index || 0 : last + 1
            if (next >= chaptersMeta.length) return
            load(next).catch(() => {})
          },
          { root, rootMargin: '700px 0px' },
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
      }, [loadedIndexes, chaptersMeta.length, book.index, load])

      useEffect(() => {
        const root = scrollRef.current
        if (!root) return undefined
        let frame = 0
        const onScroll = () => {
          if (frame) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            const sections = root.querySelectorAll('[data-chapter-index]')
            let current = activeRef.current
            for (const section of sections) {
              if (section.offsetTop - root.scrollTop <= 80) current = Number(section.getAttribute('data-chapter-index'))
              else break
            }
            setActive(current)
          })
        }
        root.addEventListener('scroll', onScroll, { passive: true })
        return () => root.removeEventListener('scroll', onScroll)
      }, [])

      const jumpTo = useCallback(
        async (index) => {
          if (index < 0 || index >= chaptersMeta.length) return
          if (!loadedRef.current[index]) {
            try {
              await load(index)
            } catch (caught) {
              showToast(String(caught && caught.message ? caught.message : caught), true)
              return
            }
          }
          setTocOpen(false)
          window.setTimeout(() => {
            const root = scrollRef.current
            if (!root) return
            const section = root.querySelector(`[data-chapter-index="${index}"]`)
            if (section) root.scrollTop = section.offsetTop - 8
            setActive(index)
          }, 30)
        },
        [chaptersMeta.length, load, showToast],
      )

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (formRef.current) {
            setForm(null)
            event.stopPropagation()
          } else if (selectionRef.current) {
            setSelection(null)
            event.stopPropagation()
          } else if (tocOpen || annOpen) {
            setTocOpen(false)
            setAnnOpen(false)
            event.stopPropagation()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [tocOpen, annOpen])

      const activeChapter = loaded[active] || (loadedIndexes.length > 0 ? loaded[loadedIndexes[0]] : null)
      const activeIndex = activeChapter ? activeChapter.index : active

      const onMouseUp = useCallback(
        (event) => {
          if (!book.annotationEnabled) return
          if (event.target && event.target.closest && event.target.closest('.dsr-pop, .dsr-tool, .dsr-drawer')) return
          const sel = window.getSelection()
          if (!sel || sel.isCollapsed) {
            setSelection(null)
            return
          }
          const raw = sel.toString().trim()
          if (!raw) {
            setSelection(null)
            return
          }
          const range = sel.getRangeAt(0)
          const node = sel.anchorNode
          const element = node && node.nodeType === 3 ? node.parentElement : node
          const blockElement = element && element.closest ? element.closest('[data-block]') : null
          if (!blockElement || !scrollRef.current || !scrollRef.current.contains(blockElement)) {
            setSelection(null)
            return
          }
          const rect = range.getBoundingClientRect()
          setSelection({
            chapterId: blockElement.getAttribute('data-chapter-id'),
            block: Number(blockElement.getAttribute('data-block')) + 1,
            quote: raw.slice(0, 600),
            rect: { left: rect.left, top: rect.top, bottom: rect.bottom },
          })
        },
        [book.annotationEnabled],
      )

      const openFormForSelection = useCallback(() => {
        const pending = selectionRef.current
        if (!pending) return
        setForm({ mode: 'new', quote: pending.quote, block: pending.block, chapterId: pending.chapterId, rect: pending.rect, comment: null })
        setSelection(null)
      }, [])

      const openFormForMark = useCallback((chapter, commentId, rect) => {
        const comment = (chapter.comments || []).find((item) => item.id === commentId)
        if (!comment) return
        setForm({
          mode: 'edit',
          chapterId: chapter.id,
          block: comment.block,
          quote: comment.quote,
          rect,
          comment,
        })
      }, [])

      const applyComments = useCallback((chapterId, comments) => {
        setLoaded((previous) => {
          const next = { ...previous }
          for (const [key, value] of Object.entries(next)) {
            if (value.id === chapterId) next[Number(key)] = { ...value, comments }
          }
          return next
        })
      }, [])

      const saveComment = useCallback(
        async (payload) => {
          const chapter = Object.values(loadedRef.current).find((item) => item.id === payload.chapterId)
          if (!chapter || book.mode !== 'library') return
          try {
            const result = await callApi('/annotations', {
              method: 'POST',
              body: JSON.stringify({ lib: book.libraryId, file: chapter.id, op: 'save', comment: payload.comment }),
            })
            applyComments(chapter.id, result.comments || [])
            setForm(null)
            showToast(tr(t, 'save') + ' ✓')
          } catch (caught) {
            showToast(String(caught && caught.message ? caught.message : caught), true)
          }
        },
        [applyComments, book.libraryId, book.mode, showToast, t],
      )

      const mutateComment = useCallback(
        async (chapterId, op, id, resolved) => {
          try {
            const result = await callApi('/annotations', {
              method: 'POST',
              body: JSON.stringify({ lib: book.libraryId, file: chapterId, op, id, resolved }),
            })
            applyComments(chapterId, result.comments || [])
            if (op === 'delete') setForm(null)
          } catch (caught) {
            showToast(String(caught && caught.message ? caught.message : caught), true)
          }
        },
        [applyComments, book.libraryId, showToast],
      )

      const copyPrompt = useCallback(async () => {
        if (!activeChapter) return
        if (!activeChapter.comments || activeChapter.comments.length === 0) {
          showToast(tr(t, 'noAnnotations'))
          return
        }
        const meta = chaptersMeta[activeChapter.index] || {}
        const prompt = buildPrompt(config && config.promptTemplate, activeChapter.annotationPath || meta.annotationPath, meta.chapterPath || meta.id)
        try {
          await window.navigator.clipboard.writeText(prompt)
          showToast(tr(t, 'copied'))
        } catch {
          showToast(prompt, true)
        }
      }, [activeChapter, chaptersMeta, config, showToast, t])

      const copyPath = useCallback(async () => {
        if (!activeChapter || !activeChapter.annotationPath) return
        try {
          await window.navigator.clipboard.writeText(activeChapter.annotationPath)
          showToast(tr(t, 'copied'))
        } catch {
          showToast(activeChapter.annotationPath, true)
        }
      }, [activeChapter, showToast, t])

      const drawerComments = activeChapter ? activeChapter.comments || [] : []
      const unresolved = drawerComments.filter((comment) => !comment.resolved).length

      return h('div', { className: 'dsr-root' },
        h('div', { className: 'dsr-bar' },
          onBack ? h('button', { type: 'button', className: 'dsr-btn', title: backLabel || tr(t, 'back'), onClick: onBack }, h(IconChevron, { dir: 'left' }), backLabel || tr(t, 'back')) : null,
          h('button', { type: 'button', className: 'dsr-btn', disabled: activeIndex <= 0, title: tr(t, 'prev'), 'aria-label': tr(t, 'prev'), onClick: () => jumpTo(activeIndex - 1) }, h(IconChevron, { dir: 'left' })),
          h('button', { type: 'button', className: 'dsr-btn', disabled: activeIndex >= chaptersMeta.length - 1, title: tr(t, 'next'), 'aria-label': tr(t, 'next'), onClick: () => jumpTo(activeIndex + 1) }, h(IconChevron, { dir: 'right' })),
          h('div', { className: 'dsr-title' }, activeChapter ? activeChapter.title : ''),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'toc'), 'aria-label': tr(t, 'toc'), onClick: () => { setTocOpen((value) => !value); setAnnOpen(false) } }, h(IconList)),
          book.annotationEnabled
            ? h('button', { type: 'button', className: 'dsr-btn' + (annOpen ? ' dsr-btnOn' : ''), title: tr(t, 'annotations'), 'aria-label': tr(t, 'annotations'), onClick: () => { setAnnOpen((value) => !value); setTocOpen(false) } }, h(IconNote), unresolved > 0 ? String(unresolved) : '')
            : null,
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'sendToChat'), 'aria-label': tr(t, 'sendToChat'), onClick: copyPrompt }, '→'),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'fontSmaller'), 'aria-label': tr(t, 'fontSmaller'), onClick: () => setFontSize((value) => Math.max(13, value - 1)) }, 'A−'),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'fontLarger'), 'aria-label': tr(t, 'fontLarger'), onClick: () => setFontSize((value) => Math.min(30, value + 1)) }, 'A+')),
        h('div', { className: 'dsr-scroll', ref: scrollRef, onMouseUp: onMouseUp, style: { '--dsr-fs': fontSize + 'px' } },
          h('div', { className: 'dsr-doc' },
            loadedIndexes.map((index) => {
              const chapter = loaded[index]
              if (!chapter) return null
              return h(ChapterView, {
                key: chapter.id + ':' + index,
                t,
                chapter,
                index,
                onMarkClick: (commentId, rect) => openFormForMark(chapter, commentId, rect),
              })
            }),
            loadedIndexes.length >= chaptersMeta.length ? h('div', { className: 'dsr-hint' }, tr(t, 'endOfBook')) : null,
            h('div', { className: 'dsr-sentinel', ref: sentinelRef }),
            chaptersMeta.length === 0 ? h('div', { className: 'dsr-empty' }, tr(t, 'emptyBook')) : null,
            !book.annotationEnabled ? h('div', { className: 'dsr-hint' }, tr(t, 'readOnly')) : null,
            error ? h('div', { className: 'dsr-hint' }, error) : null)),
        tocOpen
          ? h('div', { className: 'dsr-drawer' },
              h('div', { className: 'dsr-drawerHead' },
                h('span', null, tr(t, 'toc')),
                h('span', { style: { flex: 1 } }),
                h('button', { type: 'button', className: 'dsr-btn', onClick: () => setTocOpen(false), title: tr(t, 'close') }, h(IconClose))),
              h('div', { className: 'dsr-drawerBody' },
                chaptersMeta.map((chapter, index) =>
                  h('div', {
                    key: chapter.id + index,
                    className: 'dsr-chapterRow' + (index === activeIndex ? ' dsr-chapterRowOn' : ''),
                    onClick: () => jumpTo(index),
                  },
                    h('span', { className: 'dsr-chapterNoB' }, index + 1),
                    h('span', { className: 'dsr-chapterName' }, chapter.title || chapter.id)))))
          : null,
        annOpen
          ? h('div', { className: 'dsr-drawer' },
              h('div', { className: 'dsr-drawerHead' },
                h('span', null, tr(t, 'annotations')),
                h('span', { style: { flex: 1 } }),
                h('span', null, drawerComments.length > 0 ? String(drawerComments.length) : ''),
                h('button', { type: 'button', className: 'dsr-btn', onClick: () => setAnnOpen(false), title: tr(t, 'close') }, h(IconClose))),
              h('div', { className: 'dsr-drawerBody' },
                drawerComments.length === 0
                  ? h('div', { className: 'dsr-empty' }, tr(t, 'noAnnotations'))
                  : drawerComments.map((comment) =>
                      h(AnnotationRow, {
                        key: comment.id,
                        t,
                        comment,
                        onOpen: (rect) => {
                          const chapter = loadedRef.current[activeIndex]
                          if (chapter) openFormForMark(chapter, comment.id, rect)
                        },
                        onResolve: () => activeChapter && mutateComment(activeChapter.id, 'resolve', comment.id, !comment.resolved),
                        onDelete: () => activeChapter && mutateComment(activeChapter.id, 'delete', comment.id),
                      })),
                activeChapter && activeChapter.annotationPath
                  ? h('div', { className: 'dsr-pathRow' },
                      h('span', { className: 'dsr-pathText', title: activeChapter.annotationPath }, activeChapter.annotationPath),
                      h('button', { type: 'button', className: 'dsr-btn', onClick: copyPath }, tr(t, 'copyPath')))
                  : null))
          : null,
        selection
          ? h('div', {
              className: 'dsr-tool',
              style: {
                left: Math.max(8, Math.min(window.innerWidth - 120, selection.rect.left)) + 'px',
                top: Math.max(8, selection.rect.top - 40) + 'px',
              },
              onMouseDown: (event) => event.preventDefault(),
            },
            h('button', { type: 'button', className: 'dsr-btn dsr-btnPrimary', onClick: openFormForSelection }, h(IconNote), tr(t, 'addAnnotation')))
          : null,
        form
          ? h(AnnotationForm, {
              key: form.mode + ':' + (form.comment ? form.comment.id : 'new:' + String(form.block) + ':' + form.quote),
              t,
              form,
              annotation: (config && config.annotation) || {},
              onCancel: () => setForm(null),
              onSave: saveComment,
              onDelete: form.mode === 'edit' ? () => mutateComment(form.chapterId, 'delete', form.comment.id) : null,
            })
          : null,
        toast ? h('div', { className: 'dsr-toast' + (toast.isError ? ' dsr-toastErr' : '') }, toast.text) : null)
    }

    // ── one chapter: heading + blocks + annotation highlights ─────────────
    function ChapterView({ t, chapter, index, onMarkClick }) {
      const blocks = useMemo(() => {
        const parsed = splitBlocks(chapter.text)
        if (parsed.length > 0 && parsed[0].kind === 'h1') parsed.shift()
        return parsed
      }, [chapter.text])
      const comments = chapter.comments || []

      // Renders one block of text with annotation highlights. `items` are the
      // comments anchored to this paragraph number (1-based).
      const markedNodes = (text, items, keyPrefix) => {
        const segments = items.length > 0 ? computeSegments(text, items) : [{ text }]
        return segments.map((segment, segmentIndex) => {
          if (segment.id === undefined) {
            return h(React.Fragment, { key: segmentIndex }, inlineNodes(segment.text, keyPrefix + 's' + segmentIndex))
          }
          const comment = items.find((item) => item.id === segment.id)
          return h('mark', {
            key: segmentIndex,
            className: 'dsr-mark' + (comment && comment.resolved ? ' dsr-markResolved' : ''),
            'data-cid': segment.id,
            title: comment ? comment.note : '',
            onClick: (event) => {
              event.stopPropagation()
              const rect = event.currentTarget.getBoundingClientRect()
              onMarkClick(segment.id, { left: rect.left, top: rect.top, bottom: rect.bottom })
            },
          }, inlineNodes(segment.text, keyPrefix + 'm' + segmentIndex))
        })
      }

      const renderBlock = (blockIndex) => {
        const block = blocks[blockIndex]
        const items = comments.filter((comment) => comment.block === blockIndex + 1)
        if (block.kind === 'hr') return h('hr', { className: 'dsr-hr' })
        if (block.kind === 'pre') return h('pre', { className: 'dsr-pre' }, h('code', null, block.text))
        if (block.kind === 'ul' || block.kind === 'ol') {
          const Tag = block.kind === 'ol' ? 'ol' : 'ul'
          return h(Tag, { key: block.kind + blockIndex, className: block.kind === 'ol' ? 'dsr-ol' : 'dsr-ul', 'data-block': blockIndex, 'data-chapter-id': chapter.id, 'data-chapter-index': index },
            (block.items || []).map((item, itemIndex) =>
              h('li', { key: itemIndex, className: 'dsr-li' }, markedNodes(item, items, 'li' + itemIndex + '-'))))
        }
        const nodes = markedNodes(block.text, items, 'b' + blockIndex + '-')
        if (block.kind === 'quote') {
          return h('blockquote', { key: 'q', className: 'dsr-quote', 'data-block': blockIndex, 'data-chapter-id': chapter.id, 'data-chapter-index': index }, nodes)
        }
        const tag = block.kind === 'p' ? 'p' : block.kind
        return h(tag, {
          key: 'b' + blockIndex,
          className: 'dsr-' + block.kind,
          'data-block': blockIndex,
          'data-chapter-id': chapter.id,
          'data-chapter-index': index,
        }, nodes)
      }

      return h('section', { className: 'dsr-chapter', 'data-chapter-index': index, 'data-chapter-id': chapter.id },
        h('div', { className: 'dsr-chapterNo' }, (index + 1) + ' / ' + tr(t, 'chapter')),
        h('h2', { className: 'dsr-h1' }, chapter.title || chapter.id),
        blocks.map((block, blockIndex) => h(React.Fragment, { key: blockIndex }, renderBlock(blockIndex))))
    }

    // ── annotation drawer row ─────────────────────────────────────────────
    function AnnotationRow({ t, comment, onOpen, onResolve, onDelete }) {
      const ref = useRef(null)
      const rectOf = () => {
        const rect = ref.current ? ref.current.getBoundingClientRect() : { left: 0, top: 0, bottom: 0 }
        return { left: rect.left, top: rect.top, bottom: rect.bottom }
      }
      return h('div', { ref, className: 'dsr-ann', onClick: () => onOpen(rectOf()) },
        h('div', { className: 'dsr-annTop' },
          h('span', { className: 'dsr-annId' }, comment.id),
          comment.type ? h('span', { className: 'dsr-badge dsr-badgeBrand' }, comment.type) : null,
          comment.conclusion ? h('span', { className: 'dsr-badge' }, comment.conclusion) : null,
          comment.resolved ? h('span', { className: 'dsr-badge dsr-badgeMuted' }, tr(t, 'resolved')) : null,
          h('span', { style: { flex: 1 } }),
          h('span', { className: 'dsr-annId' }, formatBlockLabel(t, comment.block))),
        comment.quote ? h('p', { className: 'dsr-annQuote' }, '「' + comment.quote + '」') : null,
        comment.note ? h('p', { className: 'dsr-annNote' }, comment.note) : null,
        h('div', { className: 'dsr-annActions' },
          h('button', { type: 'button', className: 'dsr-btn', onClick: (event) => { event.stopPropagation(); onResolve() } }, comment.resolved ? tr(t, 'reopen') : tr(t, 'resolve')),
          h('button', { type: 'button', className: 'dsr-btn dsr-btnDanger', onClick: (event) => { event.stopPropagation(); onDelete() } }, tr(t, 'delete'))))
    }

    // ── comment form popover ──────────────────────────────────────────────
    function AnnotationForm({ t, form, annotation, onCancel, onSave, onDelete }) {
      const types = annotation.types && annotation.types.length > 0 ? annotation.types : ['note']
      const conclusions = annotation.conclusions && annotation.conclusions.length > 0 ? annotation.conclusions : ['']
      const [type, setType] = useState(form.comment ? form.comment.type : types[0])
      const [conclusion, setConclusion] = useState(form.comment ? form.comment.conclusion : conclusions[0])
      const [note, setNote] = useState(form.comment ? form.comment.note || '' : '')
      const areaRef = useRef(null)
      useEffect(() => {
        if (areaRef.current) areaRef.current.focus()
      }, [])
      const rect = form.rect || { left: 0, top: 0, bottom: 0 }
      const width = 320
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))
      const height = 320
      const top = rect.bottom + 10 + height > window.innerHeight ? Math.max(8, rect.top - height - 10) : rect.bottom + 10
      return h('div', { className: 'dsr-pop', style: { left: left + 'px', top: top + 'px' }, onMouseUp: (event) => event.stopPropagation() },
        h('div', { className: 'dsr-popHead' },
          h(IconNote),
          h('span', null, form.mode === 'edit' ? tr(t, 'edit') : tr(t, 'addAnnotation')),
          h('span', { style: { flex: 1 } }),
          form.comment ? h('span', { className: 'dsr-annId' }, form.comment.id) : null),
        form.quote ? h('div', { className: 'dsr-quoted' }, '「' + form.quote + '」') : null,
        h('div', { className: 'dsr-row' },
          h('div', { className: 'dsr-field' },
            h('label', { className: 'dsr-label' }, tr(t, 'type')),
            h('select', { className: 'dsr-input', value: type, onChange: (event) => setType(event.target.value) },
              types.map((item) => h('option', { key: item, value: item }, item)))),
          h('div', { className: 'dsr-field' },
            h('label', { className: 'dsr-label' }, tr(t, 'conclusion')),
            h('select', { className: 'dsr-input', value: conclusion, onChange: (event) => setConclusion(event.target.value) },
              conclusions.map((item) => h('option', { key: item, value: item }, item || '—'))))),
        h('div', { className: 'dsr-field' },
          h('label', { className: 'dsr-label' }, tr(t, 'notePlaceholder')),
          h('textarea', {
            ref: areaRef,
            className: 'dsr-textarea',
            value: note,
            placeholder: tr(t, 'notePlaceholder'),
            onChange: (event) => setNote(event.target.value),
          })),
        h('div', { className: 'dsr-popFoot' },
          onDelete ? h('button', { type: 'button', className: 'dsr-btn dsr-btnDanger', onClick: onDelete }, tr(t, 'delete')) : null,
          h('div', { style: { flex: 1 } }),
          h('button', { type: 'button', className: 'dsr-btn', onClick: onCancel }, tr(t, 'cancel')),
          h('button', {
            type: 'button',
            className: 'dsr-btn dsr-btnPrimary',
            disabled: !note.trim(),
            onClick: () => onSave({
              chapterId: form.chapterId,
              comment: {
                ...(form.comment ? { id: form.comment.id } : {}),
                type,
                conclusion,
                note: note.trim(),
                quote: form.quote,
                block: form.block,
                resolved: form.comment ? Boolean(form.comment.resolved) : false,
              },
            }),
          }, tr(t, 'save'))))
    }

    // ── error boundary: a failing reader must never blank the Sidebar ─────
    class ReaderErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false, error: null }
      }
      static getDerivedStateFromError(error) {
        return { failed: true, error }
      }
      componentDidCatch(error, info) {
        try {
          console.warn('[dsh_reader] reader crashed', error, info)
        } catch {
          /* ignore */
        }
      }
      render() {
        if (this.state.failed) {
          const message = String((this.state.error && this.state.error.message) || this.state.error || '')
          return h('div', { className: 'dsr-root' },
            h('div', { className: 'dsr-setup' },
              h('h2', null, 'dsh_reader 渲染失败'),
              h('p', null, message),
              h('p', null, '刷新页面即可恢复内置预览；把上面的内容发给我可以定位问题。')))
        }
        return this.props.children
      }
    }
    function ReaderTabBody(props) {
      return h(ReaderErrorBoundary, null, h(FileTabBody, props))
    }
    function ShelfTabBody(props) {
      return h(ReaderErrorBoundary, null, h(BookshelfBody, props))
    }

    // ── plugin body ───────────────────────────────────────────────────────
    const READER_ID = 'dsh_reader/reader'
    const BOOKS_ID = 'dsh_reader/books'
    const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

    function apply(ctx) {
      sidebarRightRef = ctx.sidebarRight || null
      loadConfig().catch(() => {})

      ctx.effect(() => {
        const tag = ensureStyle()
        return () => {
          if (tag && tag.parentNode) tag.parentNode.removeChild(tag)
        }
      }, 'dsh_reader: styles')
      ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh_reader: dictionaries')

      // Markdown resource type: makes the reader the default way to open *.md
      // in the right Sidebar (the extension band outranks the built-in preview).
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: READER_ID,
            kind: READER_ID,
            patterns: ['*.md', '*.markdown'],
            priority: 'extension',
            canOpen: (address) => claimAddress(address),
            title: (address) => titleOfAddress(address),
          }),
        'dsh_reader: markdown tab type',
      )
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: READER_ID,
            locale: NS,
            inject: (sessionId) => ({ sessionId }),
          },
          ReaderTabBody,
        ))

      // Bookshelf page: opened from the left Sidebar; lists libraries and
      // chapters and opens them in place.
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: BOOKS_ID,
            kind: BOOKS_ID,
            title: () => DICTS.zh.shelf,
          }),
        'dsh_reader: bookshelf tab type',
      )
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: BOOKS_ID,
            locale: NS,
            inject: (sessionId) => ({ sessionId }),
          },
          ShelfTabBody,
        ))

      ctx.effect(
        () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'dsh_reader-open', order: 24, locale: NS },
            OpenButton,
          ),
        'dsh_reader: sidebar entry',
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'dsh_reader'
    exports.__test = {
      splitBlocks,
      inlineNodes,
      computeSegments,
      buildPrompt,
      stripFrontmatter,
      parseFileAddress,
      claimAddress,
      claimWith,
      // Exposed for harnesses that render the components outside the app.
      FileTabBody,
      BookshelfBody,
      Reader,
      ChapterView,
      AnnotationForm,
      OpenButton,
      ReaderErrorBoundary,
    }
    return module.exports
  },
})
