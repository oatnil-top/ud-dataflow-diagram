/**
 * URL sanitization for node links.
 *
 * Node `data.url` values round-trip through imported .dataflow.json/.dataflow.png
 * files, so they are attacker-controlled when a diagram is shared. Only allow
 * schemes that cannot execute script in the app origin.
 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Returns the URL if it uses a safe scheme, otherwise undefined.
 * An <a> rendered with href={undefined} degrades to inert text.
 */
export function sanitizeNodeUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}
