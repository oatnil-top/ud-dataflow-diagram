import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFlowStore } from '../../store/flowStore'
import { startAutoSave } from '../autoSave'

/**
 * Autosave replaces the Save button on the standalone playground (owner, 2026-09-04),
 * so what these tests defend is DATA: an edit must reach the host's save without any
 * button, a pause must produce one write rather than one per keystroke, and a failed
 * write must leave the store dirty so the work is still known to be unsaved.
 *
 * Real createFlowStore, no component — startAutoSave is a plain function over the
 * store on purpose.
 */

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const edit = (store: ReturnType<typeof createFlowStore>, name = 'users') => {
  store.getState().addJsonNode(name, [], { x: 0, y: 0 })
}

describe('startAutoSave', () => {
  it('an edit saves by itself after the pause, and the store comes back clean', async () => {
    const store = createFlowStore()
    const save = vi.fn(async (_json: string) => {})
    startAutoSave(store, save)

    edit(store)
    expect(store.getState().isDirty).toBe(true)
    expect(save).not.toHaveBeenCalled() // not per keystroke

    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(String(save.mock.calls[0][0])).toContain('users')
    expect(store.getState().isDirty).toBe(false)
  })

  it('edits inside the debounce window collapse into one write', async () => {
    const store = createFlowStore()
    const save = vi.fn(async (_json: string) => {})
    startAutoSave(store, save)

    edit(store, 'one')
    await vi.advanceTimersByTimeAsync(500)
    edit(store, 'two')
    await vi.advanceTimersByTimeAsync(500)
    expect(save).not.toHaveBeenCalled() // second edit reset the timer

    await vi.advanceTimersByTimeAsync(300)
    expect(save).toHaveBeenCalledTimes(1)
    expect(String(save.mock.calls[0][0])).toContain('two') // the write carries both edits
    expect(String(save.mock.calls[0][0])).toContain('one')
  })

  it('a failed write leaves the store dirty — the work must stay known-unsaved', async () => {
    const store = createFlowStore()
    const save = vi.fn(async () => { throw new Error('quota') })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    startAutoSave(store, save)

    edit(store)
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(store.getState().isDirty).toBe(true)
    consoleError.mockRestore()
  })

  it('after stop, edits no longer save', async () => {
    const store = createFlowStore()
    const save = vi.fn(async (_json: string) => {})
    const stop = startAutoSave(store, save)

    stop()
    edit(store)
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
  })
})
