// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowStore } from '../flowStore'
import { parseDsl } from '../dslParser'
import { importPastedGraph } from '../pasteImport'

/**
 * 🔴 The hard line, asserted rather than agreed to (design fb629b6a note 9630c775 §1):
 * DSL is an EDIT INSTRUCTION format. The one document format is still whole JSON
 * (master, 2026-08-26). Four layers, four assertions.
 *
 * ⚠️ DEVIATION FROM THE DESIGN, recorded where it applies: §1.2 asks for an eslint
 * `no-restricted-imports` rule as the mechanical defence. This package has no eslint —
 * no config, no dependency, no script — and ud-vite-app's `eslint .` runs from its own
 * directory and never reaches this sibling repo. A rule written into either place would
 * be decoration. The scan below is the same defence enforced where CI actually looks:
 * `npm test`, which .github/workflows/ci.yml runs on every push and PR.
 */

const SRC = new URL('../..', import.meta.url).pathname

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'test') continue
      sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('§1.2 wiring — the document path cannot reach the DSL parser', () => {
  it('only pasteImport.ts can CALL the parser — everyone else may import its types', () => {
    // The boundary is a runtime one. `import type { EditPlan }` compiles away entirely and
    // gives its holder no way to turn text into a plan; a value import does. So the scan
    // looks for value imports, and editPlan.ts/flowStore.ts — which pass an ALREADY
    // parsed plan around — are correctly not offenders.
    const valueImporters = sourceFiles(SRC)
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return (src.match(/^import\s+(?!type\s)[^\n]*from\s+['"][^'"]*dslParser['"]/gm) ?? []).length > 0
      })
      .map((f) => f.slice(SRC.length))
    expect(valueImporters.sort()).toEqual(['store/pasteImport.ts'])
  })

  it('parseDsl is called from exactly one place', () => {
    const callers = sourceFiles(SRC)
      .filter((f) => !f.endsWith('dslParser.ts'))  // its own definition is not a call site
      .filter((f) => /parseDsl\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length))
    expect(callers.sort()).toEqual(['store/pasteImport.ts'])
  })

  it('dslParser imports nothing at all — it cannot reach a document path even by accident', () => {
    const src = readFileSync(join(SRC, 'store/dslParser.ts'), 'utf8')
    expect(src.match(/^import\s.*$/gm) ?? []).toEqual([])
  })

  it('opening a document goes straight to the JSON parser, never through the dispatcher', () => {
    // DataflowCanvas's replace-mode open. If this line ever routes through pasteImport,
    // the dispatcher becomes reachable from the document path.
    const canvas = readFileSync(join(SRC, 'DataflowCanvas.tsx'), 'utf8')
    expect(canvas).toContain("importGraph(initialContent, undefined, { replace: true })")
    expect(canvas).not.toMatch(/importPastedGraph\s*\(\s*initialContent/)
  })
})

describe('§1.1 grammar — there is no way to write a document in DSL', () => {
  it('no graph-to-DSL serializer is DEFINED anywhere in the package', () => {
    // A declaration, not a mention: dslParser.ts's own header says out loud that this
    // function must never exist, and a scan that trips over that sentence would be a
    // gate nobody could keep green.
    const declares = /(?:function|const|let|class)\s+graphTo(?:Dsl|DSL)\b|graphTo(?:Dsl|DSL)\s*[:=]/
    const offenders = sourceFiles(SRC)
      .filter((f) => declares.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('the grammar cannot express geometry, style, grouping or handles', () => {
    const plan = parseDsl([
      'node a A: x string',
      'node a position 100 200',
      'node b B parentId a',
      'link a -> b sourceHandle output-x',
    ].join('\n'))
    // Whatever those extra words did, they landed in a display name at most. An op has a
    // fixed, tiny key set and no way to grow one — asserted on the KEYS, because a display
    // name is free text and may legitimately contain the word "position".
    const keys = [...new Set(plan.ops.flatMap((op) => Object.keys(op)))].sort()
    expect(keys).toEqual(['fields', 'id', 'kind', 'line', 'name'])
    for (const op of plan.ops) {
      expect(op).not.toHaveProperty('position')
      expect(op).not.toHaveProperty('parentId')
      expect(op).not.toHaveProperty('style')
    }
  })
})

describe('§1.4 + the delivery criterion — DSL text can never become document content', () => {
  const DSL = 'node users 用户: id uuid, email string\nlink users -> users'

  it('through the paste path: what gets saved is JSON, and the DSL text is nowhere in it', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph(DSL, {
      importGraph: store.getState().importGraph,
      applyEditPlan: store.getState().applyEditPlan,
      setImportSummary: store.getState().setImportSummary,
    }, { rect: { x: 0, y: 0, width: 1440, height: 900 } })

    // The paste must actually have DONE something first. Without this line the assertions
    // below hold vacuously the moment the DSL branch is switched off — which is exactly
    // what the negative-control run showed before it was added.
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 1 } })

    const saved = store.getState().exportGraph()
    expect(() => JSON.parse(saved)).not.toThrow()
    expect(saved).not.toContain('node users')
    expect(saved).not.toContain('link users')
    // What DID land is a normal node in the normal format, indistinguishable from one the
    // editor drew itself — the DSL left no trace of having been the input.
    expect(JSON.parse(saved).nodes[0]).toMatchObject({ id: 'users', type: 'json' })
  })

  it('through the document path: DSL handed to importGraph is refused, canvas untouched', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify({
      nodes: [{ id: 'keep', type: 'json', position: { x: 0, y: 0 }, data: { name: 'keep', fields: [] } }],
      pipes: [],
    }), undefined, { replace: true })

    const result = store.getState().importGraph(DSL, undefined, { replace: true })

    expect(result).toBeNull()
    expect(store.getState().nodes.map((n) => n.id)).toEqual(['keep'])
  })

  it('a failed DSL parse pollutes nothing — no snapshot, no dirty canvas', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph('I cannot help with that.', {
      importGraph: store.getState().importGraph,
      applyEditPlan: store.getState().applyEditPlan,
      setImportSummary: store.getState().setImportSummary,
    })
    expect(outcome.ok).toBe(false)
    expect(store.getState().nodes).toEqual([])
    expect(store.getState().canUndo).toBe(false)
    expect(store.getState().importSummary).toBeNull()
  })
})
