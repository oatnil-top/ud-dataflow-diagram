import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { isImeComposing } from '../../utils/ime'
import { useFlowStore } from '../../store/flowStoreContext'

export default function NodeRawEditor() {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const rawEditNodeId = flowStore((state) => state.rawEditNodeId)
  const nodes = flowStore((state) => state.nodes)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)
  const updateNodeData = flowStore((state) => state.updateNodeData)

  const node = nodes?.find((n: { id: string }) => n.id === rawEditNodeId)

  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState('')

  // Initialize textarea when node changes
  useEffect(() => {
    if (node) {
      setJsonText(JSON.stringify(node.data, null, 2))
      setError('')
    }
  }, [node])

  if (!rawEditNodeId || !node) return null

  const handleApply = () => {
    setError('')
    try {
      const parsed = JSON.parse(jsonText)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError(t('resources.dataflow.panel.dataMustBeObject'))
        return
      }
      // Ensure required 'name' field exists
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        setError(t('resources.dataflow.panel.missingNameField'))
        return
      }
      updateNodeData?.(rawEditNodeId, parsed)
      setRawEditNode?.(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('resources.dataflow.panel.invalidJson'))
    }
  }

  const handleClose = () => {
    setRawEditNode?.(null)
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
          width: '640px',
          maxHeight: '85vh',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-base" style={{ color: '#1e293b' }}>
              {t('resources.dataflow.panel.rawEditorTitle')}
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ backgroundColor: '#e2e8f0', color: '#475569' }}
            >
              {node.type}
            </span>
            <span className="text-xs font-mono" style={{ color: '#94a3b8' }}>
              {rawEditNodeId}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-200"
            style={{ color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 min-h-0 flex flex-col gap-4">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            onKeyDown={(e) => {
              // Allow Tab for indentation
              if (e.key === 'Tab') {
                e.preventDefault()
                const target = e.target as HTMLTextAreaElement
                const start = target.selectionStart
                const end = target.selectionEnd
                const newValue = jsonText.substring(0, start) + '  ' + jsonText.substring(end)
                setJsonText(newValue)
                // Restore cursor position after React re-render
                requestAnimationFrame(() => {
                  target.selectionStart = target.selectionEnd = start + 2
                })
              }
              // Ctrl/Cmd+Enter to apply
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isImeComposing(e)) {
                e.preventDefault()
                handleApply()
              }
              // Escape to close
              if (e.key === 'Escape') {
                handleClose()
              }
            }}
            className="w-full flex-1 px-4 py-3 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none"
            style={{
              minHeight: '300px',
              border: '1px solid #e2e8f0',
              color: '#334155',
              backgroundColor: '#ffffff',
              tabSize: 2,
            }}
            spellCheck={false}
            autoFocus
          />

          {error && (
            <div
              className="text-sm px-3 py-2.5 rounded-lg shrink-0"
              style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            {t('resources.dataflow.panel.ctrlEnterApply')}
          </span>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ color: '#475569', backgroundColor: 'transparent', borderRadius: '6px' }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2.5 text-sm font-medium transition-colors"
              style={{ color: '#ffffff', backgroundColor: '#334155', borderRadius: '6px' }}
            >
              {t('resources.dataflow.panel.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
