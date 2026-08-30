import { DEFAULTS, type ByokConnection, type WireShape } from './byok'

/**
 * The `host.ai.settings` slot (host.ts:79-84) for a playground: bring your own key.
 *
 * The three sentences below are the whole privacy claim of this page, and each one is
 * checkable by the reader on the spot — the second one echoes the live endpoint value
 * rather than naming a provider, because the value is what the key is actually sent to.
 */
export function ByokForm({ value, onChange }: { value: ByokConnection | null; onChange: (c: ByokConnection | null) => void }) {
  const conn: ByokConnection = value ?? { shape: 'anthropic', ...DEFAULTS.anthropic, key: '' }

  const set = (patch: Partial<ByokConnection>) => onChange({ ...conn, ...patch })
  const setShape = (shape: WireShape) => onChange({ shape, ...DEFAULTS[shape], key: conn.key })

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        {(['anthropic', 'openai-compatible'] as WireShape[]).map((s) => (
          <label key={s} className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="byok-shape" checked={conn.shape === s} onChange={() => setShape(s)} />
            <span>{s === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'}</span>
          </label>
        ))}
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Endpoint</span>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={conn.endpoint}
          onChange={(e) => set({ endpoint: e.target.value })}
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted-foreground">Model</span>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={conn.model}
          onChange={(e) => set({ model: e.target.value })}
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted-foreground">Key</span>
        <input
          type="password"
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          value={conn.key}
          onChange={(e) => set({ key: e.target.value })}
          placeholder="sk-…"
        />
      </label>

      {/* [S1] */}
      <p className="text-[13px] text-muted-foreground">
        Stored in this browser's <code>localStorage</code> only. It stays after you close the page — click "Forget key" to remove it.
      </p>
      {/* [S2] — the live endpoint value, so the sentence is checkable against the field above */}
      <p className="text-[13px] text-muted-foreground">
        Your key is sent only to the endpoint you typed above — <code>{conn.endpoint}</code>. We never receive it.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!conn.key.trim()}
          onClick={() => onChange(conn)}
        >
          Save
        </button>
        {value && (
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => onChange(null)}>
            Forget key
          </button>
        )}
      </div>

      {/* [S3] */}
      <p className="text-[13px] text-muted-foreground">
        This playground is a static site. There is no backend that could receive your key — check the Network tab: the only requests leave for your provider.
      </p>
    </div>
  )
}
