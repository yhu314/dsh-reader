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
      notePlaceholder: '写下这条批注…',
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
      viewerBook: '电子书',
      annotationGone: '没找到这条批注在正文里的位置（文本可能改过了）',
      search: '搜索',
      searchPlaceholder: '在本书里搜索…',
      searchGo: '搜',
      searching: '搜索中…',
      noResults: '没有找到匹配的章节',
      searchTruncated: '结果太多，只显示了前一部分',
      width: '阅读宽度',
      searchJump: '跳到这一段',
      linkUnresolved: '这个相对链接无法解析（当前章节没有已知的绝对路径）',
      linkUnavailable: '这个链接打不开（当前标签页没有会话信息）',
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
      notePlaceholder: 'Write the annotation…',
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
      viewerBook: 'Book',
      annotationGone: 'The annotated text is no longer in this chapter.',
      search: 'Search',
      searchPlaceholder: 'Search this book…',
      searchGo: 'Go',
      searching: 'Searching…',
      noResults: 'No matching chapters',
      searchTruncated: 'Too many results; showing the first ones',
      width: 'Reading width',
      searchJump: 'Jump to this paragraph',
      linkUnresolved: 'This relative link cannot be resolved for the current chapter.',
      linkUnavailable: 'This link cannot be opened from this tab.',
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
\.dsr-tableWrap{overflow-x:auto;margin:0 0 .9em}
.dsr-table{border-collapse:collapse;width:100%;font-size:.9em}
.dsr-table th,.dsr-table td{border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));padding:6px 8px;text-align:left;vertical-align:top}
.dsr-table th{background:var(--dsw-alias-bg-layer-2,#23252b);font-weight:600}
.dsr-img{max-width:100%;height:auto}
.dsr-imgBlock{display:block;margin:0 auto .9em;border-radius:8px}
.dsr-blockFlash{animation:dsrBlockFlash 1.4s ease-out}
@keyframes dsrBlockFlash{0%{background:rgba(77,107,254,.28);box-shadow:0 0 0 3px rgba(77,107,254,.35);border-radius:4px}100%{background:transparent}}
.dsr-searchRow{display:flex;gap:5px;padding:2px 2px 8px}
.dsr-searchInput{flex:1;min-width:0}
.dsr-resultRow{padding:7px 8px;border-radius:8px;cursor:pointer;margin-bottom:4px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04))}
.dsr-resultRow:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}
.dsr-resultTop{display:flex;align-items:center;gap:6px}
.dsr-resultTitle{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-primary,#e8e9ee)}
.dsr-resultSnippet{margin-top:3px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b8090);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
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
.dsr-markFlash{animation:dsrMarkFlash 1.3s ease-out}
@keyframes dsrMarkFlash{0%{background:rgba(77,107,254,.6);box-shadow:inset 0 -2px 0 rgba(77,107,254,.9)}100%{background:rgba(77,107,254,.2)}}
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
.dsr-menu{position:fixed;z-index:2147483000;min-width:148px;padding:4px;border-radius:9px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#23252b));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 12px 34px rgba(0,0,0,.42)}
.dsr-menuItem{display:flex;align-items:center;gap:7px;width:100%;height:28px;padding:0 10px;border:none;border-radius:6px;background:0 0;color:var(--dsw-alias-label-primary,#e8e9ee);font:inherit;font-size:12px;text-align:left;cursor:pointer;white-space:nowrap}
.dsr-menuItem:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}
.dsr-menuItemDanger{color:var(--dsw-alias-state-error-primary,#ff7b72)}
.dsr-menuSep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.12))}
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
      const tableCells = (row) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const raw = lines[lineIndex]
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
        const standaloneImage = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
        if (standaloneImage) {
          flushAll()
          blocks.push({ kind: 'img', alt: standaloneImage[1], src: standaloneImage[2] })
          continue
        }
        if (line.trim().startsWith('|')) {
          const separator = (lines[lineIndex + 1] || '').trim()
          if (separator.startsWith('|') && /^\|?[\s:|-]+\|?$/.test(separator) && separator.includes('-')) {
            flushAll()
            const header = tableCells(line.trim())
            const rows = []
            let next = lineIndex + 2
            while (next < lines.length && lines[next].trim().startsWith('|')) {
              rows.push(tableCells(lines[next].trim()))
              next += 1
            }
            blocks.push({ kind: 'table', header, rows })
            lineIndex = next - 1
            continue
          }
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

    function inlineTextNodes(value, keyPrefix, handleLink) {
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
          const linkHref = match[7]
          const linkLabel = match[6]
          nodes.push(h('a', {
            key,
            className: 'dsr-link',
            href: linkHref,
            target: '_blank',
            rel: 'noreferrer noopener',
            onClick: (event) => {
              event.stopPropagation()
              if (handleLink && handleLink(linkHref, event)) event.preventDefault()
            },
          }, linkLabel))
        } else if (match[8] !== undefined) nodes.push(h('del', { key }, match[8]))
        last = pattern.lastIndex
      }
      if (text.slice(last)) nodes.push(text.slice(last))
      return nodes
    }
    function inlineNodes(value, keyPrefix, resolveImage, handleLink) {
      const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
      const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g
      const nodes = []
      let last = 0
      let match
      let index = 0
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(...inlineTextNodes(text.slice(last, match.index), keyPrefix + '-t' + index, handleLink))
        const src = resolveImage ? resolveImage(match[2]) : match[2]
        nodes.push(h('img', { key: keyPrefix + '-img' + index, className: 'dsr-img', src, alt: match[1] || '' }))
        last = pattern.lastIndex
        index += 1
      }
      if (last < text.length) nodes.push(...inlineTextNodes(text.slice(last), keyPrefix + '-t' + index, handleLink))
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

    // ── image URLs: local images go through the authenticated /api/file route ──
    function normalizePosix(value) {
      const parts = []
      for (const segment of String(value).split('/')) {
        if (segment === '' || segment === '.') continue
        if (segment === '..') parts.pop()
        else parts.push(segment)
      }
      return '/' + parts.join('/')
    }

    function absoluteChapterPath(chapterPath, pathBase) {
      if (!chapterPath) return ''
      if (String(chapterPath).startsWith('/')) return String(chapterPath)
      if (pathBase) return String(pathBase).replace(/\/+$/, '') + '/' + String(chapterPath)
      return ''
    }

    function dirnameOf(path) {
      const value = String(path || '')
      const slash = value.lastIndexOf('/')
      return slash <= 0 ? '/' : value.slice(0, slash)
    }

    function isMarkdownPath(path) {
      return /\.(md|markdown)$/i.test(String(path || ''))
    }

    /**
     * Resolve a markdown link relative to the chapter that contains it.
     *
     * Returns `{ external: true }` for http(s)/mailto/other schemes,
     * `{ path: '', fragment }` for a pure in-page `#anchor`, and otherwise the
     * normalized absolute `path` plus any `fragment`.
     */
    function resolveLinkPath(href, chapterPath, pathBase) {
      const raw = String(href || '').trim()
      if (raw === '') return null
      const hash = raw.indexOf('#')
      const withoutFragment = hash >= 0 ? raw.slice(0, hash) : raw
      const fragment = hash >= 0 ? raw.slice(hash + 1) : ''
      if (withoutFragment === '') return { path: '', fragment, external: false }
      let decoded = withoutFragment
      try {
        decoded = decodeURIComponent(withoutFragment)
      } catch {
        /* keep the raw form */
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith('//')) {
        return { path: '', fragment, external: true }
      }
      if (decoded.startsWith('/')) return { path: normalizePosix(decoded), fragment, external: false }
      const base = absoluteChapterPath(chapterPath, pathBase)
      if (!base) return { path: '', fragment, external: false, unresolved: true }
      return { path: normalizePosix(dirnameOf(base) + '/' + decoded), fragment, external: false }
    }

    /** dsh-resource address for an absolute path, authorised by the tab's session. */
    function sessionFileAddress(sessionId, absolutePath) {
      const encoded = String(absolutePath)
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')
      return 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' + encoded
    }

    function imageUrlFor(chapterPath, src, pathBase) {
      const raw = String(src || '').trim()
      if (raw === '') return ''
      if (/^(https?:|data:)/i.test(raw)) return raw
      if (raw.startsWith('/')) return '/api/file?path=' + encodeURIComponent(raw)
      const base = absoluteChapterPath(chapterPath, pathBase)
      if (!base) return raw
      return '/api/file?path=' + encodeURIComponent(normalizePosix(dirnameOf(base) + '/' + raw))
    }

    // ── persisted UI state ────────────────────────────────────────────────
    const UI_KEY = 'dsh_reader.ui.v1'
    const PROGRESS_KEY = 'dsh_reader.pos.v1'
    const WIDTH_KEY = 'dsh_reader.width.v1'
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
    function IconSearch({ size }) {
      const s = size || 13
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 7, cy: 7, r: 4.2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M10.2 10.2l3 3', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))
    }
    function IconWidth({ size }) {
      const s = size || 13
      return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M2 8h12M4.2 5.8L2 8l2.2 2.2M11.8 5.8L14 8l-2.2 2.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    // ── right-Sidebar controller (opens linked resources in new tabs) ─────
    let sidebarRightRef = null

    // ── Book viewer body (registered into the built-in document preview) ──
    // The document preview hands every renderer a `resourceAddress`, the tab
    // info hooks, and (for file resources) a `useResource` metadata hook whose
    // `absolutePath` spares us from re-deriving the path ourselves.
    function BookBodyWithResource(props) {
      const resource = props.useResource(props.resourceAddress)
      const absolutePath = resource && resource.value ? resource.value.absolutePath : undefined
      return h(BookBodyInner, Object.assign({}, props, { absolutePath }))
    }

    function BookBody(props) {
      return typeof props.useResource === 'function'
        ? h(BookBodyWithResource, props)
        : h(BookBodyInner, props)
    }

    function BookBodyInner(props) {
      const t = props.t
      const [state, setState] = useState({ status: 'loading' })
      const [attempt, setAttempt] = useState(0)
      const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : null
      const address =
        (info && info.tab && info.tab.contentId) ||
        props.resourceAddress ||
        ''

      useEffect(() => {
        let cancelled = false
        ;(async () => {
          setState({ status: 'loading' })
          try {
            const config = await loadConfig()
            let path = props.absolutePath
            if (!path) {
              const parsed = parseFileAddress(address)
              if (!parsed) throw new Error('unsupported address')
              path = resolveClientPath(parsed.path)
            }
            const data = await callApi('/resolve?path=' + enc(path))
            if (cancelled) return
            setState({
              status: 'ready',
              config,
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
      }, [address, attempt, props.absolutePath])

      if (state.status === 'loading') {
        return h('div', { className: 'dsr-root' }, h('div', { className: 'dsr-empty' }, tr(t, 'loading')))
      }
      if (state.status === 'error') {
        return h('div', { className: 'dsr-root' },
          h('div', { className: 'dsr-setup' },
            h('h2', null, tr(t, 'error')),
            h('p', null, state.error),
            h('button', { type: 'button', className: 'dsr-btn', onClick: () => setAttempt((value) => value + 1) }, tr(t, 'retry'))))
      }
      const parsedAddress = parseFileAddress(address)
      return h(Reader, {
        t,
        book: state.book,
        config: state.config,
        sessionId: parsedAddress ? parsedAddress.sessionId : '',
      })
    }

    // ── reader (shared by file tabs and the bookshelf) ────────────────────
    function Reader({ t, book, config, onBack, backLabel, sessionId }) {
      const chaptersMeta = book.chapters || []
      const bookKey = book.mode === 'library' ? 'lib:' + book.libraryId : 'root:' + (book.bookRoot || '')
      const [loaded, setLoaded] = useState({})
      const [active, setActive] = useState(book.index || 0)
      const [tocOpen, setTocOpen] = useState(false)
      const [annOpen, setAnnOpen] = useState(false)
      const [form, setForm] = useState(null)
      const [selection, setSelection] = useState(null)
      const [menu, setMenu] = useState(null)
      const [toast, setToast] = useState(null)
      const [fontSize, setFontSize] = useState(() => readJson(UI_KEY, {}).fontSize || 16)
      const [width, setWidth] = useState(() => {
        const saved = readJson(WIDTH_KEY, {})
        return Number.isFinite(saved[bookKey]) ? saved[bookKey] : 760
      })
      const [searchOpen, setSearchOpen] = useState(false)
      const [searchQuery, setSearchQuery] = useState('')
      const [searchState, setSearchState] = useState({ status: 'idle', matches: [], truncated: false, query: '' })
      const searchInputRef = useRef(null)
      const searchTimerRef = useRef(null)
      const searchAbortRef = useRef(null)
      const searchSeqRef = useRef(0)
      const rootRef = useRef(null)
      const interactedRef = useRef(false)
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
      useEffect(() => {
        const saved = readJson(WIDTH_KEY, {})
        if (saved[bookKey] === width) return
        writeJson(WIDTH_KEY, { ...saved, [bookKey]: width })
      }, [width, bookKey])
      useEffect(() => {
        if (searchOpen && searchInputRef.current) searchInputRef.current.focus()
      }, [searchOpen])

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
              book.annotationEnabled
                ? book.mode === 'library'
                  ? `/annotations?lib=${enc(book.libraryId)}&file=${enc(meta.id)}`
                  : `/annotations?path=${enc(meta.chapterPath)}`
                : null
            const [chapterData, annotationData] = await Promise.all([
              callApi(chapterQuery),
              annotationQuery ? callApi(annotationQuery).catch(() => ({ comments: [] })) : Promise.resolve({ comments: [] }),
            ])
            const entry = {
              index,
              id: meta.id,
              title: chapterData.title || meta.title,
              chapterPath: meta.chapterPath || meta.id,
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

      const scrollToHeading = useCallback((fragment) => {
        const root = scrollRef.current
        if (!root) return
        let needle = String(fragment || '')
        try {
          needle = decodeURIComponent(needle)
        } catch {
          /* keep the raw form */
        }
        needle = needle.replace(/^#/, '').replace(/-/g, ' ').trim().toLocaleLowerCase()
        if (needle === '') return
        const headings = root.querySelectorAll('.dsr-h1, .dsr-h2, .dsr-h3, .dsr-h4, .dsr-h5, .dsr-h6')
        for (const heading of headings) {
          if (!heading.textContent.toLocaleLowerCase().includes(needle)) continue
          try {
            heading.scrollIntoView({ block: 'start', behavior: 'smooth' })
          } catch {
            /* jsdom and old engines */
          }
          heading.classList.add('dsr-blockFlash')
          window.setTimeout(() => heading.classList.remove('dsr-blockFlash'), 1400)
          return
        }
      }, [])

      /**
       * Markdown links inside a chapter:
       * - `#heading` scrolls within the chapter;
       * - same-directory markdown jumps inside this book;
       * - anything else opens in a new Sidebar tab through the right-Sidebar controller.
       */
      const openInternalLink = useCallback((href, chapterPath) => {
        const resolved = resolveLinkPath(href, chapterPath, config && config.pathBase)
        if (!resolved || resolved.external) return false
        if (resolved.unresolved) {
          showToast(tr(t, 'linkUnresolved'))
          return true
        }
        if (resolved.path === '') {
          scrollToHeading(resolved.fragment)
          return true
        }
        const current = absoluteChapterPath(chapterPath, config && config.pathBase)
        const sameDirectory = isMarkdownPath(resolved.path) && dirnameOf(resolved.path) === dirnameOf(current)
        if (sameDirectory) {
          const index = chaptersMeta.findIndex(
            (chapter) => absoluteChapterPath(chapter.chapterPath || chapter.id, config && config.pathBase) === resolved.path,
          )
          if (index >= 0) {
            jumpTo(index)
            if (resolved.fragment) window.setTimeout(() => scrollToHeading(resolved.fragment), 240)
            return true
          }
        }
        const controller = sidebarRightRef
        if (sessionId && controller && typeof controller.openResource === 'function') {
          try {
            controller.openResource(sessionFileAddress(sessionId, resolved.path))
            return true
          } catch (error) {
            showToast(String(error && error.message ? error.message : error), true)
            return true
          }
        }
        showToast(tr(t, 'linkUnavailable'))
        return true
      }, [chaptersMeta, config, jumpTo, scrollToHeading, sessionId, showToast, t])

      const runSearch = useCallback(async (text) => {
        const query = String(text || '').trim()
        const seq = searchSeqRef.current + 1
        searchSeqRef.current = seq
        if (searchAbortRef.current) searchAbortRef.current.abort()
        if (query === '') {
          setSearchState({ status: 'idle', matches: [], truncated: false, query: '' })
          return
        }
        setSearchState((previous) => ({
          status: 'searching',
          matches: previous.matches || [],
          truncated: previous.truncated === true,
          query,
        }))
        const controller = new window.AbortController()
        searchAbortRef.current = controller
        try {
          let url
          if (book.mode === 'library') {
            url = '/search?lib=' + enc(book.libraryId) + '&q=' + enc(query)
          } else {
            const chapter = chaptersMeta[activeRef.current] || {}
            const path = chapter.chapterPath || ''
            if (!path || !String(path).startsWith('/')) throw new Error('search is unavailable for this book')
            url = '/search?path=' + enc(path) + '&q=' + enc(query)
          }
          const data = await callApi(url, { signal: controller.signal })
          if (searchSeqRef.current !== seq) return
          setSearchState({ status: 'ready', matches: data.matches || [], truncated: data.truncated === true, query })
        } catch (caught) {
          if (searchSeqRef.current !== seq) return
          const aborted = caught && (caught.name === 'AbortError' || /abort/i.test(String(caught.message || caught)))
          if (aborted) return
          setSearchState({ status: 'error', matches: [], truncated: false, query, error: String(caught && caught.message ? caught.message : caught) })
        }
      }, [book.mode, book.libraryId, chaptersMeta])

      // Type-to-search: debounce while the user types; Enter/Go still run at once.
      const onSearchInput = useCallback((value) => {
        setSearchQuery(value)
        if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
        const query = String(value || '').trim()
        if (query === '') {
          searchSeqRef.current += 1
          if (searchAbortRef.current) searchAbortRef.current.abort()
          setSearchState({ status: 'idle', matches: [], truncated: false, query: '' })
          return
        }
        searchTimerRef.current = window.setTimeout(() => runSearch(query), 220)
      }, [runSearch])

      useEffect(() => () => {
        if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
        if (searchAbortRef.current) searchAbortRef.current.abort()
      }, [])
      useEffect(() => {
        if (searchOpen) return
        if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
        if (searchAbortRef.current) searchAbortRef.current.abort()
      }, [searchOpen])

      // Ctrl+F / Cmd+F opens the in-book search, scoped to this reader: it only
      // takes over while the pointer/selection/focus is inside this pane, so the
      // chat and other panes keep the browser's own find behaviour.
      useEffect(() => {
        const insideSelection = () => {
          const root = rootRef.current
          const selection = window.getSelection()
          const anchor = selection && selection.anchorNode
          if (!root || !anchor) return false
          const element = anchor.nodeType === 1 ? anchor : anchor.parentElement
          return Boolean(element && root.contains(element))
        }
        const insideFocus = () => {
          const root = rootRef.current
          const active = window.document.activeElement
          return Boolean(root && active && root.contains(active))
        }
        const onPointerDown = (event) => {
          const root = rootRef.current
          interactedRef.current = Boolean(root && event.target && root.contains(event.target))
        }
        const onKeyDown = (event) => {
          const key = String(event.key || '').toLowerCase()
          if (key !== 'f' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
          if (!(interactedRef.current || insideFocus() || insideSelection())) return
          event.preventDefault()
          event.stopPropagation()
          setTocOpen(false)
          setAnnOpen(false)
          setSearchOpen(true)
          window.setTimeout(() => {
            const input = searchInputRef.current
            if (!input) return
            input.focus()
            if (typeof input.select === 'function') input.select()
          }, 20)
        }
        window.addEventListener('mousedown', onPointerDown, true)
        window.addEventListener('keydown', onKeyDown, true)
        return () => {
          window.removeEventListener('mousedown', onPointerDown, true)
          window.removeEventListener('keydown', onKeyDown, true)
        }
      }, [])

      const jumpToSearchMatch = useCallback(async (match) => {
        const index = chaptersMeta.findIndex((chapter) => chapter.id === match.chapterId)
        if (index < 0) return
        const needle = String(searchState.query || '').toLocaleLowerCase()
        const reveal = () => {
          const root = scrollRef.current
          if (!root) return
          const sections = root.querySelectorAll('[data-chapter-id]')
          let section = null
          for (const candidate of sections) {
            if (candidate.getAttribute('data-chapter-id') === match.chapterId) {
              section = candidate
              break
            }
          }
          if (!section) return
          const blocks = Array.from(section.querySelectorAll('[data-block]'))
          let target = null
          for (const element of blocks) {
            const text = element.textContent.toLocaleLowerCase()
            if (needle === '' || text.includes(needle)) {
              target = element
              break
            }
          }
          if (!target) return
          try {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' })
          } catch {
            const rootRect = root.getBoundingClientRect()
            const blockRect = target.getBoundingClientRect()
            root.scrollTop += blockRect.top - rootRect.top - rootRect.height / 2
          }
          target.classList.add('dsr-blockFlash')
          window.setTimeout(() => target.classList.remove('dsr-blockFlash'), 1400)
          setSearchOpen(false)
        }
        await jumpTo(index)
        window.setTimeout(reveal, 160)
      }, [chaptersMeta, jumpTo, searchState.query])

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (formRef.current) {
            setForm(null)
            event.stopPropagation()
          } else if (selectionRef.current) {
            setSelection(null)
            event.stopPropagation()
          } else if (menu) {
            setMenu(null)
            event.stopPropagation()
          } else if (tocOpen || annOpen || searchOpen) {
            setTocOpen(false)
            setAnnOpen(false)
            setSearchOpen(false)
            event.stopPropagation()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [tocOpen, annOpen, searchOpen, menu])

      const activeChapter = loaded[active] || (loadedIndexes.length > 0 ? loaded[loadedIndexes[0]] : null)
      const activeIndex = activeChapter ? activeChapter.index : active

      const onMouseUp = useCallback(
        (event) => {
          if (event.button === 2) return
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

      // Right-click: annotate the selection, or edit/delete an annotation mark.
      const onContextMenu = useCallback(
        (event) => {
          if (!book.annotationEnabled) return
          const scroll = scrollRef.current
          if (!scroll) return
          let node = event.target
          let markElement = null
          while (node && node !== scroll) {
            if (node.matches && node.matches('mark[data-cid]')) {
              markElement = node
              break
            }
            node = node.parentElement
          }
          if (markElement) {
            event.preventDefault()
            const rect = markElement.getBoundingClientRect()
            setMenu({
              kind: 'mark',
              x: event.clientX,
              y: event.clientY,
              commentId: markElement.getAttribute('data-cid'),
              chapterId: markElement.getAttribute('data-chapter-id'),
              rect: { left: rect.left, top: rect.top, bottom: rect.bottom },
            })
            return
          }
          const sel = window.getSelection()
          const raw = sel && !sel.isCollapsed ? sel.toString().trim() : ''
          if (!raw) return
          const range = sel.getRangeAt(0)
          const anchorNode = sel.anchorNode
          const element = anchorNode && anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode
          const blockElement = element && element.closest ? element.closest('[data-block]') : null
          if (!blockElement || !scroll.contains(blockElement)) return
          event.preventDefault()
          const rect = range.getBoundingClientRect()
          setMenu({
            kind: 'selection',
            x: event.clientX,
            y: event.clientY,
            chapterId: blockElement.getAttribute('data-chapter-id'),
            block: Number(blockElement.getAttribute('data-block')) + 1,
            quote: raw.slice(0, 600),
            rect: { left: rect.left, top: rect.top, bottom: rect.bottom },
          })
        },
        [book.annotationEnabled],
      )

      // Close the menu on any outside press.
      useEffect(() => {
        if (!menu) return undefined
        const onDown = (event) => {
          if (event.target && event.target.closest && event.target.closest('.dsr-menu')) return
          setMenu(null)
        }
        window.addEventListener('mousedown', onDown, true)
        return () => window.removeEventListener('mousedown', onDown, true)
      }, [menu])

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

      // Drawer click: scroll the annotated passage into view and flash it.
      const scrollToComment = useCallback((chapterId, commentId) => {
        setAnnOpen(false)
        window.setTimeout(() => {
          const root = scrollRef.current
          if (!root) return
          const sections = root.querySelectorAll('[data-chapter-id]')
          let section = null
          for (const candidate of sections) {
            if (candidate.getAttribute('data-chapter-id') === chapterId) {
              section = candidate
              break
            }
          }
          if (!section) return
          const mark = section.querySelector('mark[data-cid="' + String(commentId).replace(/"/g, '\\"') + '"]')
          if (!mark) {
            showToast(tr(t, 'annotationGone'))
            return
          }
          try {
            mark.scrollIntoView({ block: 'center', behavior: 'smooth' })
          } catch {
            const rootRect = root.getBoundingClientRect()
            const markRect = mark.getBoundingClientRect()
            root.scrollTop += markRect.top - rootRect.top - rootRect.height / 2
          }
          mark.classList.add('dsr-markFlash')
          window.setTimeout(() => mark.classList.remove('dsr-markFlash'), 1400)
        }, 60)
      }, [showToast, t])

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
          if (!chapter || !book.annotationEnabled) return
          const writeBody =
            book.mode === 'library'
              ? { lib: book.libraryId, file: chapter.id, op: 'save', comment: payload.comment }
              : { path: chapter.chapterPath, op: 'save', comment: payload.comment }
          try {
            const result = await callApi('/annotations', {
              method: 'POST',
              body: JSON.stringify(writeBody),
            })
            applyComments(chapter.id, result.comments || [])
            setForm(null)
            showToast(tr(t, 'save') + ' ✓')
          } catch (caught) {
            showToast(String(caught && caught.message ? caught.message : caught), true)
          }
        },
        [applyComments, book.annotationEnabled, book.libraryId, book.mode, showToast, t],
      )

      const mutateComment = useCallback(
        async (chapterId, op, id, resolved) => {
          const chapter = Object.values(loadedRef.current).find((item) => item.id === chapterId)
          if (!chapter) return
          const writeBody =
            book.mode === 'library'
              ? { lib: book.libraryId, file: chapterId, op, id, resolved }
              : { path: chapter.chapterPath, op, id, resolved }
          try {
            const result = await callApi('/annotations', {
              method: 'POST',
              body: JSON.stringify(writeBody),
            })
            applyComments(chapterId, result.comments || [])
            if (op === 'delete') setForm(null)
          } catch (caught) {
            showToast(String(caught && caught.message ? caught.message : caught), true)
          }
        },
        [applyComments, book.libraryId, book.mode, showToast],
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

      return h('div', { className: 'dsr-root', ref: rootRef },
        h('div', { className: 'dsr-bar' },
          onBack ? h('button', { type: 'button', className: 'dsr-btn', title: backLabel || tr(t, 'back'), onClick: onBack }, h(IconChevron, { dir: 'left' }), backLabel || tr(t, 'back')) : null,
          h('button', { type: 'button', className: 'dsr-btn', disabled: activeIndex <= 0, title: tr(t, 'prev'), 'aria-label': tr(t, 'prev'), onClick: () => jumpTo(activeIndex - 1) }, h(IconChevron, { dir: 'left' })),
          h('button', { type: 'button', className: 'dsr-btn', disabled: activeIndex >= chaptersMeta.length - 1, title: tr(t, 'next'), 'aria-label': tr(t, 'next'), onClick: () => jumpTo(activeIndex + 1) }, h(IconChevron, { dir: 'right' })),
          h('div', { className: 'dsr-title' }, activeChapter ? activeChapter.title : ''),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'toc'), 'aria-label': tr(t, 'toc'), onClick: () => { setTocOpen((value) => !value); setAnnOpen(false) } }, h(IconList)),
          book.annotationEnabled
            ? h('button', { type: 'button', className: 'dsr-btn' + (annOpen ? ' dsr-btnOn' : ''), title: tr(t, 'annotations'), 'aria-label': tr(t, 'annotations'), onClick: () => { setAnnOpen((value) => !value); setTocOpen(false) } }, h(IconNote), unresolved > 0 ? String(unresolved) : '')
            : null,
          h('button', { type: 'button', className: 'dsr-btn' + (searchOpen ? ' dsr-btnOn' : ''), title: tr(t, 'search') + ' (Ctrl/⌘ F)', 'aria-label': tr(t, 'search'), onClick: () => { setSearchOpen((value) => !value); setTocOpen(false); setAnnOpen(false) } }, h(IconSearch)),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'width') + ': ' + width + 'px', 'aria-label': tr(t, 'width'), onClick: () => setWidth((value) => (value >= 920 ? 620 : value >= 760 ? 920 : 760)) }, h(IconWidth)),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'sendToChat'), 'aria-label': tr(t, 'sendToChat'), onClick: copyPrompt }, '→'),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'fontSmaller'), 'aria-label': tr(t, 'fontSmaller'), onClick: () => setFontSize((value) => Math.max(13, value - 1)) }, 'A−'),
          h('button', { type: 'button', className: 'dsr-btn', title: tr(t, 'fontLarger'), 'aria-label': tr(t, 'fontLarger'), onClick: () => setFontSize((value) => Math.min(30, value + 1)) }, 'A+')),
        h('div', { className: 'dsr-scroll', ref: scrollRef, onMouseUp: onMouseUp, onContextMenu: onContextMenu, style: { '--dsr-fs': fontSize + 'px' } },
          h('div', { className: 'dsr-doc', style: { maxWidth: width + 'px' } },
            loadedIndexes.map((index) => {
              const chapter = loaded[index]
              if (!chapter) return null
              return h(ChapterView, {
                key: chapter.id + ':' + index,
                t,
                chapter,
                index,
                pathBase: config && config.pathBase,
                onOpenLink: openInternalLink,
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
                        onOpen: () => activeChapter && scrollToComment(activeChapter.id, comment.id),
                        onEdit: (rect) => {
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
        searchOpen
          ? h('div', { className: 'dsr-drawer' },
              h('div', { className: 'dsr-drawerHead' },
                h('span', null, tr(t, 'search')),
                h('span', { style: { flex: 1 } }),
                h('button', { type: 'button', className: 'dsr-btn', onClick: () => setSearchOpen(false), title: tr(t, 'close') }, h(IconClose))),
              h('div', { className: 'dsr-drawerBody' },
                h('div', { className: 'dsr-searchRow' },
                  h('input', {
                    ref: searchInputRef,
                    className: 'dsr-input dsr-searchInput',
                    value: searchQuery,
                    placeholder: tr(t, 'searchPlaceholder'),
                    onChange: (event) => onSearchInput(event.target.value),
                    onKeyDown: (event) => {
                      if (event.key !== 'Enter') return
                      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
                      runSearch(searchQuery)
                    },
                  }),
                  h('button', {
                    type: 'button',
                    className: 'dsr-btn',
                    onClick: () => {
                      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
                      runSearch(searchQuery)
                    },
                  }, tr(t, 'searchGo'))),
                searchState.status === 'searching' ? h('div', { className: 'dsr-hint' }, tr(t, 'searching')) : null,
                searchState.status === 'error' ? h('div', { className: 'dsr-empty' }, searchState.error) : null,
                searchState.status === 'ready' && searchState.matches.length === 0 ? h('div', { className: 'dsr-empty' }, tr(t, 'noResults')) : null,
                searchState.status === 'ready'
                  ? searchState.matches.map((match) =>
                      h('div', {
                        key: match.chapterId,
                        className: 'dsr-resultRow',
                        title: tr(t, 'searchJump'),
                        onClick: () => jumpToSearchMatch(match),
                      },
                        h('div', { className: 'dsr-resultTop' },
                          h('span', { className: 'dsr-resultTitle' }, match.title || match.chapterId),
                          h('span', { className: 'dsr-bookMeta' }, String(match.count))),
                        match.snippet ? h('div', { className: 'dsr-resultSnippet' }, match.snippet) : null))
                  : null,
                searchState.truncated ? h('div', { className: 'dsr-hint' }, tr(t, 'searchTruncated')) : null))
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
              onCancel: () => setForm(null),
              onSave: saveComment,
              onDelete: form.mode === 'edit' ? () => mutateComment(form.chapterId, 'delete', form.comment.id) : null,
            })
          : null,
        menu
          ? h('div', {
              className: 'dsr-menu',
              style: {
                left: Math.max(8, Math.min(window.innerWidth - 170, menu.x)) + 'px',
                top: Math.max(8, Math.min(window.innerHeight - 130, menu.y)) + 'px',
              },
              onMouseDown: (event) => event.preventDefault(),
              onContextMenu: (event) => event.preventDefault(),
            },
            menu.kind === 'selection'
              ? h('button', {
                  type: 'button',
                  className: 'dsr-menuItem',
                  onClick: () => {
                    const pending = menu
                    setMenu(null)
                    setForm({ mode: 'new', quote: pending.quote, block: pending.block, chapterId: pending.chapterId, rect: pending.rect, comment: null })
                  },
                }, h(IconNote), tr(t, 'addAnnotation'))
              : [
                  h('button', {
                    key: 'edit',
                    type: 'button',
                    className: 'dsr-menuItem',
                    onClick: () => {
                      const pending = menu
                      setMenu(null)
                      const chapter = Object.values(loadedRef.current).find((item) => item.id === pending.chapterId)
                      if (chapter) openFormForMark(chapter, pending.commentId, pending.rect)
                    },
                  }, h(IconNote), tr(t, 'edit')),
                  h('button', {
                    key: 'delete',
                    type: 'button',
                    className: 'dsr-menuItem dsr-menuItemDanger',
                    onClick: () => {
                      const pending = menu
                      setMenu(null)
                      mutateComment(pending.chapterId, 'delete', pending.commentId)
                    },
                  }, tr(t, 'delete')),
                ],
            h('div', { className: 'dsr-menuSep' }),
            h('button', { type: 'button', className: 'dsr-menuItem', onClick: () => setMenu(null) }, tr(t, 'cancel')))
          : null,
        toast ? h('div', { className: 'dsr-toast' + (toast.isError ? ' dsr-toastErr' : '') }, toast.text) : null)
    }

    // ── one chapter: heading + blocks + annotation highlights ─────────────
    function ChapterView({ t, chapter, index, onMarkClick, pathBase, onOpenLink }) {
      const blocks = useMemo(() => {
        const parsed = splitBlocks(chapter.text)
        if (parsed.length > 0 && parsed[0].kind === 'h1') parsed.shift()
        return parsed
      }, [chapter.text])
      const comments = chapter.comments || []
      const resolveImage = (src) => imageUrlFor(chapter.chapterPath, src, pathBase)
      const handleLink = (href) => (typeof onOpenLink === 'function' ? onOpenLink(href, chapter.chapterPath) === true : false)

      // Renders one block of text with annotation highlights. `items` are the
      // comments anchored to this paragraph number (1-based).
      const markedNodes = (text, items, keyPrefix) => {
        const segments = items.length > 0 ? computeSegments(text, items) : [{ text }]
        return segments.map((segment, segmentIndex) => {
          if (segment.id === undefined) {
            return h(React.Fragment, { key: segmentIndex }, inlineNodes(segment.text, keyPrefix + 's' + segmentIndex, resolveImage, handleLink))
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
          }, inlineNodes(segment.text, keyPrefix + 'm' + segmentIndex, resolveImage, handleLink))
        })
      }

      const renderBlock = (blockIndex) => {
        const block = blocks[blockIndex]
        const items = comments.filter((comment) => comment.block === blockIndex + 1)
        if (block.kind === 'hr') return h('hr', { className: 'dsr-hr' })
        if (block.kind === 'pre') return h('pre', { className: 'dsr-pre' }, h('code', null, block.text))
        if (block.kind === 'img') {
          return h('img', {
            key: 'img' + blockIndex,
            className: 'dsr-img dsr-imgBlock',
            src: resolveImage(block.src),
            alt: block.alt || '',
            'data-block': blockIndex,
            'data-chapter-id': chapter.id,
            'data-chapter-index': index,
          })
        }
        if (block.kind === 'table') {
          const header = block.header || []
          const rows = block.rows || []
          return h('div', {
            key: 'table' + blockIndex,
            className: 'dsr-tableWrap',
            'data-block': blockIndex,
            'data-chapter-id': chapter.id,
            'data-chapter-index': index,
          },
            h('table', { className: 'dsr-table' },
              header.length > 0
                ? h('thead', null, h('tr', null, header.map((cell, cellIndex) =>
                    h('th', { key: cellIndex }, inlineNodes(cell, 'th' + blockIndex + '-' + cellIndex, resolveImage, handleLink)))))
                : null,
              h('tbody', null, rows.map((row, rowIndex) =>
                h('tr', { key: rowIndex }, row.map((cell, cellIndex) =>
                  h('td', { key: cellIndex }, inlineNodes(cell, 'td' + blockIndex + '-' + rowIndex + '-' + cellIndex, resolveImage, handleLink))))))))
        }
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
    function AnnotationRow({ t, comment, onOpen, onEdit, onResolve, onDelete }) {
      const ref = useRef(null)
      const rectOf = () => {
        const rect = ref.current ? ref.current.getBoundingClientRect() : { left: 0, top: 0, bottom: 0 }
        return { left: rect.left, top: rect.top, bottom: rect.bottom }
      }
      return h('div', { ref, className: 'dsr-ann', onClick: () => onOpen(rectOf()) },
        h('div', { className: 'dsr-annTop' },
          h('span', { className: 'dsr-annId' }, comment.id),
          comment.resolved ? h('span', { className: 'dsr-badge dsr-badgeMuted' }, tr(t, 'resolved')) : null,
          h('span', { style: { flex: 1 } }),
          h('span', { className: 'dsr-annId' }, formatBlockLabel(t, comment.block))),
        comment.quote ? h('p', { className: 'dsr-annQuote' }, '「' + comment.quote + '」') : null,
        comment.note ? h('p', { className: 'dsr-annNote' }, comment.note) : null,
        h('div', { className: 'dsr-annActions' },
          h('button', { type: 'button', className: 'dsr-btn', onClick: (event) => { event.stopPropagation(); onEdit(rectOf()) } }, tr(t, 'edit')),
          h('button', { type: 'button', className: 'dsr-btn', onClick: (event) => { event.stopPropagation(); onResolve() } }, comment.resolved ? tr(t, 'reopen') : tr(t, 'resolve')),
          h('button', { type: 'button', className: 'dsr-btn dsr-btnDanger', onClick: (event) => { event.stopPropagation(); onDelete() } }, tr(t, 'delete'))))
    }

    // ── comment form popover ──────────────────────────────────────────────
    function AnnotationForm({ t, form, onCancel, onSave, onDelete }) {
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
    function BookSlotBody(props) {
      return h(ReaderErrorBoundary, null, h(BookBody, props))
    }
    // Tabs saved by the earlier resource-tab design are re-opened as this
    // compatibility page instead of an unregistered kind.
    function LegacyTabBody(props) {
      return h(ReaderErrorBoundary, null, h(BookBody, props))
    }

    // ── plugin body ───────────────────────────────────────────────────────
    const LEGACY_TAB_ID = 'dsh_reader/reader'
    const BOOK_VIEWER_ID = 'dsh_reader/book'
    const inject = ['slots', 'locale', 'documentPreviews', 'sidebarRight', 'sidebarRightTabs']

    function apply(ctx) {
      sidebarRightRef = ctx.sidebarRight || null
      loadConfig().catch(() => {})
      const t = ctx.locale.bind(NS)

      ctx.effect(() => {
        const tag = ensureStyle()
        return () => {
          if (tag && tag.parentNode) tag.parentNode.removeChild(tag)
        }
      }, 'dsh_reader: styles')
      ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh_reader: dictionaries')

      // The "Book" viewer in the built-in document preview's viewer menu.
      // `priority: "builtin"` keeps it an alternative rather than the default:
      // the built-in Markdown implementation registers first, so it stays the
      // renderer a markdown tab opens with. Registration is deferred one task
      // to make that ordering deterministic.
      ctx.effect(() => {
        let dispose = null
        const timer = window.setTimeout(() => {
          try {
            dispose = ctx.documentPreviews.register({
              id: BOOK_VIEWER_ID,
              extensions: ['md', 'markdown'],
              priority: 'builtin',
              title: () => t('viewerBook'),
              loading: 'text-pages',
              wrap: false,
            })
          } catch (error) {
            console.warn('[dsh_reader] could not register the Book viewer', error)
          }
        }, 0)
        return () => {
          if (timer) window.clearTimeout(timer)
          if (typeof dispose === 'function') dispose()
        }
      }, 'dsh_reader: book viewer metadata')
      ctx.slots.inject('sidebar.right.tab.document', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document', key: BOOK_VIEWER_ID, locale: NS },
          BookSlotBody,
        ))

      // Compatibility: earlier builds opened markdown in a resource tab under
      // this kind. Registered so a persisted tab still resolves; nothing new is
      // opened through it, and it never claims a file.
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: LEGACY_TAB_ID,
            kind: LEGACY_TAB_ID,
            title: () => t('viewerBook'),
          }),
        'dsh_reader: legacy tab type',
      )
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: LEGACY_TAB_ID, locale: NS },
          LegacyTabBody,
        ))
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
      // Exposed for harnesses that render the components outside the app.
      imageUrlFor,
      normalizePosix,
      resolveLinkPath,
      sessionFileAddress,
      absoluteChapterPath,
      setSidebarRight(value) {
        sidebarRightRef = value
      },
      BookBody,
      BookBodyInner,
      Reader,
      ChapterView,
      AnnotationForm,
      ReaderErrorBoundary,
    }
    return module.exports
  },
})
