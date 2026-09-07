import type { AnyNode, Pipe } from '../store/flowStore'
import { estimateNodeSize, facingHandles } from '../store/importFormats'

/**
 * What a COLLAPSED group hides, and where its members' edges go instead (card 20d64f9b).
 *
 * A render-boundary transform, exactly like stripSizeWhenCollapsed and
 * computeNoteEdgeClasses: the store and the wire format never learn about any of this.
 * `data.collapsed` on the group is the only persisted bit; everything below is recomputed
 * from it on every render, so expanding restores the diagram byte for byte and an export
 * taken while a group is folded is the same file as one taken while it is open.
 *
 * The rules, in order:
 *
 *  1. hiddenBy(node) = the OUTERMOST collapsed group among its ancestors (walk parentId;
 *     a cycle guard, because a hand-edited document can name one). Outermost, not
 *     nearest: a collapsed group inside a collapsed group is itself hidden, so pointing
 *     an edge at it would point it at nothing on screen.
 *  2. Any node with such an ancestor is `hidden: true`. The collapsed group itself is not
 *     — it is the chip you can still see and still connect to.
 *  3. A pipe's ends are mapped through hiddenBy. Both ends landing on the same id means
 *     the pipe is now internal to one chip (two members talking, or a member talking to
 *     its own collapsed ancestor) and it is hidden.
 *  4. A REWRITTEN end gets its handle recomputed by facingHandles — the same
 *     dominant-axis rule importFormats uses for an undeclared handle, imported rather
 *     than copied. The untouched end keeps whatever the document declared: it still
 *     points at the same node, so its side is still the author's answer.
 *  5. `data.waypoints` is dropped on a rewritten pipe. Those anchors are absolute points
 *     drawn for the old endpoints; kept, they bend the new line through the middle of
 *     the collapsed region.
 *  6. Pipes that end up on the same (source, target, sourceHandle, targetHandle) are one
 *     line on screen, so only one of them may be drawn. An UNTOUCHED pipe always wins
 *     that line, label and all — it is the edge the author drew to the group and it is
 *     still exactly true. Otherwise the first rewritten pipe survives; every other
 *     rewritten pipe on that line is hidden, and a survivor that swallowed others loses
 *     `data.description`, because two different labels stacked on one line read as one
 *     false sentence (the same reason PipeData carries labelOffset).
 *
 *     ⚠️ Comparing rewritten pipes only to EACH OTHER is not enough, and looks right:
 *     a diagram carrying both `client -> vnet` and `client -> gw` (gw inside vnet) drew
 *     two lines on one pair of handles with both labels stacked, because the second was
 *     the only rewritten one and had nothing to collide with. Found in browser QA, not
 *     here — hence the seeded key set below and the test named after it.
 *  7. A pipe already drawn to the collapsed group is untouched. The group is still there.
 *
 * IDENTITY MATTERS: with nothing collapsed this returns the caller's own arrays, and a
 * pipe that needs no change is passed through by reference, so an unchanged diagram
 * hands React Flow the exact objects it handed it before and re-renders nothing.
 */
export function applyCollapsedGroups(
  nodes: AnyNode[],
  pipes: Pipe[],
): { nodes: AnyNode[]; pipes: Pipe[] } {
  const collapsedGroups = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'group' && (node.data as { collapsed?: boolean }).collapsed) {
      collapsedGroups.add(node.id)
    }
  }
  if (collapsedGroups.size === 0) return { nodes, pipes }

  const byId = new Map(nodes.map((n) => [n.id, n]))

  /** The outermost collapsed group above this node, or undefined if it is visible. */
  const hiddenBy = (nodeId: string): string | undefined => {
    let outermost: string | undefined
    const seen = new Set<string>([nodeId])
    let parentId = byId.get(nodeId)?.parentId
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      if (collapsedGroups.has(parentId)) outermost = parentId
      parentId = byId.get(parentId)?.parentId
    }
    return outermost
  }

  /** Absolute center, parent offsets included — the same walk fillMissingHandles does. */
  const centerOf = (nodeId: string): { x: number; y: number } | undefined => {
    const node = byId.get(nodeId)
    if (!node) return undefined
    let { x, y } = node.position
    const seen = new Set<string>([nodeId])
    let parent = node.parentId ? byId.get(node.parentId) : undefined
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      x += parent.position.x
      y += parent.position.y
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    const size = estimateNodeSize(node)
    return { x: x + size.width / 2, y: y + size.height / 2 }
  }

  const outNodes = nodes.map((node) =>
    hiddenBy(node.id) ? ({ ...node, hidden: true } as AnyNode) : node)

  /** One line on screen = one (source, target, sourceHandle, targetHandle). */
  const lineKey = (p: Pipe) =>
    `${p.source} ${p.target} ${p.sourceHandle ?? ''} ${p.targetHandle ?? ''}`

  const rewritten = new Map<string, { key: string; pipe: Pipe }>()

  const outPipes = pipes.map((pipe) => {
    const source = hiddenBy(pipe.source) ?? pipe.source
    const target = hiddenBy(pipe.target) ?? pipe.target
    if (source === pipe.source && target === pipe.target) return pipe
    if (source === target) return { ...pipe, hidden: true } as Pipe

    const sc = centerOf(source)
    const tc = centerOf(target)
    // No geometry to reason with (an endpoint the document never declared): leave the
    // ends re-pointed but keep the declared handles rather than inventing a side.
    const facing = sc && tc ? facingHandles(sc, tc) : undefined
    const { waypoints: _dropped, ...data } = (pipe.data ?? {}) as Record<string, unknown>
    const next = {
      ...pipe,
      source,
      target,
      sourceHandle: source !== pipe.source ? (facing?.sourceHandle ?? pipe.sourceHandle) : pipe.sourceHandle,
      targetHandle: target !== pipe.target ? (facing?.targetHandle ?? pipe.targetHandle) : pipe.targetHandle,
      data: { ...data, groupMerged: true },
    } as Pipe

    rewritten.set(next.id, { key: lineKey(next), pipe: next })
    return next
  })

  // Everything below needs the WHOLE mapped list, so it is a second pass: neither "is
  // this line already the author's own edge" nor "did anything else merge onto it" is
  // knowable while the pipes are still being mapped one at a time.
  //
  // The key set is SEEDED with every untouched pipe (rule 6): those are drawn as-is, so
  // a rewritten pipe landing on one of their lines has nothing left to draw.
  const declaredKeys = new Set<string>()
  for (const pipe of outPipes) {
    if (!rewritten.has(pipe.id) && !pipe.hidden) declaredKeys.add(lineKey(pipe))
  }
  const mergedInto = new Map<string, number>()
  const survivor = new Map<string, string>()
  for (const { key, pipe } of rewritten.values()) {
    if (declaredKeys.has(key)) continue
    mergedInto.set(key, (mergedInto.get(key) ?? 0) + 1)
    if (!survivor.has(key)) survivor.set(key, pipe.id)
  }

  return {
    nodes: outNodes,
    pipes: outPipes.map((pipe) => {
      const entry = rewritten.get(pipe.id)
      if (!entry || entry.pipe !== pipe) return pipe
      if (survivor.get(entry.key) !== pipe.id) return { ...pipe, hidden: true } as Pipe
      if ((mergedInto.get(entry.key) ?? 0) < 2) return pipe
      const { description: _stacked, ...data } = pipe.data as Record<string, unknown>
      return { ...pipe, data } as Pipe
    }),
  }
}
