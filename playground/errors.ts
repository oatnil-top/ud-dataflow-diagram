import type { EndpointError } from './byok'

/**
 * What to say when the visitor's own endpoint refuses or never answers.
 *
 * The playground has no server between the browser and the provider, so every one of these
 * is on the endpoint's side — the text says so rather than implying the page is broken.
 */
export function describe(e: EndpointError, endpoint: string, origin: string): { title: string; body: string; actions: ('retry' | 'official')[] } {
  if (e.status === 401 || e.status === 403) return { title: 'The endpoint rejected the key.', body: 'Check the key in the panel; nothing else changed.', actions: ['retry'] }
  if (e.status === 404) return { title: 'The endpoint has no such path or model.', body: `Check the endpoint address and the model name — ${endpoint}.`, actions: ['retry'] }
  if (e.status === 429 || e.status >= 500) return { title: 'The endpoint answered with an error of its own.', body: `HTTP ${e.status} from ${endpoint}. Nothing here is broken; try again in a moment.`, actions: ['retry'] }
  // status 0: no response — the browser deliberately does not say whether that was CORS or unreachable
  return {
    title: `${endpoint} didn't respond to this browser.`,
    body: `Two common reasons: it isn't running or the address is wrong, or it's running but hasn't allowed requests from this page (${origin}). This playground has no server in between, so both are on the endpoint's side — nothing here is broken.\n\nCheck which one: open ${endpoint} in a new tab. If it loads, it's the allowed-origins setting — Ollama: start it with OLLAMA_ORIGINS=${origin}; self-hosted: add that origin to its CORS list. If it doesn't load, start it or fix the address.\n\nThe official Anthropic / OpenAI endpoints and OpenRouter work from browsers as-is.`,
    actions: ['retry', 'official'],
  }
}
