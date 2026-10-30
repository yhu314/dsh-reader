window.__ModuleLoader__.load({
  id: 'dsh-reader',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useState, useEffect, useRef, useCallback, useMemo } = React
    const h = React.createElement

    // ────────────────────────────────────────────────────────────────────
    // Dictionary (browser half). Locale files under `locale/` only carry the
    // plugin-manager display metadata; the UI strings live here so the module
    // stays a single classic script with no imports.
    // ────────────────────────────────────────────────────────────────────
    const NS = 'dsh-reader'
    const zh = {
      open: '阅读',
      title: '阅读器',
      toc: '目录',
      prev: '上一章',
      next: '下一章',
      fontSmaller: '缩小字号',
      fontLarger: '放大字号',
      annotations: '批注',
      annCount: '条批注',
      sendToChat: '送往对话',
      copied: '已复制修改指令，去对话里粘贴即可',
      copyFailed: '复制失败，请手动复制',
      close: '关闭',
      addAnnotation: '批注',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      resolve: '结案',
      reopen: '重新打开',
      resolved: '已结案',
      unresolved: '未结案',
      type: '类型',
      conclusion: '结论',
      notePlaceholder: '写下你的意见…',
      quote: '原文',
      edit: '编辑',
      noAnnotations: '这一章还没有批注',
      loading: '加载中…',
      endOfBook: '已经读到最后一章',
      setupTitle: '还没有配置书',
      setupBody:
        '在 profile 的 cordis.patch.yml 里给 dsh-reader 这一行配置 libraries（一个目录就是一本"书"，按文件名自然排序），保存后刷新页面。示例见插件 README。',
      setupErrors: '配置里有问题：',
      error: '出错了',
      retry: '重试',
      blockAt: '第 {n} 段',
      chapter: '章',
      noChapter: '这个目录里没有找到 markdown 文件',
      annotationFile: '批注文件',
      copyPath: '复制路径',
      progress: '阅读进度',
    }
    const en = {
      open: 'Read',
      title: 'Reader',
      toc: 'Contents',
      prev: 'Previous',
      next: 'Next',
      fontSmaller: 'Smaller text',
      fontLarger: 'Larger text',
      annotations: 'Annotations',
      annCount: 'annotations',
      sendToChat: 'Send to chat',
      copied: 'Copied — paste it in the chat',
      copyFailed: 'Copy failed — copy it manually',
      close: 'Close',
      addAnnotation: 'Annotate',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      resolve: 'Resolve',
      reopen: 'Reopen',
      resolved: 'Resolved',
      unresolved: 'Open',
      type: 'Type',
      conclusion: 'Conclusion',
      notePlaceholder: 'Write your note…',
      quote: 'Quote',
      edit: 'Edit',
      noAnnotations: 'No annotations in this chapter yet',
      loading: 'Loading…',
      endOfBook: 'End of the book',
      setupTitle: 'No books configured',
      setupBody:
        'Add `libraries` to the dsh-reader row in your profile’s cordis.patch.yml — one folder is one book, sorted naturally by file name — then reload the page. See the plugin README for an example.',
      setupErrors: 'Configuration problems:',
      error: 'Something went wrong',
      retry: 'Retry',
      blockAt: 'Paragraph {n}',
      chapter: 'chapter',
      noChapter: 'No markdown files found in this folder',
      annotationFile: 'Annotation file',
      copyPath: 'Copy path',
      progress: 'Reading progress',
    }
    const DICTS = { zh, en }

    function tr(t, key) {
      if (typeof t === 'function') {
        const value = t(key)
        if (typeof value === 'string' && value !== key) return value
      }
      return DICTS.zh[key] || key
    }

    // ────────────────────────────────────────────────────────────────────
    // Styles — injected by the plugin body and removed on unload.
    // ────────────────────────────────────────────────────────────────────
    const CSS_TAG = 'dsh-reader/reader.css'
    const css = `
.dsr-root{position:fixed;inset:0;z-index:2147482000;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#17181c);color:var(--dsw-alias-label-primary,#e8e9ee);font-size:13px;line-height:1.5;pointer-events:auto;-webkit-app-region:no-drag;padding-top:var(--dsh-frame-top-clearance,0px);box-sizing:border-box}
.dsr-top{flex:none;display:flex;align-items:center;gap:6px;height:46px;padding:0 10px 0 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-1,#1d1f24)}
.dsr-brand{flex:none;display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary,#a9adba);font-weight:600;letter-spacing:.02em;margin-right:4px}
.dsr-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;padding:0 8px;border:1px solid transparent;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary,#a9adba);font:inherit;font-size:12px;line-height:1;white-space:nowrap}
.dsr-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07));color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-btn:disabled{opacity:.4;cursor:default;background:0 0}
.dsr-btnOn,.dsr-btnOn:hover{background:var(--dsw-alias-interactive-bg-hover-accent,rgba(77,107,254,.18));color:var(--dsw-alias-brand-primary,#7d97ff)}
.dsr-btnPrimary{background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;border-color:transparent;font-weight:600}
.dsr-btnPrimary:hover{filter:brightness(1.08);background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}
.dsr-btnDanger{color:var(--dsw-alias-state-error-primary,#ff7b72)}
.dsr-spacer{flex:1;min-width:0}
.dsr-select{height:28px;max-width:230px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-2,#23252b);color:var(--dsw-alias-label-primary,#e8e9ee);font:inherit;font-size:12px;outline:none}
.dsr-select:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsr-count{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b8090);font-variant-numeric:tabular-nums}
.dsr-main{flex:1;min-height:0;display:flex}
.dsr-scroll{flex:1;min-width:0;overflow-y:auto;overflow-x:hidden;position:relative;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsr-doc{max-width:var(--dsr-width,720px);margin:0 auto;padding:40px 32px 45vh;font-size:var(--dsr-fs,18px);line-height:1.95;letter-spacing:.01em}
.dsr-chapter{position:relative}
.dsr-chapter + .dsr-chapter{margin-top:34px;padding-top:38px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}
.dsr-chapterHead{display:flex;align-items:baseline;gap:10px;margin:0 0 22px}
.dsr-chapterNo{flex:none;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-h1,.dsr-h2,.dsr-h3,.dsr-h4{color:var(--dsw-alias-label-primary,#e8e9ee);font-weight:650;line-height:1.4;margin:1.4em 0 .7em}
.dsr-h1{font-size:1.36em;margin-top:0}
.dsr-h2{font-size:1.2em}
.dsr-h3{font-size:1.08em}
.dsr-h4{font-size:1em}
.dsr-p{margin:0 0 .92em;text-align:justify;overflow-wrap:break-word}
.dsr-quote{margin:0 0 1em;padding:2px 0 2px 14px;border-left:2px solid var(--dsw-alias-border-l3,rgba(255,255,255,.2));color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-ul,.dsr-ol{margin:0 0 1em;padding-left:1.5em}
.dsr-li{margin:0 0 .35em}
.dsr-hr{border:none;height:1px;margin:2em auto;width:38%;background:var(--dsw-alias-border-l2,rgba(255,255,255,.14))}
.dsr-pre{margin:0 0 1em;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#23252b);overflow-x:auto;font-size:.86em;line-height:1.6}
.dsr-code{font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:.9em;padding:1px 5px;border-radius:5px;background:var(--dsw-alias-bg-layer-2,#23252b)}
.dsr-link{color:var(--dsw-alias-brand-primary,#7d97ff);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#7d97ff) 45%,transparent)}
.dsr-link:hover{border-bottom-color:currentColor}
.dsr-mark{background:rgba(77,107,254,.2);box-shadow:inset 0 -2px 0 rgba(77,107,254,.55);border-radius:3px;cursor:pointer;color:inherit;padding:0 1px}
.dsr-mark:hover{background:rgba(77,107,254,.3)}
.dsr-markResolved{background:rgba(120,130,145,.18);box-shadow:inset 0 -2px 0 rgba(120,130,145,.45)}
.dsr-sentinel{height:1px}
.dsr-loadHint{display:flex;justify-content:center;padding:20px 0 0;color:var(--dsw-alias-label-tertiary,#7b8090);font-size:12px}
.dsr-drawer{flex:none;width:336px;min-width:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-1,#1d1f24)}
.dsr-drawerHead{flex:none;display:flex;align-items:center;gap:8px;height:38px;padding:0 8px 0 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-drawerBody{flex:1;min-height:0;overflow-y:auto;padding:8px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsr-empty{padding:28px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,#7b8090);font-size:12px;line-height:1.7}
.dsr-ann{padding:9px 10px 10px;border-radius:10px;margin-bottom:6px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));border:1px solid transparent;cursor:pointer}
.dsr-ann:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.12))}
.dsr-annOn{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsr-annTop{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.dsr-badge{flex:none;display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;font-size:11px;line-height:1;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08));color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-badgeBrand{background:rgba(77,107,254,.16);color:var(--dsw-alias-brand-primary,#7d97ff)}
.dsr-badgeMuted{background:rgba(120,130,145,.16);color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-annId{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-annQuote{margin:0 0 4px;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#a9adba);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsr-annNote{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary,#e8e9ee);white-space:pre-wrap;overflow-wrap:break-word}
.dsr-annActions{display:flex;gap:2px;justify-content:flex-end;margin-top:5px;opacity:0;transition:opacity .12s}
.dsr-ann:hover .dsr-annActions,.dsr-annOn .dsr-annActions{opacity:1}
.dsr-tool{position:fixed;pointer-events:auto;-webkit-app-region:no-drag;z-index:2147482500;display:flex;gap:4px;padding:4px;border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#23252b));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 10px 30px rgba(0,0,0,.4)}
.dsr-pop{position:fixed;pointer-events:auto;-webkit-app-region:no-drag;z-index:2147482500;width:340px;max-height:min(78vh,520px);overflow-y:auto;padding:12px;border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#23252b));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 14px 44px rgba(0,0,0,.45);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2)}
.dsr-popHead{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#a9adba)}
.dsr-quoted{margin:0 0 10px;padding:7px 10px;border-radius:8px;background:rgba(77,107,254,.1);border-left:2px solid rgba(77,107,254,.6);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#a9adba);max-height:92px;overflow:auto;white-space:pre-wrap}
.dsr-field{margin-bottom:8px}
.dsr-label{display:block;margin-bottom:3px;font-size:11px;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-input,.dsr-textarea{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:var(--dsw-alias-bg-layer-2,#23252b);color:var(--dsw-alias-label-primary,#e8e9ee);font:inherit;font-size:13px;outline:none}
.dsr-input:focus,.dsr-textarea:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsr-textarea{min-height:84px;resize:vertical;line-height:1.6}
.dsr-row{display:flex;gap:8px}
.dsr-row > .dsr-field{flex:1;min-width:0}
.dsr-popFoot{display:flex;align-items:center;gap:6px;margin-top:10px}
.dsr-popFoot .dsr-spacer{flex:1}
.dsr-toast{position:fixed;pointer-events:none;-webkit-app-region:no-drag;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147482600;padding:9px 16px;border-radius:10px;background:var(--dsw-alias-bg-mask-3,rgba(0,0,0,.72));color:#fff;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:none}
.dsr-toastErr{background:rgba(180,40,40,.92)}
.dsr-setup{max-width:560px;margin:64px auto;padding:0 32px;color:var(--dsw-alias-label-secondary,#a9adba);font-size:13px;line-height:1.8}
.dsr-setup h2{margin:0 0 10px;font-size:16px;color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-setup code{padding:1px 5px;border-radius:5px;background:var(--dsw-alias-bg-layer-2,#23252b);font-size:12px}
.dsr-setup ul{margin:10px 0 0;padding-left:20px;color:var(--dsw-alias-state-warn-primary,#e6a23c);font-size:12px}
.dsr-pathRow{display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));font-size:11px;color:var(--dsw-alias-label-tertiary,#7b8090)}
.dsr-pathText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.dsr-openBtn{cursor:pointer;display:flex;align-items:center;gap:8px;height:36px;width:100%;padding:0 12px;border:none;border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary,#a9adba);font:inherit;font-size:13px;line-height:1;text-align:left}
.dsr-openBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07));color:var(--dsw-alias-label-primary,#e8e9ee)}
`

    function ensureStyle() {
      const tag = `style[data-plugin-css=${JSON.stringify(CSS_TAG)}]`
      const existing = document.querySelector(tag)
      if (existing) return existing
      const el = document.createElement('style')
      el.dataset.plugin = 'dsh-reader'
      el.dataset.pluginCss = CSS_TAG
      el.textContent = css
      document.head.appendChild(el)
      return el
    }

    // ────────────────────────────────────────────────────────────────────
    // Tiny external store for the panel's open state (shared by the sidebar
    // entry and the overlay panel).
    // ────────────────────────────────────────────────────────────────────
    const uiListeners = new Set()
    let uiState = { open: false }
    const ui = {
      get: () => uiState,
      set: (patch) => {
        uiState = { ...uiState, ...patch }
        uiListeners.forEach((fn) => fn())
      },
      subscribe: (fn) => {
        uiListeners.add(fn)
        return () => uiListeners.delete(fn)
      },
    }
    function useUi(selector) {
      const [value, setValue] = useState(() => selector(uiState))
      useEffect(() => ui.subscribe(() => setValue(selector(uiState))), [])
      return value
    }

    // ────────────────────────────────────────────────────────────────────
    // Host API client
    // ────────────────────────────────────────────────────────────────────
    const API = '/api/dsh-reader'

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
      if (!response.ok) {
        const message = data && data.error ? data.error : `HTTP ${response.status}`
        throw new Error(message)
      }
      return data
    }

    // ────────────────────────────────────────────────────────────────────
    // Markdown: block splitting + a small inline renderer.
    // Deliberately dependency-free and prose-oriented: headings, paragraphs,
    // scene breaks, quotes, lists, fenced code, and inline emphasis/links.
    // ────────────────────────────────────────────────────────────────────
    // A `---` at the top of the file is frontmatter only when a closing fence
    // exists and the block actually looks like YAML keys. Otherwise the line is
    // an ordinary scene break.
    function stripFrontmatter(lines) {
      if (lines.length === 0) return lines
      if (lines[0].trim() !== '---') return lines
      for (let i = 1; i < lines.length; i += 1) {
        const t = lines[i].trim()
        if (t === '---' || t === '...') {
          const body = lines.slice(1, i)
          const looksLikeYaml = body.some((line) => /^[A-Za-z0-9_-]+\s*:/.test(line))
          return looksLikeYaml ? lines.slice(i + 1) : lines
        }
      }
      return lines
    }

    const CJK_END = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]$/
    const CJK_START = /^[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/

    // Soft line breaks inside a paragraph: CJK prose joins without a space,
    // Latin text joins with one.
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
          } else {
            code.push(raw)
          }
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
          // lazy continuation of the previous list item
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

    // Inline markdown → array of React nodes. Kept small and safe: no HTML.
    function inlineNodes(text, keyPrefix) {
      const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|~~(.+?)~~/g
      const nodes = []
      let last = 0
      let match
      let index = 0
      const pushText = (value) => {
        if (value) nodes.push(value)
      }
      while ((match = pattern.exec(text)) !== null) {
        pushText(text.slice(last, match.index))
        const key = `${keyPrefix || 'i'}-${index++}`
        if (match[2] !== undefined) nodes.push(h('strong', { key }, match[2]))
        else if (match[4] !== undefined) nodes.push(h('em', { key }, match[4]))
        else if (match[5] !== undefined) nodes.push(h('code', { key, className: 'dsr-code' }, match[5]))
        else if (match[6] !== undefined) {
          nodes.push(
            h(
              'a',
              {
                key,
                className: 'dsr-link',
                href: match[7],
                target: '_blank',
                rel: 'noreferrer noopener',
                onClick: (event) => event.stopPropagation(),
              },
              match[6],
            ),
          )
        } else if (match[8] !== undefined) nodes.push(h('del', { key }, match[8]))
        last = pattern.lastIndex
      }
      pushText(text.slice(last))
      return nodes
    }

    // Split a paragraph's text into plain/highlighted segments for the given
    // annotation quotes. Later/overlapping matches are skipped.
    function computeSegments(text, items) {
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
      const source =
        template && String(template).trim()
          ? String(template)
          : '请按 {annotationFile} 中的批注修改 {chapterFile}。'
      return source
        .split('{annotationFile}').join(annotationFile || '')
        .split('{chapterFile}').join(chapterFile || '')
        .split('{annotationDir}').join('')
    }

    // ────────────────────────────────────────────────────────────────────
    // Persisted UI state
    // ────────────────────────────────────────────────────────────────────
    const UI_KEY = 'dsh.reader.ui.v1'
    const POS_KEY = 'dsh.reader.pos.v1'

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
        /* ignore quota / privacy failures */
      }
    }

    // Annotation `block` values are 1-based paragraph numbers (they read well
    // in the exported markdown); DOM blocks carry the 0-based index.
    function formatBlockLabel(t, blockNumber) {
      if (!blockNumber) return '—'
      return tr(t, 'blockAt').split('{n}').join(String(blockNumber))
    }

    // ────────────────────────────────────────────────────────────────────
    // Icons
    // ────────────────────────────────────────────────────────────────────
    function IconBook({ size }) {
      const s = size || 16
      return h(
        'svg',
        { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 1.5, y: 2, width: 13, height: 12, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M4.6 4.6h6.8M4.6 7.2h6.8M4.6 9.8h4.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.75 }),
      )
    }
    function IconClose({ size }) {
      const s = size || 14
      return h(
        'svg',
        { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }
    function IconChevron({ dir, size }) {
      const s = size || 14
      const path = dir === 'left' ? 'M9.6 3.6L5.2 8l4.4 4.4' : 'M6.4 3.6L10.8 8l-4.4 4.4'
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: path, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }
    function IconNote({ size }) {
      const s = size || 14
      return h(
        'svg',
        { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.2 3.4h9.6v6.4L9.4 13H3.2z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }),
        h('path', { d: 'M6.2 6.4h4M6.2 8.6h2.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.7 }),
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // Sidebar entry
    // ────────────────────────────────────────────────────────────────────
    function OpenButton({ t, wide }) {
      const open = useUi((state) => state.open)
      const label = tr(t, 'open')
      return h(
        'button',
        {
          type: 'button',
          className: 'dsr-openBtn',
          title: label,
          'aria-label': label,
          'aria-pressed': open,
          style: wide ? undefined : { justifyContent: 'center', padding: 0 },
          onClick: () => ui.set({ open: true }),
        },
        h(IconBook, { size: wide ? 14 : 18 }),
        wide ? h('span', null, label) : null,
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // Overlay panel host
    // ────────────────────────────────────────────────────────────────────
    function ReaderPanel(props) {
      const open = useUi((state) => state.open)
      if (!open) return null
      return h(Reader, { t: props.t, onClose: () => ui.set({ open: false }) })
    }

    // ────────────────────────────────────────────────────────────────────
    // Reader
    // ────────────────────────────────────────────────────────────────────
    function Reader({ t, onClose }) {
      const [boot, setBoot] = useState({ status: 'loading' })
      const [libId, setLibId] = useState(null)
      const [chapters, setChapters] = useState([])
      const [active, setActive] = useState(0)
      const [drawer, setDrawer] = useState(false)
      const [form, setForm] = useState(null)
      const [selection, setSelection] = useState(null)
      const [toast, setToast] = useState(null)
      const [uiState] = useState(() => readJson(UI_KEY, {}))
      const [fontSize, setFontSize] = useState(uiState.fontSize || 18)

      const scrollRef = useRef(null)
      const sentinelRef = useRef(null)
      const chainRef = useRef(Promise.resolve())
      const pendingRef = useRef(new Set())
      const countRef = useRef(0)
      const chaptersRef = useRef(chapters)
      chaptersRef.current = chapters
      const activeRef = useRef(active)
      activeRef.current = active
      const formRef = useRef(null)
      formRef.current = form
      const selectionRef = useRef(null)
      selectionRef.current = selection
      const toastTimer = useRef(null)

      const showToast = useCallback((text, isError) => {
        if (toastTimer.current) window.clearTimeout(toastTimer.current)
        setToast({ text, isError: Boolean(isError), id: Date.now() })
        toastTimer.current = window.setTimeout(() => setToast(null), 2600)
      }, [])

      const fetchBooks = useCallback(async () => {
        setBoot({ status: 'loading' })
        try {
          const data = await callApi('/books')
          const libraries = Array.isArray(data.libraries) ? data.libraries : []
          setBoot({ status: 'ready', data })
          if (libraries.length > 0) {
            const saved = readJson(POS_KEY, {})
            const preferred = libraries.find((library) => library.id === saved.libId) || libraries[0]
            setLibId(preferred.id)
          }
        } catch (error) {
          setBoot({ status: 'error', error: String(error && error.message ? error.message : error) })
        }
      }, [])

      useEffect(() => {
        fetchBooks()
        return () => {
          if (toastTimer.current) window.clearTimeout(toastTimer.current)
        }
      }, [fetchBooks])

      const ready = boot.status === 'ready'
      const data = ready ? boot.data : null
      const library = data && data.libraries ? data.libraries.find((item) => item.id === libId) : null
      const chapterList = library ? library.chapters || [] : []
      const listRef = useRef(chapterList)
      listRef.current = chapterList
      const libIdRef = useRef(libId)
      libIdRef.current = libId

      // Persist font size + reading position.
      useEffect(() => {
        const saved = readJson(UI_KEY, {})
        writeJson(UI_KEY, { ...saved, fontSize })
      }, [fontSize])
      useEffect(() => {
        if (!libId) return
        const saved = readJson(POS_KEY, {})
        writeJson(POS_KEY, { ...saved, libId, [libId]: active })
      }, [active, libId])

      // Loader for one chapter (text + annotations), appended in order.
      const loadChapterAt = useCallback(
        async (index) => {
          const list = listRef.current
          const meta = list[index]
          const currentLib = libIdRef.current
          if (!meta || !currentLib) return null
          if (index < countRef.current || pendingRef.current.has(index)) return null
          pendingRef.current.add(index)
          const query = `?lib=${encodeURIComponent(currentLib)}&file=${encodeURIComponent(meta.id)}`
          try {
            const [chapterData, annotationData] = await Promise.all([
              callApi('/chapter' + query),
              callApi('/annotations' + query).catch(() => ({ comments: [] })),
            ])
            const entry = {
              index,
              id: meta.id,
              title: chapterData.title || meta.title,
              text: chapterData.text || '',
              annotationPath: annotationData.annotationPath || meta.annotationPath || '',
              annotationFile: annotationData.annotationFile || meta.annotationFile || '',
              comments: Array.isArray(annotationData.comments) ? annotationData.comments : [],
            }
            countRef.current = Math.max(countRef.current, index + 1)
            setChapters((previous) => {
              if (previous.some((chapter) => chapter.index === index)) return previous
              const next = previous.concat(entry)
              next.sort((a, b) => a.index - b.index)
              return next
            })
            return entry
          } finally {
            pendingRef.current.delete(index)
          }
        },
        [],
      )

      // Serialized loader: every caller appends the next missing chapter and
      // waits for the ones queued before it, so the reader never leaves gaps.
      const loadNext = useCallback(() => {
        const run = chainRef.current.then(async () => {
          if (countRef.current >= listRef.current.length) return
          try {
            await loadChapterAt(countRef.current)
          } catch (error) {
            showToast(String(error && error.message ? error.message : error), true)
          }
        })
        chainRef.current = run.catch(() => {})
        return run
      }, [loadChapterAt, showToast])

      // Initial range for a library (restores the saved chapter).
      useEffect(() => {
        if (!library) return undefined
        let cancelled = false
        const saved = readJson(POS_KEY, {})
        const savedIndex = Number.isInteger(saved[library.id]) ? saved[library.id] : 0
        const target = Math.max(0, Math.min(savedIndex + 1, chapterList.length - 1))
        countRef.current = 0
        pendingRef.current = new Set()
        setChapters([])
        setActive(0)
        ;(async () => {
          while (!cancelled && countRef.current <= target) {
            const before = countRef.current
            await loadNext()
            if (countRef.current === before) break
          }
          if (!cancelled && target > 0) {
            window.setTimeout(() => jumpToIndex(target), 60)
          }
        })()
        return () => {
          cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [library && library.id, boot.status])

      // Infinite scroll: observe the sentinel.
      useEffect(() => {
        if (!ready || !library) return undefined
        const sentinel = sentinelRef.current
        const root = scrollRef.current
        if (!sentinel || !root) return undefined
        const observer = new window.IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) loadNext()
          },
          { root, rootMargin: '900px 0px' },
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
      }, [ready, library, chapters.length, loadNext])

      // Track the chapter under the reading line.
      useEffect(() => {
        const root = scrollRef.current
        if (!root) return undefined
        let frame = 0
        const onScroll = () => {
          if (frame) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            const sections = root.querySelectorAll('[data-chapter-index]')
            let current = 0
            for (const section of sections) {
              if (section.offsetTop - root.scrollTop <= 96) {
                current = Number(section.getAttribute('data-chapter-index'))
              } else break
            }
            setActive(current)
          })
        }
        root.addEventListener('scroll', onScroll, { passive: true })
        return () => root.removeEventListener('scroll', onScroll)
      }, [ready, library])

      // Escape closes the popover first, then the reader.
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (formRef.current) {
            setForm(null)
            event.stopPropagation()
          } else if (selectionRef.current) {
            setSelection(null)
            event.stopPropagation()
          } else {
            onClose()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [onClose])

      const jumpToIndex = useCallback((index) => {
        const root = scrollRef.current
        if (!root) return
        const section = root.querySelector(`[data-chapter-index="${index}"]`)
        if (!section) return
        root.scrollTop = section.offsetTop - 12
      }, [])

      const goTo = useCallback(
        async (index) => {
          if (index < 0 || index >= listRef.current.length) return
          let guard = 0
          while (countRef.current <= index && guard < 400) {
            const before = countRef.current
            await loadNext()
            guard += 1
            if (countRef.current === before) break
          }
          window.setTimeout(() => jumpToIndex(index), 30)
          setActive(index)
        },
        [jumpToIndex, loadNext],
      )

      // Selection → floating "annotate" button.
      const onMouseUp = useCallback((event) => {
        if (event.target && event.target.closest && event.target.closest('.dsr-pop, .dsr-tool')) return
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
        let node = sel.anchorNode
        const element = node && node.nodeType === 3 ? node.parentElement : node
        const blockElement =
          element && element.closest ? element.closest('[data-block]') : null
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
      }, [])

      const openFormForSelection = useCallback(() => {
        const pending = selectionRef.current
        if (!pending) return
        setForm({
          mode: 'new',
          chapterId: pending.chapterId,
          block: pending.block,
          quote: pending.quote,
          rect: pending.rect,
          comment: null,
        })
        setSelection(null)
      }, [])

      const openFormForMark = useCallback((commentId, rect) => {
        const chapter = chaptersRef.current.find((item) =>
          item.comments.some((comment) => comment.id === commentId),
        )
        const comment = chapter && chapter.comments.find((item) => item.id === commentId)
        if (!chapter || !comment) return
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
        setChapters((previous) =>
          previous.map((chapter) => (chapter.id === chapterId ? { ...chapter, comments } : chapter)),
        )
      }, [])

      const saveComment = useCallback(
        async (payload) => {
          const chapter = chaptersRef.current.find((item) => item.id === payload.chapterId)
          if (!chapter) return
          try {
            const result = await callApi('/annotations', {
              method: 'POST',
              body: JSON.stringify({
                lib: libIdRef.current,
                file: chapter.id,
                op: 'save',
                comment: payload.comment,
              }),
            })
            applyComments(chapter.id, result.comments || [])
            if (result.annotationPath) {
              setChapters((previous) =>
                previous.map((item) =>
                  item.id === chapter.id ? { ...item, annotationPath: result.annotationPath } : item,
                ),
              )
            }
            setForm(null)
            showToast(tr(t, 'save') + ' ✓')
          } catch (error) {
            showToast(String(error && error.message ? error.message : error), true)
          }
        },
        [applyComments, showToast, t],
      )

      const mutateComment = useCallback(
        async (chapterId, op, id, resolved) => {
          try {
            const result = await callApi('/annotations', {
              method: 'POST',
              body: JSON.stringify({ lib: libIdRef.current, file: chapterId, op, id, resolved }),
            })
            applyComments(chapterId, result.comments || [])
            if (op === 'delete') setForm(null)
          } catch (error) {
            showToast(String(error && error.message ? error.message : error), true)
          }
        },
        [applyComments, showToast],
      )

      const copyPrompt = useCallback(async () => {
        const chapter = chaptersRef.current.find((item) => item.index === activeRef.current)
        if (!chapter) return
        if (!chapter.comments || chapter.comments.length === 0) {
          showToast(tr(t, 'noAnnotations'))
          return
        }
        const prompt = buildPrompt(
          data && data.promptTemplate,
          chapter.annotationPath,
          chapter.id,
        )
        try {
          await window.navigator.clipboard.writeText(prompt)
          showToast(tr(t, 'copied'))
        } catch {
          showToast(prompt + ' — ' + tr(t, 'copyFailed'), true)
        }
      }, [data, showToast, t])

      const copyPath = useCallback(async () => {
        const chapter = chaptersRef.current.find((item) => item.index === activeRef.current)
        if (!chapter || !chapter.annotationPath) return
        try {
          await window.navigator.clipboard.writeText(chapter.annotationPath)
          showToast(tr(t, 'copied'))
        } catch {
          showToast(chapter.annotationPath, true)
        }
      }, [showToast, t])

      const activeChapter = chapters.find((chapter) => chapter.index === active) || chapters[0] || null
      const total = chapterList.length

      // ── render ──────────────────────────────────────────────────────────
      if (boot.status === 'loading') {
        return h('div', { className: 'dsr-root' }, h('div', { className: 'dsr-empty' }, tr(t, 'loading')))
      }
      if (boot.status === 'error') {
        return h(
          'div',
          { className: 'dsr-root' },
          h('div', { className: 'dsr-empty' },
            h('div', null, tr(t, 'error') + '：' + boot.error),
            h('div', { style: { marginTop: 12 } },
              h('button', { type: 'button', className: 'dsr-btn', onClick: fetchBooks }, tr(t, 'retry')),
              h('button', { type: 'button', className: 'dsr-btn', onClick: onClose }, tr(t, 'close')),
            ),
          ),
        )
      }
      if (!library) {
        return h(
          'div',
          { className: 'dsr-root' },
          h('div', { className: 'dsr-top' },
            h('div', { className: 'dsr-brand' }, h(IconBook, { size: 16 }), tr(t, 'title')),
            h('div', { className: 'dsr-spacer' }),
            h('button', { type: 'button', className: 'dsr-btn', onClick: onClose, title: tr(t, 'close'), 'aria-label': tr(t, 'close') }, h(IconClose)),
          ),
          h('div', { className: 'dsr-setup' },
            h('h2', null, tr(t, 'setupTitle')),
            h('p', null, tr(t, 'setupBody')),
            data && data.errors && data.errors.length > 0
              ? h('div', null,
                  h('div', null, tr(t, 'setupErrors')),
                  h('ul', null, data.errors.map((message, index) => h('li', { key: index }, message))))
              : null,
          ),
        )
      }

      const drawerComments = activeChapter ? activeChapter.comments || [] : []
      const unresolved = drawerComments.filter((comment) => !comment.resolved).length

      return h(
        'div',
        { className: 'dsr-root' },
        // ── top bar ──
        h(
          'div',
          { className: 'dsr-top' },
          h('div', { className: 'dsr-brand' }, h(IconBook, { size: 16 }), tr(t, 'title')),
          data.libraries.length > 1
            ? h(
                'select',
                {
                  className: 'dsr-select',
                  title: tr(t, 'chapter'),
                  value: libId || '',
                  onChange: (event) => setLibId(event.target.value),
                },
                data.libraries.map((item) => h('option', { key: item.id, value: item.id }, item.title)),
              )
            : null,
          h(
            'select',
            {
              className: 'dsr-select',
              title: tr(t, 'toc'),
              value: String(active),
              onChange: (event) => goTo(Number(event.target.value)),
            },
            chapterList.map((item, index) =>
              h('option', { key: item.id, value: String(index) },
                (index + 1) + '. ' + (item.title || item.id)),
            ),
          ),
          h('button', { type: 'button', className: 'dsr-btn', disabled: active <= 0, title: tr(t, 'prev'), 'aria-label': tr(t, 'prev'), onClick: () => goTo(active - 1) }, h(IconChevron, { dir: 'left' })),
          h('button', { type: 'button', className: 'dsr-btn', disabled: active >= total - 1, title: tr(t, 'next'), 'aria-label': tr(t, 'next'), onClick: () => goTo(active + 1) }, h(IconChevron, { dir: 'right' })),
          h('div', { className: 'dsr-spacer' }),
          h('span', { className: 'dsr-count' }, (active + 1) + ' / ' + total),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'fontSmaller'), 'aria-label': tr(t, 'fontSmaller'), onClick: () => setFontSize((value) => Math.max(13, value - 1)) }, 'A−'),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'fontLarger'), 'aria-label': tr(t, 'fontLarger'), onClick: () => setFontSize((value) => Math.min(30, value + 1)) }, 'A+'),
          h('button', {
            type: 'button',
            className: 'dsr-btn' + (drawer ? ' dsr-btnOn' : ''),
            title: tr(t, 'annotations'),
            'aria-pressed': drawer,
            onClick: () => setDrawer((value) => !value),
          }, h(IconNote, { size: 14 }), unresolved > 0 ? String(unresolved) : ''),
          h('button', {
            type: 'button',
            className: 'dsr-btn',
            title: tr(t, 'sendToChat'),
            onClick: copyPrompt,
          }, tr(t, 'sendToChat'), ' →'),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'close'), 'aria-label': tr(t, 'close'), onClick: onClose }, h(IconClose, { size: 16 })),
        ),
        // ── main ──
        h(
          'div',
          { className: 'dsr-main' },
          h(
            'div',
            {
              className: 'dsr-scroll',
              ref: scrollRef,
              onMouseUp: onMouseUp,
              style: { '--dsr-fs': fontSize + 'px' },
            },
            h(
              'div',
              { className: 'dsr-doc' },
              chapters.map((chapter) =>
                h(ChapterView, {
                  key: chapter.id,
                  t,
                  chapter,
                  onMarkClick: openFormForMark,
                }),
              ),
              total > 0 && chapters.length >= total
                ? h('div', { className: 'dsr-loadHint' }, tr(t, 'endOfBook'))
                : null,
              h('div', { className: 'dsr-sentinel', ref: sentinelRef }),
              total === 0 ? h('div', { className: 'dsr-empty' }, tr(t, 'noChapter')) : null,
            ),
          ),
          drawer
            ? h(
                'div',
                { className: 'dsr-drawer' },
                h('div', { className: 'dsr-drawerHead' },
                  h('span', null, tr(t, 'annotations')),
                  h('span', { className: 'dsr-spacer' }),
                  h('span', null, drawerComments.length > 0 ? String(drawerComments.length) : ''),
                ),
                h(
                  'div',
                  { className: 'dsr-drawerBody' },
                  drawerComments.length === 0
                    ? h('div', { className: 'dsr-empty' }, tr(t, 'noAnnotations'))
                    : drawerComments.map((comment) =>
                        h(AnnotationRow, {
                          key: comment.id,
                          t,
                          comment,
                          onOpen: (rect) => openFormForMark(comment.id, rect),
                          onResolve: () => mutateComment(activeChapter.id, 'resolve', comment.id, !comment.resolved),
                          onDelete: () => mutateComment(activeChapter.id, 'delete', comment.id),
                        }),
                      ),
                  activeChapter && activeChapter.annotationPath
                    ? h('div', { className: 'dsr-pathRow' },
                        h('span', null, tr(t, 'annotationFile') + '：'),
                        h('span', { className: 'dsr-pathText', title: activeChapter.annotationPath }, activeChapter.annotationPath),
                        h('button', { type: 'button', className: 'dsr-btn', onClick: copyPath }, tr(t, 'copyPath')))
                    : null,
                ),
              )
            : null,
        ),
        // ── selection toolbar ──
        selection
          ? h(
              'div',
              {
                className: 'dsr-tool',
                style: {
                  left: Math.max(8, Math.min(window.innerWidth - 120, selection.rect.left)) + 'px',
                  top: Math.max(8, selection.rect.top - 42) + 'px',
                },
                onMouseDown: (event) => event.preventDefault(),
              },
              h('button', { type: 'button', className: 'dsr-btn dsr-btnPrimary', onClick: openFormForSelection }, h(IconNote), tr(t, 'addAnnotation')),
            )
          : null,
        // ── comment form ──
        form
          ? h(AnnotationForm, {
              key:
                form.mode +
                ':' +
                (form.comment ? form.comment.id : 'new:' + String(form.block) + ':' + form.quote),
              t,
              form,
              annotation: data.annotation || {},
              onCancel: () => setForm(null),
              onSave: saveComment,
              onDelete: form.mode === 'edit' ? () => mutateComment(form.chapterId, 'delete', form.comment.id) : null,
            })
          : null,
        toast ? h('div', { className: 'dsr-toast' + (toast.isError ? ' dsr-toastErr' : '') }, toast.text) : null,
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // One chapter: heading + blocks + annotation highlights
    // ────────────────────────────────────────────────────────────────────
    function ChapterView({ t, chapter, onMarkClick }) {
      const blocks = useMemo(() => {
        const parsed = splitBlocks(chapter.text)
        if (parsed.length > 0 && parsed[0].kind === 'h1') parsed.shift()
        return parsed
      }, [chapter.text])

      const comments = chapter.comments || []
      const renderBlocks = (blockIndex) => {
        const block = blocks[blockIndex]
        const items = comments.filter((comment) => comment.block === blockIndex + 1)
        if (block.kind === 'hr') return h('hr', { className: 'dsr-hr' })
        if (block.kind === 'pre') {
          return h('pre', { key: 'pre', className: 'dsr-pre' }, h('code', null, block.text))
        }
        const segments =
          items.length > 0
            ? computeSegments(block.text, items)
            : [{ text: block.text }]
        const nodes = segments.map((segment, index) => {
          if (segment.id === undefined) return h(React.Fragment, { key: index }, inlineNodes(segment.text, 's' + index))
          const comment = items.find((item) => item.id === segment.id)
          const onClick = (event) => {
            event.stopPropagation()
            const mark = event.currentTarget
            const rect = mark.getBoundingClientRect()
            onMarkClick(segment.id, { left: rect.left, top: rect.top, bottom: rect.bottom })
          }
          return h(
            'mark',
            {
              key: index,
              className: 'dsr-mark' + (comment && comment.resolved ? ' dsr-markResolved' : ''),
              'data-cid': segment.id,
              title: comment ? comment.note : '',
              onClick,
            },
            inlineNodes(segment.text, 'm' + index),
          )
        })
        if (block.kind === 'quote') {
          return h('blockquote', { key: 'quote', className: 'dsr-quote', 'data-block': blockIndex, 'data-chapter-id': chapter.id }, nodes)
        }
        if (block.kind === 'ul' || block.kind === 'ol') {
          const Tag = block.kind === 'ol' ? 'ol' : 'ul'
          return h(
            Tag,
            { key: block.kind + String(blockIndex), className: block.kind === 'ol' ? 'dsr-ol' : 'dsr-ul', 'data-block': blockIndex, 'data-chapter-id': chapter.id },
            block.items.map((item, index) => h('li', { key: index, className: 'dsr-li' }, inlineNodes(item, 'li' + index))),
          )
        }
        const tag = block.kind === 'p' ? 'p' : block.kind
        return h(
          tag,
          {
            key: 'b' + blockIndex,
            className: 'dsr-' + block.kind,
            'data-block': blockIndex,
            'data-chapter-id': chapter.id,
          },
          nodes,
        )
      }

      return h(
        'section',
        {
          className: 'dsr-chapter',
          'data-chapter-index': chapter.index,
          'data-chapter-id': chapter.id,
        },
        h(
          'div',
          { className: 'dsr-chapterHead' },
          h('span', { className: 'dsr-chapterNo' }, (chapter.index + 1) + ' / ' + tr(t, 'chapter')),
          h('h2', { className: 'dsr-h1' }, chapter.title || chapter.id),
        ),
        blocks.map((block, index) => h(React.Fragment, { key: index }, renderBlocks(index))),
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // Annotation drawer row
    // ────────────────────────────────────────────────────────────────────
    function AnnotationRow({ t, comment, onOpen, onResolve, onDelete }) {
      const ref = useRef(null)
      const rectOf = () => {
        const rect = ref.current ? ref.current.getBoundingClientRect() : { left: 0, top: 0, bottom: 0 }
        return { left: rect.left, top: rect.top, bottom: rect.bottom }
      }
      return h(
        'div',
        {
          ref,
          className: 'dsr-ann' + (comment.resolved ? '' : ' dsr-annOn'),
          onClick: () => onOpen(rectOf()),
        },
        h(
          'div',
          { className: 'dsr-annTop' },
          h('span', { className: 'dsr-annId' }, comment.id),
          comment.type ? h('span', { className: 'dsr-badge dsr-badgeBrand' }, comment.type) : null,
          comment.conclusion ? h('span', { className: 'dsr-badge' }, comment.conclusion) : null,
          comment.resolved ? h('span', { className: 'dsr-badge dsr-badgeMuted' }, tr(t, 'resolved')) : null,
          h('span', { className: 'dsr-spacer', style: { flex: 1 } }),
          h('span', { className: 'dsr-annId' }, formatBlockLabel(t, comment.block)),
        ),
        comment.quote ? h('p', { className: 'dsr-annQuote' }, '「' + comment.quote + '」') : null,
        comment.note ? h('p', { className: 'dsr-annNote' }, comment.note) : null,
        h(
          'div',
          { className: 'dsr-annActions' },
          h('button', {
            type: 'button',
            className: 'dsr-btn',
            onClick: (event) => {
              event.stopPropagation()
              onResolve()
            },
          }, comment.resolved ? tr(t, 'reopen') : tr(t, 'resolve')),
          h('button', {
            type: 'button',
            className: 'dsr-btn dsr-btnDanger',
            onClick: (event) => {
              event.stopPropagation()
              onDelete()
            },
          }, tr(t, 'delete')),
        ),
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // Comment form popover
    // ────────────────────────────────────────────────────────────────────
    function AnnotationForm({ t, form, annotation, onCancel, onSave, onDelete }) {
      const types = (annotation.types && annotation.types.length > 0 ? annotation.types : ['note'])
      const conclusions = (annotation.conclusions && annotation.conclusions.length > 0 ? annotation.conclusions : [''])
      const [type, setType] = useState(form.comment ? form.comment.type : types[0])
      const [conclusion, setConclusion] = useState(form.comment ? form.comment.conclusion : conclusions[0])
      const [note, setNote] = useState(form.comment ? form.comment.note || '' : '')
      const areaRef = useRef(null)

      useEffect(() => {
        if (areaRef.current) areaRef.current.focus()
      }, [])

      const rect = form.rect || { left: 0, top: 0, bottom: 0 }
      const width = 340
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))
      const estimated = 330
      const top =
        rect.bottom + 10 + estimated > window.innerHeight
          ? Math.max(8, rect.top - estimated - 10)
          : rect.bottom + 10

      const submit = () => {
        onSave({
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
        })
      }

      return h(
        'div',
        { className: 'dsr-pop', style: { left: left + 'px', top: top + 'px' }, onMouseUp: (event) => event.stopPropagation() },
        h('div', { className: 'dsr-popHead' },
          h(IconNote),
          h('span', null, form.mode === 'edit' ? tr(t, 'edit') : tr(t, 'addAnnotation')),
          h('span', { style: { flex: 1 } }),
          form.comment ? h('span', { className: 'dsr-annId' }, form.comment.id) : null,
        ),
        form.quote ? h('div', { className: 'dsr-quoted' }, '「' + form.quote + '」') : null,
        h('div', { className: 'dsr-row' },
          h('div', { className: 'dsr-field' },
            h('label', { className: 'dsr-label' }, tr(t, 'type')),
            h('select', { className: 'dsr-input', value: type, onChange: (event) => setType(event.target.value) },
              types.map((item) => h('option', { key: item, value: item }, item)))),
          h('div', { className: 'dsr-field' },
            h('label', { className: 'dsr-label' }, tr(t, 'conclusion')),
            h('select', { className: 'dsr-input', value: conclusion, onChange: (event) => setConclusion(event.target.value) },
              conclusions.map((item) => h('option', { key: item, value: item }, item || '—')))),
        ),
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
          h('button', { type: 'button', className: 'dsr-btn dsr-btnPrimary', disabled: !note.trim(), onClick: submit }, tr(t, 'save')),
        ),
      )
    }

    // ────────────────────────────────────────────────────────────────────
    // Plugin body
    // ────────────────────────────────────────────────────────────────────
    const inject = ['slots', 'locale']
    function apply(ctx) {
      ctx.effect(() => {
        const tag = ensureStyle()
        return () => {
          if (tag && tag.parentNode) tag.parentNode.removeChild(tag)
        }
      }, 'dsh-reader: styles')
      ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-reader: dictionaries')
      ctx.effect(
        () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-reader-open', order: 24, locale: NS },
            OpenButton,
          ),
        'dsh-reader: sidebar entry',
      )
      ctx.effect(
        () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-reader-panel', order: 40, locale: NS },
            ReaderPanel,
          ),
        'dsh-reader: reader panel',
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'dsh-reader'
    exports.__test = { splitBlocks, inlineNodes, computeSegments, buildPrompt, stripFrontmatter }
    return module.exports
  },
})
