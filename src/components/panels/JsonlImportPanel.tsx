import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { parseJsonToFields } from '../../utils/jsonParser'
import { useFlowStore } from '../../store/flowStoreContext'

interface JsonlImportPanelProps {
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
}

export default function JsonlImportPanel({ isOpen, onClose, position }: JsonlImportPanelProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const addJsonNode = flowStore((state) => state.addJsonNode)
  const [jsonlText, setJsonlText] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleImport = () => {
    setError('')

    const lines = jsonlText.split('\n').filter((line) => line.trim())

    if (lines.length === 0) {
      setError(t('resources.dataflow.panel.jsonlEmpty'))
      return
    }

    const errors: string[] = []
    let successCount = 0

    lines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line.trim())
        const fields = parseJsonToFields(parsed)

        // Position nodes in a grid pattern
        const col = successCount % 3
        const row = Math.floor(successCount / 3)
        const nodePosition = {
          x: position.x + col * 320,
          y: position.y + row * 300,
        }

        addJsonNode?.(`JSON ${index + 1}`, fields, nodePosition)
        successCount++
      } catch (e) {
        errors.push(t('resources.dataflow.panel.lineError', { line: index + 1, message: e instanceof Error ? e.message : t('resources.dataflow.panel.invalidJson') }))
      }
    })

    if (errors.length > 0 && successCount === 0) {
      setError(errors.join('\n'))
      return
    }

    if (errors.length > 0) {
      setError(t('resources.dataflow.panel.importedWithErrors', { count: successCount, errors: errors.join('\n') }))
      return
    }

    // Reset form
    setJsonlText('')
    onClose()
  }

  const handlePasteSample = () => {
    const sample = `{"id": 1, "name": "Alice", "role": "admin"}
{"id": 2, "name": "Bob", "role": "user"}
{"id": 3, "name": "Charlie", "role": "user"}`
    setJsonlText(sample)
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
          width: '600px',
          maxHeight: '80vh',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#1e293b' }}>{t('resources.dataflow.panel.importJsonlTitle')}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{t('resources.dataflow.panel.importJsonlSubtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-200"
            style={{ color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* JSONL input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: '#334155' }}>
                {t('resources.dataflow.panel.jsonlDataLabel')}
              </label>
              <button
                onClick={handlePasteSample}
                className="text-xs font-medium"
                style={{ color: '#3b82f6' }}
              >
                {t('resources.dataflow.panel.pasteSample')}
              </button>
            </div>
            <textarea
              value={jsonlText}
              onChange={(e) => setJsonlText(e.target.value)}
              placeholder={'{"id": 1, "name": "Alice"}\n{"id": 2, "name": "Bob"}'}
              className="w-full px-4 py-3 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-y"
              style={{
                height: '280px',
                border: '1px solid #e2e8f0',
                color: '#334155',
                backgroundColor: '#ffffff'
              }}
            />
            <p className="text-xs mt-1.5" style={{ color: '#94a3b8' }}>
              {t('resources.dataflow.panel.jsonlHint')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-sm px-3 py-2.5 rounded-lg whitespace-pre-wrap"
              style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-6 py-4"
          style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ color: '#475569', backgroundColor: 'transparent', borderRadius: '6px' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleImport}
            className="px-5 py-2.5 text-sm font-medium transition-colors"
            style={{ color: '#ffffff', backgroundColor: '#334155', borderRadius: '6px' }}
          >
            {t('resources.dataflow.panel.importAll')}
          </button>
        </div>
      </div>
    </div>
  )
}
