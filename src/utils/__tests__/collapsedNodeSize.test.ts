// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stripSizeWhenCollapsed } from '../collapsedNodeSize'
import type { AnyNode } from '../../store/flowStore'

// The real shape from the bug report (task 9e261960): a collapsed note whose
// wire format carries `width: 680`. The wrapper stayed 680px wide, so its
// node-top handle sat 324px right of the visible 32px square.
const collapsedNoteWithWidth = {
  id: 'n1',
  type: 'note',
  position: { x: 300, y: 300 },
  width: 680,
  data: { name: 'note', content: '', collapsed: true },
} as AnyNode

describe('stripSizeWhenCollapsed', () => {
  it('drops top-level width/height from a collapsed note', () => {
    const [out] = stripSizeWhenCollapsed([collapsedNoteWithWidth])
    expect(out.width).toBeUndefined()
    expect(out.height).toBeUndefined()
    expect(out.position).toEqual({ x: 300, y: 300 })
  })

  it('drops style.width/height but keeps other style keys', () => {
    const node = {
      id: 'n2',
      type: 'resource',
      position: { x: 0, y: 0 },
      style: { width: 240, height: 200, opacity: 0.5 },
      data: { name: 'res', collapsed: true },
    } as AnyNode
    const [out] = stripSizeWhenCollapsed([node])
    expect(out.style).toEqual({ opacity: 0.5 })
  })

  it('does not mutate the store node — expand must restore the size', () => {
    stripSizeWhenCollapsed([collapsedNoteWithWidth])
    expect(collapsedNoteWithWidth.width).toBe(680)
  })

  it('returns expanded and sizeless nodes untouched (same reference)', () => {
    const expanded = { ...collapsedNoteWithWidth, id: 'n3', data: { ...collapsedNoteWithWidth.data, collapsed: false } } as AnyNode
    const sizeless = { id: 'n4', type: 'note', position: { x: 0, y: 0 }, data: { name: 'n', content: '', collapsed: true } } as AnyNode
    const group = { id: 'g1', type: 'group', position: { x: 0, y: 0 }, style: { width: 400, height: 300 }, data: { name: 'g' } } as AnyNode
    const out = stripSizeWhenCollapsed([expanded, sizeless, group])
    expect(out[0]).toBe(expanded)
    expect(out[1]).toBe(sizeless)
    expect(out[2]).toBe(group)
  })
})
