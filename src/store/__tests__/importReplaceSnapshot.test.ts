// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'

/**
 * The header's whole-file import (owner 2026-09-04) replaces the canvas but must
 * be ONE Ctrl+Z away from what it replaced — that promise is why it ships without
 * a confirm dialog. The plain replace (initial document load) stays history-free.
 */

const DOC = (name: string) => JSON.stringify({
  nodes: [{ id: name, type: 'json', position: { x: 0, y: 0 }, data: { name, fields: [] } }],
  pipes: [],
})

describe('replace import with snapshot', () => {
  it('replaces the canvas and one undo restores the previous one', () => {
    const store = createFlowStore()
    store.getState().importGraph(DOC('before'), undefined, { replace: true })
    expect(store.getState().canUndo).toBe(false) // document open: history-free

    const result = store.getState().importGraph(DOC('after'), undefined, { replace: true, snapshot: true })
    expect(result?.addedNodes).toBe(1)
    expect(store.getState().nodes[0].data.name).toBe('after')
    expect(store.getState().canUndo).toBe(true)

    store.getState().undo()
    expect(store.getState().nodes[0].data.name).toBe('before')
  })

  it('a file that is not a diagram leaves canvas AND history untouched', () => {
    const store = createFlowStore()
    store.getState().importGraph(DOC('before'), undefined, { replace: true })
    const result = store.getState().importGraph('just some prose', undefined, { replace: true, snapshot: true })
    expect(result).toBeNull()
    expect(store.getState().nodes[0].data.name).toBe('before')
    expect(store.getState().canUndo).toBe(false)
  })
})
