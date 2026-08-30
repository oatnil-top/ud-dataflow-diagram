Run once per clone before anything else: `git config core.hooksPath .githooks` — the pre-push secret gate lives there and is off until you do.

# ud-dataflow-diagram

The diagram editor from UnDercontrol, published under MIT. UnDercontrol itself is proprietary — describe *this repository* as open source, never the product.

## Never in this repo
`.env*`, `.dev.vars`, `.wrangler/`, `*.pem`, `*.key`, any API key or token (provider, Cloudflare, GitHub, R2), Cloudflare account ids, `tmp/`, `.claude/settings.local.json`, and **any data from a UnDercontrol production instance** — including the owner's own diagrams (`acfa19b9`, `78e35e70`). Fixtures and sample diagrams are fabricated, always. Scanners do not catch content-level secrets; this rule does.

## If a secret reaches this public repository
**Treat it as already leaked.** Deleting the commit or force-pushing does not un-leak it: GitHub keeps the object reachable and crawlers pull public pushes within seconds. In order: (1) **rotate the credential now** at its provider — the only step that actually closes the exposure; (2) then purge it from history and force-push; (3) record what leaked, when, and the rotation in a task on the UD board. Never skip (1) because (2) "looks clean".

## Gates
- `.githooks/pre-push` runs gitleaks over the commits about to be pushed and refuses on a finding. CI runs gitleaks too, but by then the push is public — CI is discovery, the hook is the gate.
- Every shipped sample/example is opened by the package and every `node.type` must be a key of `registry.nodeTypes` (an unknown type renders as a blank box with no error). The playground's landing sample is checked the same way before each release of the playground.
