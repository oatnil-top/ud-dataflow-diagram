import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileJson, Download, Upload, Trash2, Play, Sparkles, MessageSquareText, BotMessageSquare, ClipboardCopy, Undo2, Redo2 } from 'lucide-react'
import { useNotify } from '../../host'
import { useFlowStore } from '../../store/flowStoreContext'
import { importPastedGraph, PASTE_FAILURE_KEYS } from '../../store/pasteImport'
import type { ViewportRect } from '../../store/editPlan'
import { DATAFLOW_COPY_PROMPT, buildGraphForEditing } from '../../utils/graphToPrompt'
import { graphToText } from '../../utils/graphToText'

// Example graph data to demonstrate the app
const exampleGraph = {
  nodes: [
    {
      id: 'node_1',
      type: 'json',
      position: { x: 100, y: 100 },
      data: {
        name: 'User Event',
        fields: [
          { name: 'userId', path: ['userId'], type: 'string', example: 'usr_123' },
          { name: 'event', path: ['event'], type: 'string', example: 'click' },
          { name: 'timestamp', path: ['timestamp'], type: 'number', example: 1706380800 },
          { name: 'metadata', path: ['metadata'], type: 'object', example: {}, children: [
            { name: 'page', path: ['metadata', 'page'], type: 'string', example: '/home' },
            { name: 'browser', path: ['metadata', 'browser'], type: 'string', example: 'Chrome' },
          ]},
        ],
      },
    },
    {
      id: 'node_2',
      type: 'json',
      position: { x: 500, y: 80 },
      data: {
        name: 'User Profile',
        fields: [
          { name: 'id', path: ['id'], type: 'string', example: 'usr_123' },
          { name: 'name', path: ['name'], type: 'string', example: 'Alice' },
          { name: 'email', path: ['email'], type: 'string', example: 'alice@example.com' },
          { name: 'plan', path: ['plan'], type: 'string', example: 'pro' },
        ],
      },
    },
    {
      id: 'node_3',
      type: 'json',
      position: { x: 500, y: 320 },
      data: {
        name: 'Analytics Output',
        fields: [
          { name: 'userId', path: ['userId'], type: 'string', example: 'usr_123' },
          { name: 'userName', path: ['userName'], type: 'string', example: 'Alice' },
          { name: 'event', path: ['event'], type: 'string', example: 'click' },
          { name: 'page', path: ['page'], type: 'string', example: '/home' },
        ],
      },
    },
  ],
  pipes: [
    { id: 'pipe_1', source: 'node_1', target: 'node_2', sourceHandle: 'output-userId', targetHandle: 'input-id' },
    { id: 'pipe_2', source: 'node_1', target: 'node_3', sourceHandle: 'output-userId', targetHandle: 'input-userId' },
    { id: 'pipe_3', source: 'node_1', target: 'node_3', sourceHandle: 'output-event', targetHandle: 'input-event' },
    { id: 'pipe_4', source: 'node_1', target: 'node_3', sourceHandle: 'output-metadata.page', targetHandle: 'input-page' },
    { id: 'pipe_5', source: 'node_2', target: 'node_3', sourceHandle: 'output-name', targetHandle: 'input-userName' },
  ],
}

interface ToolbarProps {
  onOpenJsonImport: () => void
  onAIGenerate?: () => void
  // Embed mode hides export/import/example buttons (they're handled by parent)
  embedMode?: boolean
  getViewportCenter?: () => { x: number; y: number }
  getViewportRect?: () => ViewportRect
}

export default function Toolbar({ onOpenJsonImport, onAIGenerate, embedMode, getViewportCenter, getViewportRect }: ToolbarProps) {
  const { t } = useTranslation()
  const notify = useNotify()
  const flowStore = useFlowStore()
  const nodes = flowStore((state) => state.nodes)
  const pipes = flowStore((state) => state.pipes)
  const exportGraph = flowStore((state) => state.exportGraph)
  const importGraph = flowStore((state) => state.importGraph)
  const setImportSummary = flowStore((state) => state.setImportSummary)
  const applyEditPlan = flowStore((state) => state.applyEditPlan)
  const clearGraph = flowStore((state) => state.clearGraph)
  const canUndo = flowStore((state) => state.canUndo)
  const canRedo = flowStore((state) => state.canRedo)
  const undo = flowStore((state) => state.undo)
  const redo = flowStore((state) => state.redo)
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')

  const handleLoadExample = () => {
    // No confirm dialog — the example is added as one undo entry
    const center = getViewportCenter?.()
    importGraph(JSON.stringify(exampleGraph), center)
    notify('info', t('resources.dataflow.toolbar.exampleLoaded'))
  }

  const handleExport = async () => {
    const json = exportGraph()
    if (json) {
      try {
        await navigator.clipboard.writeText(json)
        notify('info', t('resources.dataflow.toolbar.graphCopied'))
      } catch {
        notify('error', t('resources.dataflow.toolbar.copyFailed'))
      }
    }
    setShowExport(false)
  }

  const handleDownload = () => {
    const json = exportGraph?.()
    if (json) {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dataflow-graph.json'
      a.click()
      URL.revokeObjectURL(url)
    }
    setShowExport(false)
  }

  // The teaching material alone — it deliberately does NOT carry the diagram (see
  // graphToPrompt.ts). "Copy current diagram" below is the separate button for the
  // requests that need one.
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(DATAFLOW_COPY_PROMPT)
      notify('info', t('resources.dataflow.promptCopied'))
    } catch {
      notify('error', t('resources.dataflow.toolbar.copyFailed'))
    }
    setShowExport(false)
  }

  const handleCopyGraphForEditing = async () => {
    const graph = buildGraphForEditing(nodes ?? [], pipes ?? [])
    if (graph.nodeCount === 0) {
      notify('info', t('resources.dataflow.graphForEditingEmpty'))
      setShowExport(false)
      return
    }
    try {
      await navigator.clipboard.writeText(graph.text)
      notify('info', t(graph.degraded
        ? 'resources.dataflow.paste.graphForEditingTrimmed'
        : 'resources.dataflow.paste.graphForEditingCopied', { n: graph.nodeCount }))
    } catch {
      notify('error', t('resources.dataflow.toolbar.copyFailed'))
    }
    setShowExport(false)
  }

  const handleCopyForAI = async () => {
    if (nodes && pipes) {
      const text = graphToText(nodes, pipes)
      try {
        await navigator.clipboard.writeText(text)
        notify('info', t('resources.dataflow.copiedForAI'))
      } catch {
        notify('error', t('resources.dataflow.toolbar.copyFailed'))
      }
    }
    setShowExport(false)
  }

  // Both entries run the shared pipeline (pasteImport.ts): fence/prose stripped, retired
  // dialects refused by name, every failure named rather than closing the popover on a
  // generic toast. The summary bar reports what landed.
  const runImport = (text: string, onSuccess: () => void) => {
    const outcome = importPastedGraph(text, { importGraph, applyEditPlan, setImportSummary }, {
      center: getViewportCenter?.(),
      rect: getViewportRect?.(),
    })
    if (outcome.ok) onSuccess()
    else notify('error', t(PASTE_FAILURE_KEYS[outcome.reason]))
  }

  const handleImport = () => {
    if (!importText.trim()) return
    runImport(importText, () => {
      setImportText('')
      setShowImport(false)
    })
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      runImport(event.target?.result as string, () => setShowImport(false))
    }
    reader.readAsText(file)
  }

  return (
    <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 flex flex-wrap gap-1.5 sm:gap-2 max-w-[calc(100vw-1rem)] sm:max-w-none">
      {/* Add JSON Node */}
      <button
        onClick={onOpenJsonImport}
        className="flex items-center justify-center gap-1.5 sm:gap-2 bg-slate-700 hover:bg-slate-800 text-white px-2.5 sm:px-4 py-2 rounded-lg shadow-md transition-all text-xs sm:text-sm font-medium"
        title={t('resources.dataflow.toolbar.importJson')}
      >
        <FileJson size={16} />
        <span className="hidden sm:inline">{t('resources.dataflow.toolbar.importJson')}</span>
      </button>

      {/* AI Generate */}
      {onAIGenerate && (
        <button
          onClick={onAIGenerate}
          className="flex items-center justify-center gap-1.5 sm:gap-2 bg-violet-600 hover:bg-violet-700 text-white px-2.5 sm:px-4 py-2 rounded-lg shadow-md transition-all text-xs sm:text-sm font-medium"
          title={t('resources.dataflow.toolbar.aiGenerate')}
        >
          <Sparkles size={16} />
          <span className="hidden sm:inline">{t('resources.dataflow.toolbar.aiGenerate')}</span>
        </button>
      )}

      {/* Undo/Redo */}
      <div className="flex gap-0.5">
        <button
          onClick={() => undo?.()}
          disabled={!canUndo}
          className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 bg-white hover:bg-slate-50 text-slate-700 rounded-l-lg shadow-md border border-slate-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('resources.dataflow.menu.undo')}
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={() => redo?.()}
          disabled={!canRedo}
          className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 bg-white hover:bg-slate-50 text-slate-700 rounded-r-lg shadow-md border border-slate-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('resources.dataflow.menu.redo')}
        >
          <Redo2 size={16} />
        </button>
      </div>

      {/* Export - hide in embed mode */}
      {!embedMode && (
        <div className="relative">
          <button
            onClick={() => setShowExport(!showExport)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white hover:bg-slate-50 text-slate-700 px-2.5 sm:px-4 py-2 rounded-lg shadow-md border border-slate-200 transition-all text-xs sm:text-sm font-medium"
            title={t('resources.dataflow.toolbar.export')}
          >
            <Download size={16} />
            <span className="hidden sm:inline">{t('resources.dataflow.toolbar.export')}</span>
          </button>
          {showExport && (
            <div className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 min-w-[160px]">
              <button
                onClick={handleExport}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700"
              >
                {t('resources.dataflow.toolbar.copyToClipboard')}
              </button>
              <button
                onClick={handleDownload}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700"
              >
                {t('resources.dataflow.toolbar.downloadJson')}
              </button>
              <div className="my-1" style={{ borderTop: '1px solid #e2e8f0' }} />
              <button
                onClick={handleCopyPrompt}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2"
              >
                <MessageSquareText size={14} />
                {t('resources.dataflow.copyPrompt')}
              </button>
              <button
                onClick={handleCopyGraphForEditing}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2"
              >
                <ClipboardCopy size={14} />
                {t('resources.dataflow.copyGraphForEditing')}
              </button>
              <button
                onClick={handleCopyForAI}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg text-sm text-slate-700 flex items-center gap-2"
              >
                <BotMessageSquare size={14} />
                {t('resources.dataflow.copyForAI')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Import - hide in embed mode */}
      {!embedMode && (
        <div className="relative">
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white hover:bg-slate-50 text-slate-700 px-2.5 sm:px-4 py-2 rounded-lg shadow-md border border-slate-200 transition-all text-xs sm:text-sm font-medium"
            title={t('resources.dataflow.toolbar.importGraph')}
          >
            <Upload size={16} />
            <span className="hidden sm:inline">{t('resources.dataflow.toolbar.import')}</span>
          </button>
          {showImport && (
            <div className="absolute top-full mt-2 left-0 sm:left-0 right-0 sm:right-auto bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-[calc(100vw-1rem)] sm:w-auto sm:min-w-[320px] max-w-[320px]">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={t('resources.dataflow.toolbar.pastePlaceholder')}
                className="w-full h-32 p-3 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleImport}
                  className="flex-1 bg-slate-700 text-white px-3 py-2 rounded-lg hover:bg-slate-800 text-sm font-medium transition-colors"
                >
                  {t('resources.dataflow.toolbar.import')}
                </button>
                <label className="flex-1 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 text-center cursor-pointer text-sm font-medium transition-colors">
                  <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
                  {t('resources.dataflow.toolbar.fromFile')}
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear - hide in embed mode */}
      {!embedMode && (
        <button
          onClick={() => {
            // Undoable, so no blocking confirm dialog
            clearGraph()
            notify('info', t('resources.dataflow.toolbar.graphCleared'))
          }}
          className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg shadow-md border border-slate-200 transition-all"
          title={t('resources.dataflow.toolbar.clearGraph')}
        >
          <Trash2 size={16} />
        </button>
      )}

      {/* Load Example - hide in embed mode */}
      {!embedMode && (
        <button
          onClick={handleLoadExample}
          className="flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 sm:px-4 py-2 rounded-lg shadow-md transition-all text-xs sm:text-sm font-medium"
          title={t('resources.dataflow.toolbar.loadExample')}
        >
          <Play size={16} />
          <span className="hidden sm:inline">{t('resources.dataflow.toolbar.example')}</span>
        </button>
      )}
    </div>
  )
}
