import { describe, it, expect } from 'vitest'
import { createFlowStore, type AnyNode } from '../flowStore'
import { estimateNodeSize } from '../importFormats'

/**
 * A COPY IS THE SAME SIZE AS WHAT IT COPIED — card dd36fb76, from the owner's report that
 * "复制的时候,有些 group 节点的尺寸都变了".
 *
 * The bug this pins: a node's size lives in `style.width/height` (creation, import) OR in
 * top-level `width/height` (NodeResizer — it emits a dimensions change with
 * `setAttributes: true` and applyNodeChanges writes the top level, never style). React
 * Flow reads `node.width ?? node.style?.width`, so for a node the user ever resized, the
 * top level is the real size and style still holds its birth size. All four in-canvas copy
 * constructors rebuilt the node from a field list carrying only `style` — so a resized
 * 780x540 group came back as 400x300, addGroupNode's creation default. See copiedSize().
 *
 * Every path here reads the STORE, never the rendered node, which is why the collapsed
 * start state below makes no difference to any of them.
 */

/** The size React Flow will apply to one node, parents irrelevant. */
function renderedSize(n: AnyNode) {
  const style = n.style as { width?: unknown; height?: unknown } | undefined
  const w = typeof n.width === 'number' ? n.width : typeof style?.width === 'number' ? style.width : undefined
  const h = typeof n.height === 'number' ? n.height : typeof style?.height === 'number' ? style.height : undefined
  const est = estimateNodeSize({ ...n, data: { ...(n.data as object), collapsed: false } })
  return { w: w ?? est.width, h: h ?? est.height }
}

/**
 * A store holding one resized group, a resized child and a plain child.
 * The resize goes through the change React Flow's own NodeResizer emits, so the test is
 * pinned to the real mechanism rather than to a hand-written node shape.
 */
function seed(collapsed: boolean) {
  const store = createFlowStore()
  const gid = store.getState().addGroupNode('G', { x: 100, y: 100 })
  const resizedChild = store.getState().addJsonNode('resized child', [], { x: 40, y: 40 })
  const plainChild = store.getState().addJsonNode('plain child', [], { x: 40, y: 240 })
  store.setState({
    nodes: store.getState().nodes.map((n) => (n.id === gid ? n : { ...n, parentId: gid })),
  })
  const resize = (id: string, width: number, height: number) =>
    store.getState().onNodesChange([
      { id, type: 'dimensions', resizing: true, setAttributes: true, dimensions: { width, height } },
      { id, type: 'dimensions', resizing: false },
    ] as never)
  resize(gid, 780, 540)
  resize(resizedChild, 460, 220)
  if (collapsed) store.getState().updateGroupNode(gid, { collapsed: true })
  return { store, gid, resizedChild, plainChild }
}

describe.each([false, true])('copy keeps the size (group collapsed: %s)', (collapsed) => {
  it('duplicateNode', () => {
    const { store, gid } = seed(collapsed)
    const src = store.getState().nodes.find((n) => n.id === gid)!
    const copyId = store.getState().duplicateNode(gid)
    const copy = store.getState().nodes.find((n) => n.id === copyId)!
    expect(renderedSize(copy)).toEqual(renderedSize(src))
    expect(renderedSize(copy)).toEqual({ w: 780, h: 540 })
  })

  it('duplicateNodes — the whole diagram at once', () => {
    const { store } = seed(collapsed)
    const before = store.getState().nodes
    const ids = store.getState().duplicateNodes(before.map((n) => n.id))
    const after = store.getState().nodes
    expect(ids.map((id) => renderedSize(after.find((n) => n.id === id)!)))
      .toEqual(before.map(renderedSize))
  })

  it('copyNodesToClipboard → pasteNodesFromClipboard', () => {
    const { store } = seed(collapsed)
    const before = store.getState().nodes
    // What copyNodesToClipboard writes: the store nodes, cloned verbatim. Written out
    // here rather than called, because it goes through navigator.clipboard.
    const payload = JSON.stringify({ _dataflow: true, nodes: JSON.parse(JSON.stringify(before)), pipes: [] })
    const ids = store.getState().pasteNodesFromClipboard(payload, { x: 0, y: 0 })
    const after = store.getState().nodes
    expect(ids.map((id) => renderedSize(after.find((n) => n.id === id)!)))
      .toEqual(before.map(renderedSize))
  })

  it('copyNode → pasteNode', () => {
    const { store, gid } = seed(collapsed)
    const src = store.getState().nodes.find((n) => n.id === gid)!
    store.getState().copyNode(gid)
    const copyId = store.getState().pasteNode()
    const copy = store.getState().nodes.find((n) => n.id === copyId)!
    expect(renderedSize(copy)).toEqual(renderedSize(src))
  })

  it('exportGraph → importGraph (save/reload, file export, the CLI round-trip)', () => {
    const { store } = seed(collapsed)
    const reopened = createFlowStore()
    reopened.getState().importGraph(store.getState().exportGraph(), undefined, { replace: true })
    expect(reopened.getState().nodes.map(renderedSize))
      .toEqual(store.getState().nodes.map(renderedSize))
  })
})

describe('what a copy must NOT carry', () => {
  it('drops `measured` — for a folded group that is the chip, not the frame', () => {
    // The render boundary strips a collapsed group's size so React Flow measures the
    // ~150x28 chip (collapsedNodeSize.ts), and that measurement lands back in the store as
    // `measured`. Carrying it into a copy would freeze the chip's size onto a node that is
    // about to be expanded.
    const { store, gid } = seed(true)
    store.setState({
      nodes: store.getState().nodes.map((n) =>
        (n.id === gid ? { ...n, measured: { width: 150, height: 28 } } : n)),
    })
    const copyId = store.getState().duplicateNode(gid)
    const copy = store.getState().nodes.find((n) => n.id === copyId)!
    expect(copy.measured).toBeUndefined()
    expect(renderedSize(copy)).toEqual({ w: 780, h: 540 })
  })
})
