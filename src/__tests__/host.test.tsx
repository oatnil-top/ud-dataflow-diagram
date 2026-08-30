import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import ResourceNode from '../components/nodes/ResourceNode'
import AIGeneratePanel from '../components/panels/AIGeneratePanel'
import { FlowStoreContext } from '../store/flowStoreContext'
import { createFlowStore } from '../store/flowStore'
import { DataflowHostContext, type DataflowHost, type ResourceResolution } from '../host'
import { DiagramContext } from '../diagramContext'
import { extractJson } from '../utils/extractJson'

/**
 * The host boundary (../host.ts) is what lets this directory be lifted out of ud.
 *
 * These tests exist because the mount path they cover has no other coverage: the seam was
 * introduced by replacing direct imports of the app, and `tsc` can only count the
 * replacements that were missed, never say that an absent member still renders something
 * sensible. Each case here is one row of the "absent ⇒ …" table on the members themselves.
 *
 * The fakes are built so they can FAIL the way the real dependency fails — a resolve that
 * only ever succeeds would prove that a forbidden image renders, which is the one thing
 * worth proving.
 */

function renderNode(host: DataflowHost, data: Record<string, unknown> = {}, diagram = {}) {
  const store = createFlowStore()
  return render(
    <DiagramContext.Provider value={diagram}>
    <DataflowHostContext.Provider value={host}>
      <FlowStoreContext.Provider value={store}>
        <ReactFlowProvider>
          <ResourceNode
            id="n1"
            type="resource"
            selected={false}
            zIndex={0}
            isConnectable
            positionAbsoluteX={0}
            positionAbsoluteY={0}
            dragging={false}
            draggable
            selectable
            deletable
            data={{ name: 'pic', resourceId: 'r1', mimeType: 'image/png', ...data } as never}
          />
        </ReactFlowProvider>
      </FlowStoreContext.Provider>
    </DataflowHostContext.Provider>
    </DiagramContext.Provider>,
  )
}

const okHost = (resolution: ResourceResolution): DataflowHost => ({
  resources: { resolve: () => Promise.resolve(resolution) },
})

describe('resource node without a host', () => {
  it('renders a stated failure, not a blank node, and offers no upload', async () => {
    renderNode({})
    // `unavailable` is what a host that cannot resolve anything reports.
    await waitFor(() => expect(screen.getByText('resources.dataflow.node.imageDeleted')).toBeTruthy())
    expect(screen.queryByTitle('resources.dataflow.node.replaceFile')).toBeNull()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('shows no drop zone when the host cannot upload', () => {
    renderNode({ resources: { resolve: () => Promise.resolve({ status: 'unavailable' as const }) } }, { resourceId: undefined })
    expect(screen.queryByText('resources.dataflow.node.dropOrPaste')).toBeNull()
  })

  it('shows the drop zone as soon as the host can upload', () => {
    renderNode(
      {
        resources: {
          resolve: () => Promise.resolve({ status: 'unavailable' as const }),
          upload: async () => ({ resourceId: 'new' }),
        },
      },
      { resourceId: undefined },
    )
    expect(screen.getByText('resources.dataflow.node.dropOrPaste')).toBeTruthy()
  })
})

describe('a fake host must be able to fail the way the real one fails', () => {
  it('renders forbidden distinctly from deleted — not one shared empty box', async () => {
    renderNode(okHost({ status: 'forbidden' }))
    await waitFor(() =>
      expect(screen.getByText('resources.dataflow.node.imageUnavailable')).toBeTruthy(),
    )
    // ⛔ The whole point of keeping the resolution whole: "not yours" must not read as "gone".
    expect(screen.queryByText('resources.dataflow.node.imageDeleted')).toBeNull()
  })

  it('offers a retry only for a transport failure', async () => {
    const { unmount } = renderNode(okHost({ status: 'error' }))
    await waitFor(() => expect(screen.getByText('common.retry')).toBeTruthy())
    unmount()

    renderNode(okHost({ status: 'unavailable' }))
    await waitFor(() => expect(screen.getByText('resources.dataflow.node.imageDeleted')).toBeTruthy())
    expect(screen.queryByText('common.retry')).toBeNull()
  })

  it('renders the image when the host resolves one', async () => {
    renderNode(okHost({ status: 'ok', url: 'https://example.test/pic.png' }))
    await waitFor(() => {
      const img = document.querySelector('img')
      expect(img?.getAttribute('src')).toBe('https://example.test/pic.png')
    })
  })

  // ⛔ The scope is the authorization. A node that resolves without it falls back to the
  // generic endpoint, which authorizes against the IMAGE — so a diagram shared with someone
  // who was never given the image goes from showing the picture to showing "deleted", while
  // the diagram's own owner sees nothing wrong. `tsc` cannot catch that: the parameter is
  // still there, it just carries the wrong thing.
  it('passes the diagram scope through to resolve', async () => {
    const resolve = vi.fn().mockResolvedValue({ status: 'ok', url: 'u' } as ResourceResolution)
    renderNode({ resources: { resolve } }, {}, { dataflowId: 'diagram-42', historyId: 'v7' })
    await waitFor(() => expect(resolve).toHaveBeenCalled())
    expect(resolve).toHaveBeenCalledWith('r1', { dataflowId: 'diagram-42', historyId: 'v7' })
  })
})

describe('AI panel', () => {
  const renderPanel = (host: DataflowHost) => {
    const store = createFlowStore()
    return render(
      <DataflowHostContext.Provider value={host}>
        <FlowStoreContext.Provider value={store}>
          <AIGeneratePanel isOpen onClose={() => {}} />
        </FlowStoreContext.Provider>
      </DataflowHostContext.Provider>,
    )
  }

  it('does not mount at all without an `ai` member', () => {
    const { container } = renderPanel({})
    expect(container.firstChild).toBeNull()
  })

  it('renders the settings slot only, with no input, when the host has no `generate`', () => {
    renderPanel({ ai: { settings: <div>configure me</div> } })
    expect(screen.getByText('configure me')).toBeTruthy()
    expect(document.querySelector('textarea')).toBeNull()
    expect(screen.queryByText('resources.dataflow.panel.generate')).toBeNull()
  })

  it('renders the input and the generate action once `generate` exists', () => {
    renderPanel({ ai: { generate: async () => '{}', settings: <div>picker</div> } })
    expect(screen.getByText('picker')).toBeTruthy()
    expect(document.querySelector('textarea')).toBeTruthy()
    expect(screen.getByText('resources.dataflow.panel.generate')).toBeTruthy()
  })
})

describe('extractJson', () => {
  it('reads a fenced block', () => {
    expect(extractJson('```json\n{"nodes":[]}\n```')).toEqual({ nodes: [] })
  })

  it('reads an object with prose on both sides', () => {
    expect(extractJson('Sure! Here you go:\n{"nodes":[1]}\nHope that helps.')).toEqual({ nodes: [1] })
  })

  it('returns null rather than throwing when there is no JSON', () => {
    expect(extractJson('I cannot help with that.')).toBeNull()
    expect(extractJson('{ not json at all')).toBeNull()
    expect(extractJson('')).toBeNull()
  })
})
