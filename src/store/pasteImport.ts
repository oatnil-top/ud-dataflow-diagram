import type { ImportResult } from './flowStore'
import type { ViewportRect } from './editPlan'
import { detectLegacyDialect } from './importFormats'
import { extractGraphJson, looksLikeGraphPayload, unwrapModelText } from '../utils/extractJson'
import { parseDsl, looksLikeDslPayload } from './dslParser'

/**
 * The one pipeline behind every place a user pastes text that a model wrote.
 *
 * Three entry points feed it — the import panel, the toolbar's import popover, and Ctrl+V
 * on the canvas — and they must behave identically, because the user was told "paste it
 * back" and does not know which of the three they are standing in. Written once here so
 * the容错 layer cannot be present in one and missing in another, which is precisely the
 * state this replaces: extractJson already existed and only the in-app AI panel used it,
 * so a fenced answer (5 of 5 real runs) died on a raw JSON.parse at every paste entry.
 *
 * Order: unwrap the fence/prose -> pick a format -> refuse a retired dialect by name ->
 * apply. Every exit is named. There is no path through this function that leaves the user
 * with nothing happening.
 *
 * ---------------------------------------------------------------------------
 * THE DISPATCH RULE, and the reason it is written down rather than inferred.
 *
 * Two formats now arrive here: whole-graph JSON (which is also the ONLY format a diagram
 * is stored in) and the edit DSL (dslParser.ts), which a chat writes when the user asked
 * for a small change. Misrouting between them is the riskiest square on the board
 * (design fb629b6a note 9630c775 section 7), because the two failure messages send the
 * user in opposite directions.
 *
 * So the rule is fixed, and asserted in pasteDispatch.test.ts:
 *
 *   after unwrapping, if the first non-blank character is `{` or `[` -> JSON branch,
 *   which behaves EXACTLY as it did before this file grew a second branch.
 *   Otherwise -> DSL branch.
 *
 * The half that matters is the first: JSON that is truncated or malformed still fails
 * inside the JSON branch, by its own name. Without a character test it would parse as DSL
 * to zero commands and be reported as "no diagram found" — telling someone whose answer
 * got cut off to go and check their clipboard.
 *
 * The DSL branch is only ever reached from here. Nothing that opens or saves a document
 * passes through this function (DataflowCanvas replace-mode open calls importGraph
 * directly), and dslBoundary.test.ts asserts that this file is the parser's only importer.
 */

export type PasteFailure =
  /** Answer was cut off mid-object — go back to the chat and ask for it whole. */
  | 'truncated'
  /** No JSON and no commands — probably a refusal or the wrong clipboard. */
  | 'noJson'
  /** Complete but unreadable even after repair. */
  | 'malformed'
  /** Output of a retired copy-prompt — re-copy the current one. */
  | 'legacyDialect'
  /** Valid JSON, but not a graph — the parser found nothing importable. */
  | 'notAGraph'
  /**
   * Lines that begin with `node`/`link` but none of them could be read. Distinct from
   * `noJson` on purpose: this user HAS edit commands in their clipboard and needs to be
   * pointed at a line number, not sent back to re-copy the prompt.
   */
  | 'dslUnreadable'

export type PasteOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; reason: PasteFailure }

/** Locale key for what to tell the user. Kept beside the reasons so none can go unhandled. */
export const PASTE_FAILURE_KEYS: Record<PasteFailure, string> = {
  truncated: 'resources.dataflow.paste.truncated',
  noJson: 'resources.dataflow.paste.noJson',
  malformed: 'resources.dataflow.paste.malformed',
  legacyDialect: 'resources.dataflow.panel.legacyFormatRejected',
  notAGraph: 'resources.dataflow.paste.notAGraph',
  dslUnreadable: 'resources.dataflow.paste.dslUnreadable',
}

/**
 * Where the new nodes should land.
 *
 * `rect` is the DSL channel's requirement and `center` is the JSON channel's: the two
 * placement rules are deliberately different and the reason is written on
 * editPlan.clampIntoViewport. A caller that has neither still works — placement then
 * falls back to what each branch did before viewports were involved.
 */
export interface PasteViewport {
  center?: { x: number; y: number }
  rect?: ViewportRect
}

interface PasteTarget {
  importGraph: (
    json: string,
    viewportCenter?: { x: number; y: number },
    opts?: { replace?: boolean; sameIdMeansSameNode?: boolean },
  ) => ImportResult | null
  applyEditPlan: (plan: ReturnType<typeof parseDsl>, viewport?: ViewportRect) => ImportResult | null
  setImportSummary: (summary: ImportResult | null) => void
}

/** JSON opens with an object or an array; nothing in the DSL grammar can. */
function looksLikeJson(unwrapped: string): boolean {
  const first = unwrapped.trimStart()[0]
  return first === '{' || first === '['
}

export function importPastedGraph(
  raw: string,
  target: PasteTarget,
  viewport?: PasteViewport,
): PasteOutcome {
  // The unwrap layer is shared by both formats now. Measured DSL runs came back with no
  // fence 3 times out of 3 (design section 6) — 3 of 3 is an observation, not a guarantee,
  // so the fence stripper stays in front of both branches.
  if (!raw || !raw.trim()) return { ok: false, reason: 'noJson' }
  const unwrapped = unwrapModelText(raw)

  if (looksLikeJson(unwrapped)) return importJsonPayload(raw, target, viewport?.center)
  return importDslPayload(unwrapped, target, viewport?.rect)
}

function importJsonPayload(
  raw: string,
  target: PasteTarget,
  viewportCenter?: { x: number; y: number },
): PasteOutcome {
  const extracted = extractGraphJson(raw)
  if (!extracted.ok) return { ok: false, reason: extracted.reason }

  const value = extracted.value as { nodes?: unknown[]; groups?: unknown[] }
  if (value && typeof value === 'object' && detectLegacyDialect(value)) {
    return { ok: false, reason: 'legacyDialect' }
  }

  // Re-serialize rather than pass the raw text on: what got extracted is what gets
  // imported, fence and prose already gone.
  const result = target.importGraph(JSON.stringify(value), viewportCenter, { sameIdMeansSameNode: true })
  if (!result) return { ok: false, reason: 'notAGraph' }

  target.setImportSummary(result)
  return { ok: true, result }
}

function importDslPayload(
  unwrapped: string,
  target: PasteTarget,
  viewport?: ViewportRect,
): PasteOutcome {
  // Parsing happens BEFORE the store is touched at all, so a failed parse cannot leave a
  // snapshot, a dirty flag, or half an edit behind.
  const plan = parseDsl(unwrapped)
  if (plan.ops.length === 0) {
    return { ok: false, reason: plan.badLines.length > 0 ? 'dslUnreadable' : 'noJson' }
  }

  const result = target.applyEditPlan(plan, viewport)
  if (!result) return { ok: false, reason: 'noJson' }

  target.setImportSummary(result)
  return { ok: true, result }
}

/**
 * Is this clipboard text something the canvas should import rather than keep as a note?
 *
 * Only Ctrl+V asks. The other two entry points are buttons labelled "import", where the
 * user's intent is not in question; on the canvas the same keystroke also means "keep
 * this text", so the probe has to be narrow enough that a JSON file someone wanted as a
 * note stays a note — and, since the DSL is plain prose-shaped text, narrow enough that a
 * paragraph beginning with the word "node" stays a paragraph. looksLikeDslPayload carries
 * that second rule. Anything either of them gets wrong is one Ctrl+Z away.
 */
export function clipboardTextIsGraph(raw: string): boolean {
  if (!raw || !raw.trim()) return false
  const unwrapped = unwrapModelText(raw)
  if (looksLikeJson(unwrapped)) {
    const extracted = extractGraphJson(raw)
    return extracted.ok && looksLikeGraphPayload(extracted.value)
  }
  return looksLikeDslPayload(parseDsl(unwrapped))
}
