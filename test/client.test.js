import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The client module is a classic script that hands its factory to the page's
// module loader. Stub that contract so the pure helpers can be exercised in
// Node without a browser.
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
}

const reactStub = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
}

const requireStub = (id) => {
  if (id === 'react') return reactStub
  throw new Error('unexpected module: ' + id)
}

const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client.js')
await import(clientPath)

test('client module registers with the module loader', () => {
  assert.ok(captured, 'window.__ModuleLoader__.load was not called')
  assert.equal(captured.id, 'dsh-reader')
  const module = captured.factory(requireStub)
  assert.equal(module.name, 'dsh-reader')
  assert.deepEqual(module.inject, ['slots', 'locale'])
  assert.equal(typeof module.apply, 'function')
  assert.ok(module.__test)
})

const { splitBlocks, computeSegments, buildPrompt, inlineNodes } = captured.factory(requireStub).__test

test('splitBlocks: frontmatter, headings, paragraphs, scene break', () => {
  const blocks = splitBlocks(
    ['---', 'title: test', '---', '# 第001章', '第一段', '仍然第一段', '', '第二段', '', '---', ''].join('\n'),
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['h1', 'p', 'p', 'hr'],
  )
  assert.equal(blocks[1].text, '第一段仍然第一段') // CJK soft breaks join without a space
  assert.equal(blocks[2].text, '第二段')
})

test('splitBlocks: quote, lists, fenced code', () => {
  const blocks = splitBlocks(
    ['> 引用一行', '> 引用两行', '', '- 甲', '- 乙', '', '1. 一', '2. 二', '', '```', 'code()', '```'].join('\n'),
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['quote', 'ul', 'ol', 'pre'],
  )
  assert.equal(blocks[0].text, '引用一行\n引用两行')
  assert.deepEqual(blocks[1].items, ['甲', '乙'])
  assert.deepEqual(blocks[2].items, ['一', '二'])
  assert.equal(blocks[3].text, 'code()')
})

test('splitBlocks: Latin soft breaks keep a space', () => {
  const blocks = splitBlocks('hello\nworld')
  assert.equal(blocks[0].text, 'hello world')
})

test('splitBlocks: empty text and plain prose', () => {
  assert.deepEqual(splitBlocks(''), [])
  const blocks = splitBlocks('一句话\n\n又一句')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].kind, 'p')
})

test('computeSegments: highlights quotes and keeps order', () => {
  const text = '他吐了一口血，血泼了他一脸。'
  const segments = computeSegments(text, [
    { id: 'A1', quote: '血泼了他一脸' },
    { id: 'A2', quote: '他吐了一口血' },
  ])
  const rebuilt = segments.map((segment) => segment.text).join('')
  assert.equal(rebuilt, text)
  assert.deepEqual(
    segments.filter((segment) => segment.id).map((segment) => segment.id),
    ['A2', 'A1'],
  )
})

test('computeSegments: missing quote yields one plain segment', () => {
  const segments = computeSegments('abc', [{ id: 'A1', quote: 'zzz' }])
  assert.deepEqual(segments, [{ text: 'abc' }])
})

test('computeSegments: duplicate quote highlights every occurrence', () => {
  const segments = computeSegments('马。马。马。', [{ id: 'A1', quote: '马' }])
  assert.equal(segments.filter((segment) => segment.id).length, 3)
})

test('buildPrompt: substitutes file placeholders', () => {
  const prompt = buildPrompt(
    '请按 {annotationFile} 中的批注修改 {chapterFile}。',
    '赵云传/06_批注/第001章.md',
    '第001章.md',
  )
  assert.equal(prompt, '请按 赵云传/06_批注/第001章.md 中的批注修改 第001章.md。')
  assert.equal(buildPrompt('', 'a.md', 'b.md'), '请按 a.md 中的批注修改 b.md。')
})

test('inlineNodes: emphasis, code and links become elements', () => {
  const nodes = inlineNodes('**粗** 与 *斜* 与 `码` 与 [链](https://x.y)', 't')
  const types = nodes.filter((node) => typeof node !== 'string').map((node) => node.type)
  assert.deepEqual(types, ['strong', 'em', 'code', 'a'])
  const link = nodes.find((node) => node.type === 'a')
  assert.equal(link.props.href, 'https://x.y')
})

test('inlineNodes: plain text stays a single string node', () => {
  const nodes = inlineNodes('没有格式的一句话', 't')
  assert.deepEqual(nodes, ['没有格式的一句话'])
})
