import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'
import { estimateNodeSize } from '../importFormats'
import type { AnyNode } from '../flowStore'

/**
 * THE INVARIANT (owner, 2026-09-07): folding a group and unfolding it again must leave
 * every node's absolute geometry byte-identical — "折叠展开几何位置不能变".
 *
 * Basis, and it is one basis throughout: ABSOLUTE STORE COORDINATES.
 *   x,y  position summed up the parentId chain, because React Flow child positions are
 *        RELATIVE to the parent — the case the owner singled out as likeliest to drift,
 *        since a fold that touched the parent's frame would move every child with it.
 *   w,h  the size React Flow will apply: `node.width ?? node.style.width` (its own
 *        precedence, getNodeInlineStyleDimensions) falling back to estimateNodeSize.
 * `data.collapsed` is deliberately ignored when sizing: this measures the DOCUMENT, so a
 * group that is momentarily a chip still reports the container it will expand back into.
 *
 * The rendered half of the same invariant (real Chromium, boxes read with
 * getBoundingClientRect and converted through the viewport matrix, editor AND read-only
 * viewer) was measured on the card and is not reproducible in jsdom, which has no layout.
 */

type Doc = { nodes: Record<string, unknown>[]; pipes: Record<string, unknown>[] }
type Box = { id: string; x: number; y: number; w: number; h: number }

function boxes(nodes: AnyNode[]): Box[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes
    .map((n) => {
      let { x, y } = n.position
      const seen = new Set([n.id])
      let p = n.parentId ? byId.get(n.parentId) : undefined
      while (p && !seen.has(p.id)) {
        seen.add(p.id)
        x += p.position.x
        y += p.position.y
        p = p.parentId ? byId.get(p.parentId) : undefined
      }
      const style = n.style as { width?: unknown; height?: unknown } | undefined
      const w = typeof n.width === 'number' ? n.width : typeof style?.width === 'number' ? style.width : undefined
      const h = typeof n.height === 'number' ? n.height : typeof style?.height === 'number' ? style.height : undefined
      const est = estimateNodeSize({ ...n, data: { ...(n.data as object), collapsed: false } })
      return { id: n.id, x, y, w: w ?? est.width, h: h ?? est.height }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

const json = (id: string, x: number, y: number, parentId?: string) => ({
  id, type: 'json', position: { x, y },
  data: { name: id, fields: [{ id: `${id}f`, name: 'id', path: ['id'], type: 'string', example: 'x' }] },
  ...(parentId ? { parentId } : {}),
})
const group = (id: string, x: number, y: number, w: number, h: number, parentId?: string, collapsed?: boolean) => ({
  id, type: 'group', position: { x, y },
  data: collapsed ? { name: id, collapsed: true } : { name: id },
  style: { width: w, height: h },
  ...(parentId ? { parentId } : {}),
})

/** Four shapes, matching the four the card demanded be covered. */
const DOCS: Record<string, Doc> = {
  // flat: one group, three children carrying parent-relative positions
  flat: {
    nodes: [group('gA', 200, 120, 520, 380), json('a1', 40, 60, 'gA'), json('a2', 40, 200, 'gA'),
            json('a3', 260, 60, 'gA'), json('out', -300, 150)],
    pipes: [],
  },
  // nested: a group inside a group — fold the inner, the outer, or both
  nested: {
    nodes: [group('gO', 100, 100, 900, 620), group('gI', 60, 80, 400, 300, 'gO'),
            json('b1', 30, 50, 'gI'), json('b2', 30, 170, 'gI'), json('b3', 540, 120, 'gO'),
            json('bout', -260, 200)],
    pipes: [],
  },
  // large: 7 groups, 5 of them saved already folded (the census 7338db76 ② never tested)
  large: (() => {
    const nodes: Record<string, unknown>[] = []
    for (let g = 0; g < 7; g++) {
      nodes.push(group(`cg${g}`, 100 + (g % 4) * 700, 100 + Math.floor(g / 4) * 560, 600, 460, undefined, g < 5))
      for (let k = 0; k < 5; k++) nodes.push(json(`c${g}_${k}`, 40, 50 + k * 78, `cg${g}`))
    }
    nodes.push(json('cfree', -400, 100))
    return { nodes, pipes: [] }
  })(),
  // resized: the size lives in TOP-LEVEL width/height (what NodeResizer writes), not style
  resized: {
    nodes: [{ ...group('gR', 150, 150, 400, 300), width: 780, height: 540 },
            json('d1', 50, 60, 'gR'), { ...json('d2', 50, 260, 'gR'), width: 460, height: 220 }],
    pipes: [],
  },
}

const load = (doc: Doc) => {
  const store = createFlowStore()
  store.getState().importGraph(JSON.stringify(doc), undefined, { replace: true })
  return store
}
const groupIds = (store: ReturnType<typeof load>) =>
  store.getState().nodes.filter((n) => n.type === 'group').map((n) => n.id)
const fold = (store: ReturnType<typeof load>, id: string, collapsed: boolean) =>
  store.getState().updateGroupNode(id, { collapsed })
const isFolded = (store: ReturnType<typeof load>, id: string) =>
  (store.getState().nodes.find((n) => n.id === id)!.data as { collapsed?: boolean }).collapsed === true

describe.each(Object.entries(DOCS))('fold → unfold moves nothing: %s', (_name, doc) => {
  it('one group at a time', () => {
    const store = load(doc)
    for (const gid of groupIds(store)) {
      const before = boxes(store.getState().nodes)
      const was = isFolded(store, gid)
      fold(store, gid, !was)
      fold(store, gid, was)
      expect(boxes(store.getState().nodes)).toEqual(before)
    }
  })

  it('every group folded at once, then restored', () => {
    const store = load(doc)
    const before = boxes(store.getState().nodes)
    const was = new Map(groupIds(store).map((id) => [id, isFolded(store, id)]))
    for (const gid of was.keys()) fold(store, gid, true)
    for (const [gid, v] of was) fold(store, gid, v)
    expect(boxes(store.getState().nodes)).toEqual(before)
  })

  it('the fold itself moves nothing either — the frame stays where it was', () => {
    // Not the same claim as the round-trip: a fold that shifted the frame and a matching
    // unfold that shifted it back would pass the test above and still be visibly wrong.
    const store = load(doc)
    const before = boxes(store.getState().nodes)
    for (const gid of groupIds(store)) fold(store, gid, true)
    expect(boxes(store.getState().nodes)).toEqual(before)
  })
})

describe('the measurement can fail', () => {
  // Positive control: without this, every assertion above would still be green if `boxes`
  // stopped following parentId or stopped reading top-level width.
  it('sees a 1px nudge of a parent, on the parent AND on its child', () => {
    const store = load(DOCS.flat)
    const before = boxes(store.getState().nodes)
    store.setState({
      nodes: store.getState().nodes.map((n) =>
        n.id === 'gA' ? { ...n, position: { ...n.position, x: n.position.x + 1 } } : n),
    })
    const after = boxes(store.getState().nodes)
    expect(after.find((b) => b.id === 'gA')!.x).toBe(before.find((b) => b.id === 'gA')!.x + 1)
    expect(after.find((b) => b.id === 'a1')!.x).toBe(before.find((b) => b.id === 'a1')!.x + 1)
  })

  it('reads the NodeResizer size (top-level width) in preference to style', () => {
    const store = load(DOCS.resized)
    expect(boxes(store.getState().nodes).find((b) => b.id === 'gR')).toMatchObject({ w: 780, h: 540 })
  })
})
