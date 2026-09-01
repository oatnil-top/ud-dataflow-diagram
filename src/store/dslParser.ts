/**
 * 🔴 The DSL is an EDIT INSTRUCTION format. It is NOT a document format.
 *
 * The one format of a stored diagram is still whole JSON (master, 2026-08-26: "全量的
 * JSON 是储存的唯一格式"). This file exists because that rule was never about how a user
 * asks a chat model for a small change — a five-table diagram costs 1110 tokens as JSON
 * and 113 as these two verbs (design fb629b6a note 9630c775 §6, same request, same
 * model), and the token count is the truncation surface.
 *
 * Four things keep the two apart, and three of them are visible right here:
 *
 *  1. GRAMMAR — `node` and `link`, nothing else. Position, style, group nesting and
 *     handles are unsayable in this language, so it cannot describe a document even if
 *     someone tried. ⛔ There is deliberately no `graphToDsl`: with no serializer there
 *     is no raw material for a second document format.
 *  2. TYPE — the output is an `EditPlan`, a list of operations. It has no serializable
 *     document shape, so no code path can accidentally treat it as one.
 *  3. WIRING — this module imports NOTHING. It cannot reach importFormats, the store, or
 *     anything that opens or saves a document, and `src/store/__tests__/dslBoundary.test.ts`
 *     asserts both that fact and that pasteImport.ts is its only importer.
 *
 * (The fourth is failure isolation: parsing happens entirely here, before any caller
 * touches a snapshot — see pasteImport.ts.)
 *
 * The grammar users are taught is in utils/graphToPrompt.ts and is the contract this
 * parser implements. Keep them in step: that text is what a stranger's chat model reads.
 */

/** One field declaration on a `node` line. Dotted names become a nested path. */
export interface DslField {
  /** Leaf name — the last path segment. */
  name: string
  /** Full path from the node root, e.g. ["address", "city"]. */
  path: string[]
  /** Whatever the model wrote, verbatim; unknown types are kept, not corrected. */
  type: string
}

export interface NodeOp {
  kind: 'node'
  /** 1-based line number in the pasted text — every report is by line. */
  line: number
  id: string
  /** Display name when the line gave one; absent means "leave the name alone". */
  name?: string
  fields: DslField[]
}

export interface LinkOp {
  kind: 'link'
  line: number
  source: string
  /** Dotted field path on the source, when the line named one. */
  sourceField?: string
  target: string
  targetField?: string
}

export type EditOp = NodeOp | LinkOp

/**
 * - `unrecognized`  — the line began with a verb (or sat among lines that did) and could
 *   not be read. Reported by number so the user can look at it.
 * - `maybeTruncated` — same, but it is the LAST line of the paste. Every line succeeds or
 *   fails alone, so a cut-off answer can only damage this one, and "continue from line N
 *   and paste the rest" is a real way out (design §5).
 * - `duplicateNodeId` — a second `node` line reused an id that a previous line already
 *   defined WITH fields. Left unblocked this is an upsert that silently merges two tables
 *   the model meant to be different (design §8(b)2).
 */
export type BadLineReason = 'unrecognized' | 'maybeTruncated' | 'duplicateNodeId'

export interface BadLine {
  line: number
  reason: BadLineReason
  /** The offending text, so the summary can quote it back. */
  text: string
}

/**
 * A list of edits, and the lines that were not edits. ⛔ Deliberately NOT a graph: there
 * is no `nodes`/`pipes` here and no function that turns this back into text.
 */
export interface EditPlan {
  ops: EditOp[]
  badLines: BadLine[]
}

/**
 * Normalise the punctuation a chat model actually emits.
 *
 * Full-width `：，` come from any model answering a Chinese prompt on a Chinese IME
 * keyboard layout; `→ => -->` are the arrows people and models write when `->` was not
 * what came to hand. ⚠️ This rewrites full-width colons and commas inside display names
 * too — a node literally named "订单:已付" loses its colon to the field separator. The
 * trade is deliberate: a name with a colon in it is rare, a full-width colon in the
 * separator position is not.
 */
function normalize(line: string): string {
  return line
    .replace(/[：]/g, ':')
    .replace(/[，、]/g, ',')
    .replace(/[．]/g, '.')
    .replace(/(?:→|⟶|=>|-->|—>|->)/g, '->')
}

/** Split a dotted field reference into its path. Empty segments make it invalid. */
function toPath(raw: string): string[] | null {
  const parts = raw.split('.').map((p) => p.trim())
  if (parts.length === 0 || parts.some((p) => p === '')) return null
  return parts
}

function parseFields(raw: string): DslField[] {
  const fields: DslField[] = []
  for (const entry of raw.split(',')) {
    const tokens = entry.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const path = toPath(tokens[0])
    if (!path) continue
    // Everything after the name is the type, joined back together: "created_at timestamp
    // with tz" keeps its type intact, and a type this editor has never heard of is kept
    // verbatim rather than corrected (design §4: such hallucinations are benign).
    fields.push({
      name: path[path.length - 1],
      path,
      type: tokens.length > 1 ? tokens.slice(1).join(' ') : 'string',
    })
  }
  return fields
}

/** `node <id> [display name][: field type, ...]` */
function parseNodeLine(body: string, line: number): NodeOp | null {
  // The FIRST colon splits the head from the fields — a display name containing a colon
  // loses its tail to the field list. Named in graphToPrompt's teaching text as "the
  // ': fields' part is optional" so the model has no reason to write one.
  const colon = body.indexOf(':')
  const head = (colon === -1 ? body : body.slice(0, colon)).trim()
  const fieldsPart = colon === -1 ? '' : body.slice(colon + 1)

  const tokens = head.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const id = tokens[0]
  if (id.includes('.')) return null
  const name = tokens.slice(1).join(' ')
  return { kind: 'node', line, id, ...(name ? { name } : {}), fields: parseFields(fieldsPart) }
}

/** `link <a>[.<field>] -> <b>[.<field>]` */
function parseLinkLine(body: string, line: number): LinkOp | null {
  const parts = body.split('->')
  if (parts.length !== 2) return null
  const ends = parts.map((p) => p.trim())
  if (ends.some((e) => e === '')) return null

  const split = (end: string) => {
    const dot = end.indexOf('.')
    // Node ids are single words; anything after the first dot is the field path, so
    // `orders.address.city` is the node `orders` and its nested field `address.city`.
    if (dot === -1) return { id: end, field: undefined }
    const id = end.slice(0, dot).trim()
    const field = end.slice(dot + 1).trim()
    if (!id || !field) return null
    return { id, field }
  }
  const source = split(ends[0])
  const target = split(ends[1])
  if (!source || !target) return null
  if (/\s/.test(source.id) || /\s/.test(target.id)) return null

  return {
    kind: 'link',
    line,
    source: source.id,
    ...(source.field ? { sourceField: source.field } : {}),
    target: target.id,
    ...(target.field ? { targetField: target.field } : {}),
  }
}

/**
 * Parse pasted DSL text into an EditPlan. Never throws: a paste entry point has a user to
 * tell, and "that wasn't a diagram edit" is an ordinary outcome.
 *
 * Every line succeeds or fails ALONE (design §5). That is the whole anti-truncation
 * story: a cut-off answer damages only its last line, and the continuation a chat writes
 * next is itself valid input — which half a JSON object never is.
 *
 * MEASURED LIMIT, not covered by the design's claim. "The last line is flagged
 * maybeTruncated" holds only when the cut leaves that line UNPARSEABLE. A cut can also
 * land where the line is still valid, and then the damage is quiet. Real model output
 * (563 bytes, 2026-09-01), cut three ways:
 *
 *   at 420 bytes -> `link users.id`            -> flagged maybeTruncated. As designed.
 *   at 500 bytes -> `link orders.id -> o`      -> a valid link to a node named "o", which
 *                                                 does not exist; reported as a dropped
 *                                                 connection naming "o". Honest, but it
 *                                                 does not say "truncated".
 *   at 300 bytes -> `node order_items 訂單項: id uuid, order_id uuid, product_id `
 *                                              -> a VALID node line. It lands with
 *                                                 product_id typed `string` (the default)
 *                                                 instead of uuid, and without the
 *                                                 quantity field. Nothing is flagged.
 *
 * No guard is attempted, deliberately. Every signal that would catch the third case —
 * "the last field has no type", "the text has no trailing newline" — is also true of
 * perfectly good input the grammar allows, so the guard would cry wolf on correct pastes
 * to catch a case whose damage is visible on the canvas anyway (a node that is short a
 * field). Recorded here rather than fixed, so the next person measures instead of
 * assuming the design's sentence covers it.
 */
export function parseDsl(raw: string): EditPlan {
  const ops: EditOp[] = []
  const badLines: BadLine[] = []
  /**
   * Lines that never even began with a verb. Held back rather than reported, because
   * their meaning depends on the whole paste: among real commands they are stray text
   * worth naming, but a payload of nothing BUT prose is a refusal or the wrong
   * clipboard — that is `noJson`, and reporting each of its sentences as a broken
   * command would send the user looking for a typo that is not there.
   */
  const prose: BadLine[] = []
  /** Node ids this paste has already defined WITH fields — see `duplicateNodeId`. */
  const definedWithFields = new Set<string>()

  const lines = raw.split(/\r?\n/)
  // The index of the last line carrying anything at all: only that one can be a casualty
  // of truncation.
  let lastContentIndex = -1
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() !== '') lastContentIndex = i

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i]
    const trimmed = original.trim()
    const lineNo = i + 1
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) continue

    const line = normalize(trimmed)
    const verbMatch = line.match(/^(node|link)\b\s*/i)
    if (!verbMatch) {
      prose.push({ line: lineNo, reason: 'unrecognized', text: trimmed })
      continue
    }

    const verb = verbMatch[1].toLowerCase()
    const body = line.slice(verbMatch[0].length)
    const op = verb === 'node' ? parseNodeLine(body, lineNo) : parseLinkLine(body, lineNo)

    if (!op) {
      badLines.push({
        line: lineNo,
        reason: i === lastContentIndex ? 'maybeTruncated' : 'unrecognized',
        text: trimmed,
      })
      continue
    }

    if (op.kind === 'node') {
      // ⚠️ design §8(b)2, blocked at the cheapest place it can be blocked. Two `node`
      // lines that both carry fields under one id is what "the model gave two new tables
      // the same id" looks like; upserting them would silently produce one table with
      // both halves' fields and no trace. Naming the second line costs the rare user who
      // deliberately split one node across two lines a Ctrl+Z, and costs the common case
      // nothing — a second line WITHOUT fields (a rename) is still merged.
      if (op.fields.length > 0) {
        if (definedWithFields.has(op.id)) {
          badLines.push({ line: lineNo, reason: 'duplicateNodeId', text: trimmed })
          continue
        }
        definedWithFields.add(op.id)
      }
    }
    ops.push(op)
  }

  // Stray prose only counts as a broken line when this paste is otherwise real DSL.
  if (ops.length > 0 || badLines.length > 0) badLines.push(...prose)
  badLines.sort((a, b) => a.line - b.line)

  return { ops, badLines }
}

/**
 * Is this text deliberately DSL, as opposed to prose that happens to start with the word
 * "node"? Used ONLY by the canvas Ctrl+V probe, where the alternative reading is "the
 * user wanted to keep this text as a note" and getting it wrong turns a paragraph into a
 * diagram. Deliberately stricter than the import buttons, where the intent is not in
 * question:
 *
 *   - every non-comment line must parse (no stray prose, no broken lines), and
 *   - the paste must be more than a single bare `node <id> <name>` line — either several
 *     commands, or one that carries fields or is a link.
 *
 * "node modules are broken again" is a valid one-line `node` op and would otherwise
 * become a node; under this rule it stays the note the user meant.
 */
export function looksLikeDslPayload(plan: EditPlan): boolean {
  if (plan.ops.length === 0 || plan.badLines.length > 0) return false
  if (plan.ops.length > 1) return true
  const only = plan.ops[0]
  return only.kind === 'link' || only.fields.length > 0
}
