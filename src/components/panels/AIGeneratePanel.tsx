import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { useFlowStore } from '../../store/flowStoreContext'
import { DATAFLOW_SYSTEM_PROMPT } from '../../utils/graphToPrompt'
import { extractJson } from '../../utils/extractJson'
import { useDataflowHost, useNotify } from '../../host'

interface AIGeneratePanelProps {
  isOpen: boolean
  onClose: () => void
  getViewportCenter?: () => { x: number; y: number }
}

/**
 * Shape AI should return for each node — the full graph format (the only
 * format importGraph accepts). The prompt teaches no coordinates: position
 * is absent and the import runs the layout solver.
 */
interface AINodeData {
  id?: string
  type: string
  data: Record<string, unknown>
}

/** Shape AI should return for each pipe */
interface AIPipeData {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

/** Full AI response shape */
interface AIGenerateResponse {
  nodes: AINodeData[]
  pipes?: AIPipeData[]
}

/**
 * Ask a model for a graph.
 *
 * Everything model-shaped comes from host.ts `ai`: `generate` is the call, `settings` is a
 * slot the host fills with whatever choosing or configuring a model means to it. With `ai`
 * present but `generate` absent the panel is settings-only — that is the host saying
 * "nothing is configured yet" while keeping its own way to fix it on screen.
 */
export default function AIGeneratePanel({ isOpen, onClose, getViewportCenter }: AIGeneratePanelProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const importGraph = flowStore((state) => state.importGraph)
  const { ai } = useDataflowHost()
  const notify = useNotify()

  const [userInput, setUserInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Reset state when panel opens
  useEffect(() => {
    if (isOpen) {
      setUserInput('')
      setIsLoading(false)
    }
  }, [isOpen])

  if (!isOpen || !ai) return null

  const generate = ai.generate

  const handleGenerate = async () => {
    if (!generate || !userInput.trim()) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsLoading(true)
    try {
      const text = await generate(DATAFLOW_SYSTEM_PROMPT, userInput, ctrl.signal)
      const parsed = extractJson(text) as AIGenerateResponse | null
      if (!parsed?.nodes?.length) {
        notify('error', t('resources.dataflow.toolbar.importFailed'), text)
        return
      }
      // The response carries no positions — importGraph runs the layout solver
      importGraph?.(JSON.stringify(parsed), getViewportCenter?.())
      onClose()
    } catch (err) {
      if (ctrl.signal.aborted) return
      notify('error', t('common.status.error'), err)
    } finally {
      abortRef.current = null
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (isLoading) abortRef.current?.abort()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: '#ffffff',
          width: '560px',
          maxHeight: '80vh',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: '#7c3aed' }} />
            <div>
              <h2 className="font-semibold text-base" style={{ color: '#1e293b' }}>{t('resources.dataflow.panel.aiGenerateTitle')}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                {t('resources.dataflow.panel.aiGenerateSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-200"
            style={{ color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {ai.settings}

          {/* Input */}
          {generate && (
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={t('resources.dataflow.panel.aiInputPlaceholder')}
              className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow resize-y"
              style={{
                height: '180px',
                border: '1px solid #e2e8f0',
                color: '#334155',
                backgroundColor: '#ffffff',
              }}
              disabled={isLoading}
            />
          )}
        </div>

        {/* Footer */}
        {generate && (
          <div
            className="flex justify-end gap-3 px-6 py-4"
            style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
          >
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ color: '#475569', backgroundColor: 'transparent', borderRadius: '6px' }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleGenerate}
              disabled={isLoading || !userInput.trim()}
              className="px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              style={{ color: '#ffffff', backgroundColor: '#7c3aed', borderRadius: '6px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('resources.dataflow.panel.generating')}
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  {t('resources.dataflow.panel.generate')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
