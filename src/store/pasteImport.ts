import type { ImportResult } from './flowStore'
import { detectLegacyDialect } from './importFormats'
import { extractGraphJson, looksLikeGraphPayload } from '../utils/extractJson'

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
 * Order: unwrap the fence/prose → refuse a retired dialect by name → import with paste
 * semantics. Every exit is named. ⛔ There is no path through this function that leaves
 * the user with nothing happening.
 */

export type PasteFailure =
  /** Answer was cut off mid-object — go back to the chat and ask for it whole. */
  | 'truncated'
  /** No JSON at all — probably a refusal or the wrong clipboard. */
  | 'noJson'
  /** Complete but unreadable even after repair. */
  | 'malformed'
  /** Output of a retired copy-prompt — re-copy the current one. */
  | 'legacyDialect'
  /** Valid JSON, but not a graph — the parser found nothing importable. */
  | 'notAGraph'

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
}

interface PasteTarget {
  importGraph: (
    json: string,
    viewportCenter?: { x: number; y: number },
    opts?: { replace?: boolean; sameIdMeansSameNode?: boolean },
  ) => ImportResult | null
  setImportSummary: (summary: ImportResult | null) => void
}

export function importPastedGraph(
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

/**
 * Is this clipboard text a graph the canvas should import rather than keep as a note?
 *
 * Only Ctrl+V asks. The other two entry points are buttons labelled "import", where the
 * user's intent is not in question; on the canvas the same keystroke also means "keep
 * this text", so the probe has to be narrow enough that a JSON file someone wanted as a
 * note stays a note. Anything it gets wrong is one Ctrl+Z away.
 */
export function clipboardTextIsGraph(raw: string): boolean {
  const extracted = extractGraphJson(raw)
  return extracted.ok && looksLikeGraphPayload(extracted.value)
}
