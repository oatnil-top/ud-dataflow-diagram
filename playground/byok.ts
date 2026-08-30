// The stored value IS one object. Not an array, not a map. A second saved connection
// requires changing this type (a reviewable act); pushing into an array is not.
export type WireShape = 'anthropic' | 'openai-compatible'
export interface ByokConnection { shape: WireShape; endpoint: string; model: string; key: string }
export const STORAGE_KEY = 'ud-dataflow-diagram/byok'          // ByokConnection | null, never ByokConnection[]
export const DOC_KEY = 'ud-dataflow-diagram/doc'               // the diagram itself, same local-first idea

// Defaults mirror ud's useAIStream.ts:35-47; a stale model id here is a support ticket, so they
// are constants a reader can find, and the form lets the visitor overwrite them.
export const DEFAULTS: Record<WireShape, { endpoint: string; model: string }> = {
  anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  'openai-compatible': { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
}

export function load(): ByokConnection | null {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? (JSON.parse(s) as ByokConnection) : null } catch { return null }
}
export function save(c: ByokConnection | null) {
  if (c) localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  else localStorage.removeItem(STORAGE_KEY)
}

// Endpoint suffix rules are ud's (useAIStream.ts:60-74): append the path only if it is not there.
function url(c: ByokConnection) {
  const base = c.endpoint.replace(/\/+$/, '')
  if (c.shape === 'anthropic') return base.endsWith('/v1/messages') ? base : `${base}/v1/messages`
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

export class EndpointError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// Non-streaming on purpose: ~40 lines per shape instead of ud's 602-line streaming hook.
export async function generate(c: ByokConnection, system: string, input: string, signal?: AbortSignal): Promise<string> {
  const anthropic = c.shape === 'anthropic'
  const headers: Record<string, string> = anthropic
    ? { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'Content-Type': 'application/json' }  // useAIStream.ts:445-450
    : { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' }                                                                          // useAIStream.ts:453-456
  const body = anthropic
    ? { model: c.model, max_tokens: 4096, system, messages: [{ role: 'user', content: input }] }
    : { model: c.model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] }
  let res: Response
  try {
    res = await fetch(url(c), { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new EndpointError(0, String(e))   // status 0 = no response at all → errors.ts noResponse
  }
  if (!res.ok) throw new EndpointError(res.status, await res.text())
  const j = await res.json()
  return anthropic ? (j.content?.[0]?.text ?? '') : (j.choices?.[0]?.message?.content ?? '')
}
