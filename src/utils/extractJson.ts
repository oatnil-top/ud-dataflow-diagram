/**
 * Pull a JSON object out of raw model text.
 *
 * Two callers, one job. The in-app AI panel gets whatever the host's model said
 * (host.ts `ai.generate`); the paste entry points get whatever the user copied out of
 * some chat window they own and we do not. In practice both are the object wrapped in a
 * ``` fence, or with a sentence of explanation on either side — measured, not assumed:
 * every one of six real runs recorded on design fb629b6a came back fenced, including the
 * runs whose prompt said not to fence.
 *
 * This lives in the package because the diagram is what knows the answer is supposed to
 * be a graph — the host only knows how to talk to a model.
 *
 * `extractJson` returns null rather than throwing: the caller has a user to tell, and
 * "the model did not return a diagram" is an ordinary outcome, not an exception.
 * `extractGraphJson` is the same walk with the reason kept, because a paste entry point
 * has to say WHICH thing went wrong — "it got cut off" and "that wasn't a diagram" send
 * the user to two different next steps (§6 of the design: no silent nothing-happened).
 */

/**
 * Why raw text yielded no JSON object.
 *
 * - `truncated` — an object started and never finished (unclosed fence, or braces that
 *   never balance). The user's chat stopped mid-answer or they copied half of it.
 * - `noJson`    — no `{` at all: a refusal, an apology, or the wrong clipboard.
 * - `malformed` — an object is there and complete, but neither JSON.parse nor the
 *   repair pass could read it.
 */
export type ExtractFailure = 'truncated' | 'noJson' | 'malformed'

export type ExtractResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: ExtractFailure }

/**
 * Strip the fence and surrounding prose a chat model wraps its answer in.
 *
 * Promoted to a shared first layer when a second paste format arrived: the dispatcher in
 * store/pasteImport.ts has to look at the first real character to decide JSON vs DSL, and
 * a ```json fence would otherwise make every answer look like neither.
 *
 * Deliberately NOT used by extractGraphJson itself. That function does its own fence walk
 * and keeps it, because its walk is entangled with the truncation verdict (an opened
 * fence that never closed is how "cut off" is recognised) and the JSON branch must behave
 * byte for byte as it did before the dispatcher existed.
 */
export function unwrapModelText(raw: string): string {
  const fenced = raw.match(/```(?:[a-z]*)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  // An opened-but-never-closed fence is a truncated answer; keep what follows the opener
  // so the branch that knows how to report truncation gets to see it.
  const opener = raw.match(/```(?:[a-z]*)?[^\S\n]*\n?/i)
  if (opener) return raw.slice(opener.index! + opener[0].length).trim()
  return raw.trim()
}

export function extractJson(raw: string): unknown | null {
  const result = extractGraphJson(raw)
  return result.ok ? result.value : null
}

export function extractGraphJson(raw: string): ExtractResult {
  if (!raw || !raw.trim()) return { ok: false, reason: 'noJson' }

  // Strip a fenced block first — ```json … ``` — so a fence containing prose after it
  // cannot drag the closing brace search past the object.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const opened = /```/.test(raw)
  const body = fenced ? fenced[1] : raw

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1) return { ok: false, reason: opened ? 'truncated' : 'noJson' }
  if (end < start) return { ok: false, reason: 'truncated' }

  const slice = body.slice(start, end + 1)

  const direct = tryParse(slice)
  if (direct.ok) return direct

  // The repair pass runs only after a clean parse has already failed, and in two stages
  // so the safe half never has to carry the risk of the unsafe half. Stage one rewrites
  // punctuation only OUTSIDE string literals, so a Chinese node name containing a
  // full-width comma is never touched. Stage two rewrites curly quotes everywhere —
  // it has to, they are the broken delimiter — and can in principle alter text inside a
  // string, which is why it is last and only reached when everything else failed.
  const structural = tryParse(repairOutsideStrings(slice))
  if (structural.ok) return structural

  const desperate = tryParse(repairOutsideStrings(slice.replace(/[“”‘’]/g, '"')))
  if (desperate.ok) return desperate

  // Complete-looking text that still will not parse is malformed; text whose braces never
  // balance (or whose fence never closed) was cut off, and that distinction is the whole
  // point of this function — see ExtractFailure.
  if (!bracesBalance(slice) || (opened && !fenced)) return { ok: false, reason: 'truncated' }
  return { ok: false, reason: 'malformed' }
}

/**
 * Does this parsed value look like a graph someone meant to import?
 *
 * Used by the canvas Ctrl+V path, where the alternative reading is "the user wanted to
 * keep this text as a note". Deliberately narrow, in two accepted shapes — the two things
 * the copy-prompt asks a model to produce, and nothing wider:
 *
 *  1. a `nodes` array whose first entry carries BOTH `type` and `data`;
 *  2. a pure pipe delta — no nodes, and a `pipes`/`edges` array whose first entry carries
 *     string `source` and `target`. "Only add a connection" has no nodes to recognise it
 *     by, so without this the most natural paste of the most common delta becomes a note.
 *
 * A hand-written config, an API response, a package.json: none match. Neither do the
 * edge lists other tools write — GraphQL connections ({node, cursor}), ELK/dagre
 * ({sources, targets}) and Cytoscape ({data: {source, target}}) all miss shape 2, which
 * is why it insists on top-level strings. Any miss is one Ctrl+Z away (the import pushes
 * an undo snapshot) and the summary bar says what happened.
 */
export function looksLikeGraphPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const nodes = (value as { nodes?: unknown }).nodes
  if (Array.isArray(nodes) && nodes.length > 0) {
    const first = nodes[0]
    if (!first || typeof first !== 'object') return false
    const node = first as { type?: unknown; data?: unknown }
    return typeof node.type === 'string' && !!node.data && typeof node.data === 'object'
  }
  // Shape 2 — only reachable when there are no nodes at all, so a real graph whose first
  // node is malformed still gets rejected above rather than rescued by its edge list.
  if (nodes !== undefined && !Array.isArray(nodes)) return false
  const v = value as { pipes?: unknown; edges?: unknown }
  const pipes = Array.isArray(v.pipes) ? v.pipes : Array.isArray(v.edges) ? v.edges : null
  if (!pipes || pipes.length === 0) return false
  const first = pipes[0]
  if (!first || typeof first !== 'object') return false
  const pipe = first as { source?: unknown; target?: unknown }
  return typeof pipe.source === 'string' && typeof pipe.target === 'string'
}

// ---------------------------------------------------------------------------

function tryParse(text: string): ExtractResult {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, reason: 'malformed' }
  }
}

/** Walk the text once, tracking whether we are inside an ASCII-quoted string. */
function scan(text: string, onChar: (ch: string, inString: boolean, i: number) => void): void {
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      onChar(ch, true, i)
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      onChar(ch, false, i)
      continue
    }
    onChar(ch, false, i)
  }
}

/** Braces and brackets outside strings all close. An unbalanced tail means truncation. */
function bracesBalance(text: string): boolean {
  let depth = 0
  let negative = false
  scan(text, (ch, inString) => {
    if (inString) return
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth < 0) negative = true
    }
  })
  return depth === 0 && !negative
}

/** Full-width punctuation and trailing commas, rewritten only outside string literals. */
function repairOutsideStrings(text: string): string {
  const out: string[] = []
  scan(text, (ch, inString) => {
    if (inString) {
      out.push(ch)
      return
    }
    // A closer outside a string ends a list/object: drop the dangling comma behind it,
    // whitespace and all. Done here rather than with a regex over the finished text
    // because `{"note": "a, }"}` puts a comma-space-brace sequence INSIDE a string, and
    // a regex cannot tell that one from a real trailing comma.
    if (ch === '}' || ch === ']') {
      let i = out.length - 1
      while (i >= 0 && /\s/.test(out[i])) i--
      if (i >= 0 && out[i] === ',') out.splice(i, out.length - i)
    }
    if (ch === '，') out.push(',')
    else if (ch === '：') out.push(':')
    else if (ch === '（') out.push('(')
    else if (ch === '）') out.push(')')
    else out.push(ch)
  })
  return out.join('')
}
