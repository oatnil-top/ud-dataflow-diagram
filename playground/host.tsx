import { useMemo, useState } from 'react'
import type { DataflowHost } from '@oatnil/ud-dataflow-diagram'
import { ByokForm } from './ByokForm'
import { EndpointError, generate, load, save, DEFAULTS, type ByokConnection } from './byok'
import { describe } from './errors'

export interface Status { kind: 'info' | 'error'; title: string; body?: string; official?: boolean }

/**
 * The whole host surface for a page with nothing behind it.
 *
 * `resources` is absent on purpose (host.ts:40): every resource node renders `unavailable`
 * and no upload affordance exists. The playground has nowhere to keep a file, and a node
 * that could never be filled is worse than one that says so.
 */
export function usePlaygroundHost() {
  const [conn, setConn] = useState<ByokConnection | null>(load)
  const [status, setStatus] = useState<Status | null>(null)

  const update = (c: ByokConnection | null) => { save(c); setConn(c) }

  const host = useMemo<DataflowHost>(() => ({
    ai: {
      // host.ts:73-77 — absent `generate` while `ai` is present ⇒ the panel renders only
      // `settings`, which is exactly "no key yet, here is the form".
      generate: conn ? (system: string, input: string, signal?: AbortSignal) => generate(conn, system, input, signal) : undefined,
      settings: <ByokForm value={conn} onChange={update} />,
    },
    // AIGeneratePanel.tsx:88 hands the thrown error through as `detail`, so the endpoint's
    // own failure is described here rather than notified twice from inside `generate`.
    notify: (kind, message, detail) => {
      ;(kind === 'error' ? console.error : console.info)(message, detail ?? '')
      if (detail instanceof EndpointError) {
        const d = describe(detail, conn?.endpoint ?? '', location.origin)
        setStatus({ kind: 'error', title: d.title, body: d.body, official: d.actions.includes('official') })
      } else {
        setStatus({ kind, title: message, body: typeof detail === 'string' ? detail : undefined })
      }
    },
  }), [conn])

  // Only the action this page can actually carry out is offered. A "Retry" button here
  // would not reach the panel's awaited call — the message says to try again instead.
  const useOfficialEndpoint = () => {
    if (conn) update({ ...conn, ...DEFAULTS[conn.shape] })
    setStatus(null)
  }

  return { host, status, clearStatus: () => setStatus(null), useOfficialEndpoint }
}
