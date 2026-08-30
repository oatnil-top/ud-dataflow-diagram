/**
 * Pull a JSON object out of raw model text.
 *
 * The host hands back whatever the model said (host.ts `ai.generate`), which in practice is
 * the object wrapped in a ``` fence, or with a sentence of explanation on either side. This
 * lives in the package because the diagram is what knows the answer is supposed to be a
 * graph — the host only knows how to talk to a model.
 *
 * Returns null rather than throwing: the caller has a user to tell, and "the model did not
 * return a diagram" is an ordinary outcome, not an exception.
 */
export function extractJson(raw: string): unknown | null {
  if (!raw) return null

  // Strip a fenced block first — ```json … ``` — so a fence containing prose after it
  // cannot drag the closing brace search past the object.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}
