# ud-dataflow-diagram

**[Open the editor →](https://ud-dataflow-diagram.lintao-amons.workers.dev)** — no sign-up; the diagram and your key never leave the browser.

A React editor for dataflow and architecture diagrams, built around one loop: an agent writes the graph as JSON with **no coordinates**, the editor lays it out, and you fix it by hand. Groups, cloud icons (AWS / GCP / Azure / Kubernetes / generic), notes, shapes, and JSON nodes with **field-level edges**. Export to PNG (the graph is embedded in the file, so the picture *is* the document), draw.io, or plain text.

## Try it

1. Open the editor — a sample diagram is already on the canvas.
2. Click **Copy prompt**, paste it into any LLM together with a description of your system, and paste the JSON it answers with back into the editor. That is the whole loop; no key is required.
3. Optional: the **AI** panel calls a model straight from the browser with your own key — see [Your key](#your-key).

## Built for UnDercontrol

This editor is the diagram feature of [UnDercontrol](https://oatnil.com/?ref=github-readme), a task and knowledge workspace where agents draw these diagrams for you. The editor is open source under MIT; UnDercontrol itself is a proprietary product.

## Use it in your app

Not on npm yet. Until then, add the repository as a git dependency or vendor `src/`. Peer dependencies: `react` 19, `react-dom` 19, `@xyflow/react` 12, `zustand` 5, `i18next`, `react-i18next`, `lucide-react`.

```tsx
import { DataflowEditor, DataflowHostContext, registerDataflowMessages } from '@oatnil/ud-dataflow-diagram'

registerDataflowMessages(i18n)            // adds the editor's en/zh strings to your i18next instance

<DataflowHostContext.Provider value={{ /* resources, ai, notify — all optional, see src/host.ts */ }}>
  <DataflowEditor initialContent={json} onSaveGraph={async (g) => save(g)} onClose={() => back()} />
</DataflowHostContext.Provider>
```

Styling is Tailwind v4: the host's CSS must `@source` this package's `src/` and define the `--background` / `--foreground` / `--primary` … variables (see `playground/index.css` for the full set).

## Your key

The AI panel is optional. If you use it:

- Stored in this browser's `localStorage` only. It stays after you close the page — click "Forget key" to remove it.
- Your key is sent only to the endpoint you typed in the panel. We never receive it.
- This playground is a static site. There is no backend that could receive your key — check the Network tab: the only requests leave for your provider.

Anthropic endpoints are called with the header Anthropic requires for browser use; OpenAI-compatible endpoints get a `Bearer` token. A self-hosted endpoint (Ollama and the like) has to allow this page's origin — the panel's error text tells you what to set.

## Format

The graph is JSON: `nodes[]` whose `type` is one of `json`, `process`, `note`, `resource`, `group`, `icon`, `shape`, and `pipes[]` of type `dataflow` (`edges` is accepted as an alias when reading). The prompt behind **Copy prompt** (`src/utils/graphToPrompt.ts`) is the reference for what an agent should write. JSON nodes carry `fields[]`, and a pipe may connect two fields — that is the "dataflow" in the name. `${a.b}` in process templates is string substitution, not evaluation (`src/utils/templateEval.ts`).

## Contributing

Issues are open. Pull requests are not accepted in this first release — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE). The UnDercontrol name and logo belong to oatnil and are not part of the MIT grant.
