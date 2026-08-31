import { describe, it, expect } from 'vitest'
import { computeNoteEdgeClasses, NOTE_EDGE_MUTED, NOTE_EDGE_REVEALED } from '../useCollapsedNoteEdges'
import type { AnyNode, Pipe } from '../../store/flowStore'

const note = (id: string, collapsed: boolean): AnyNode =>
  ({ id, type: 'note', position: { x: 0, y: 0 }, data: { name: id, content: '', collapsed } }) as AnyNode
const box = (id: string): AnyNode =>
  ({ id, type: 'shape', position: { x: 0, y: 0 }, data: { name: id } }) as AnyNode
const pipe = (id: string, source: string, target: string): Pipe =>
  ({ id, source, target }) as Pipe

const cls = (m: Map<string, string>, id: string) => m.get(id)

describe('computeNoteEdgeClasses', () => {
  it('mutes the edge of a collapsed note and leaves every other edge alone', () => {
    const nodes = [box('a'), box('b'), note('n1', true)]
    const pipes = [pipe('structural', 'a', 'b'), pipe('noteLine', 'n1', 'a')]

    const classes = computeNoteEdgeClasses(nodes, pipes, null)

    expect(cls(classes, 'noteLine')).toBe(NOTE_EDGE_MUTED)
    expect(classes.has('structural')).toBe(false)
  })

  it('leaves an EXPANDED note’s edge alone — collapse is what hides the line', () => {
    const nodes = [box('a'), note('n1', false)]
    const classes = computeNoteEdgeClasses(nodes, [pipe('noteLine', 'n1', 'a')], null)
    expect(classes.size).toBe(0)
  })

  it('the note end decides when one end is collapsed and the other is not', () => {
    // The card's "一端折叠一端没折叠，以 note 那端的状态为准": 'a' is an ordinary
    // expanded node, so if the far end were allowed a vote the line would stay.
    const nodes = [box('a'), note('n1', true)]
    const classes = computeNoteEdgeClasses(nodes, [pipe('noteLine', 'a', 'n1')], null)
    expect(cls(classes, 'noteLine')).toBe(NOTE_EDGE_MUTED)
  })

  it('hovering the collapsed note reveals ALL of its lines, not just one', () => {
    const nodes = [box('a'), box('b'), note('n1', true)]
    const pipes = [pipe('toA', 'n1', 'a'), pipe('toB', 'n1', 'b'), pipe('structural', 'a', 'b')]

    const classes = computeNoteEdgeClasses(nodes, pipes, 'n1')

    expect(cls(classes, 'toA')).toBe(`${NOTE_EDGE_MUTED} ${NOTE_EDGE_REVEALED}`)
    expect(cls(classes, 'toB')).toBe(`${NOTE_EDGE_MUTED} ${NOTE_EDGE_REVEALED}`)
    expect(classes.has('structural')).toBe(false)
  })

  it('hovering the NODE reveals the collapsed notes pointing at it, and only those', () => {
    // The card's bonus, which is the same rule read from the other end.
    const nodes = [box('a'), box('b'), note('n1', true), note('n2', true)]
    const pipes = [pipe('n1ToA', 'n1', 'a'), pipe('n2ToB', 'n2', 'b')]

    const classes = computeNoteEdgeClasses(nodes, pipes, 'a')

    expect(cls(classes, 'n1ToA')).toBe(`${NOTE_EDGE_MUTED} ${NOTE_EDGE_REVEALED}`)
    expect(cls(classes, 'n2ToB')).toBe(NOTE_EDGE_MUTED)
  })

  it('hovering an unrelated node reveals nothing', () => {
    const nodes = [box('a'), box('b'), note('n1', true)]
    const classes = computeNoteEdgeClasses(nodes, [pipe('noteLine', 'n1', 'a')], 'b')
    expect(cls(classes, 'noteLine')).toBe(NOTE_EDGE_MUTED)
  })

  it('a graph with no collapsed notes produces no classes at all', () => {
    // The empty map is what lets DataflowReadonlyPreview hand React Flow the
    // untouched `pipes` array, so a diagram without collapsed notes renders
    // exactly the objects it rendered before this feature existed.
    const nodes = [box('a'), box('b'), note('n1', false)]
    const classes = computeNoteEdgeClasses(nodes, [pipe('structural', 'a', 'b')], 'a')
    expect(classes.size).toBe(0)
  })
})
