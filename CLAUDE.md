Run once per clone before anything else: `git config core.hooksPath .githooks` — the pre-push secret gate lives there and is off until you do.

# ud-dataflow-diagram

The diagram editor from UnDercontrol, published under MIT. UnDercontrol itself is proprietary — describe *this repository* as open source, never the product.

## Never in this repo
`.env*`, `.dev.vars`, `.wrangler/`, `*.pem`, `*.key`, any API key or token (provider, Cloudflare, GitHub, R2), Cloudflare account ids, `tmp/`, `.claude/settings.local.json`, and **any data from a UnDercontrol production instance** — including the owner's own diagrams (`acfa19b9`, `78e35e70`). Fixtures and sample diagrams are fabricated, always. Scanners do not catch content-level secrets; this rule does. Analytics or tracking scripts of any kind — README §Your key promises a page that talks only to the visitor's provider.

## If a secret reaches this public repository
**Treat it as already leaked.** Deleting the commit or force-pushing does not un-leak it: GitHub keeps the object reachable and crawlers pull public pushes within seconds. In order: (1) **rotate the credential now** at its provider — the only step that actually closes the exposure; (2) then purge it from history and force-push; (3) record what leaked, when, and the rotation in a task on the UD board. Never skip (1) because (2) "looks clean".

## Gates
- `.githooks/pre-push` runs gitleaks over the commits about to be pushed and refuses on a finding. CI runs gitleaks too, but by then the push is public — CI is discovery, the hook is the gate.
- Every shipped sample/example is opened by the package and every `node.type` must be a key of `registry.nodeTypes` (an unknown type renders as a blank box with no error). The playground's landing sample is checked the same way before each release of the playground.
- `main` is the production branch of Workers Builds: every push to it is live at https://ud-dataflow-diagram.lintao-amons.workers.dev within minutes, with no human step in between. Run `npm test && npm run build:playground` before pushing; the pre-push hook only checks for secrets, not for a broken build.

### What this gate is actually proven against
It has been exercised end-to-end against **one** rule: `anthropic-api-key`. A push carrying a
fabricated `sk-ant-` key was refused, the same push passed once the key was removed, and the same
key-bearing push passed again with the hook disabled — so the refusal is demonstrably the hook's
doing. **OpenAI keys, GitHub tokens, Cloudflare and R2 credentials are not verified here.** They
are covered by gitleaks' default rule set on paper only; nobody has watched this gate stop one.
Know which of those you are relying on before you push.

### Writing a fake key to test the gate
gitleaks' default rules match on **prefix, exact length and trailing literal — not entropy**. The
`anthropic-api-key` rule in 8.30.1 is:

    \b(sk-ant-api03-[a-zA-Z0-9_\-]{93}AA)(?:[\x60'"\s;]|\\[nr]|$)

— 93 characters and a literal `AA`. A shorter fabricated key is not matched **no matter how random
it looks**; a high-entropy 60-char and a high-entropy 95-char variant were both measured as `no
leaks found`. The gate then goes **green on your fake key**, and that green only means "this
particular string is not caught" — which is trivially true and says nothing about whether a real
key would be caught.

So: **confirm your fixture is detected on its own before you use it to test the hook** —
`gitleaks dir --no-banner --redact --exit-code 1 -c .gitleaks.toml <file>` must report
`leaks found: 1`. A bad fixture is how a working gate gets declared useless and switched off.

The gate can also fail the other way, closed: if it refuses a push with `FTL Failed to load config`
instead of a `leaks found:` line, gitleaks never scanned and **every** push is being refused,
including clean ones. Read the output, not just the exit code — a broken gate and a real catch
both exit non-zero. A clean push that is also refused is the tell.
