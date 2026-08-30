import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload } from 'lucide-react'
import { useFlowStore } from '../../store/flowStoreContext'
import { detectLegacyDialect } from '../../store/importFormats'

interface GraphImportPanelProps {
  isOpen: boolean
  onClose: () => void
  getViewportCenter?: () => { x: number; y: number }
}

export default function GraphImportPanel({ isOpen, onClose, getViewportCenter }: GraphImportPanelProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const importGraph = flowStore((state) => state.importGraph)
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleImport = () => {
    setError('')

    if (!jsonText.trim()) {
      setError(t('resources.dataflow.panel.enterOrUpload'))
      return
    }

    let parsed: unknown
    try {
      // Validate JSON syntax first
      parsed = JSON.parse(jsonText)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('resources.dataflow.panel.invalidJson'))
      return
    }

    // A retired dialect gets a named rejection, not a generic failure — the
    // user is probably holding output from an old copy-prompt and needs to
    // know what happened and the way out (re-copy the prompt, regenerate)
    if (detectLegacyDialect(parsed as { nodes?: unknown[]; groups?: unknown[] })) {
      setError(t('resources.dataflow.panel.legacyFormatRejected'))
      return
    }

    const center = getViewportCenter?.()
    const success = importGraph?.(jsonText, center)
    if (!success) {
      setError(t('resources.dataflow.panel.importNotRecognized'))
      return
    }

    // Reset form
    setJsonText('')
    onClose()
  }

  const handleFileUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setJsonText(content)
      setError('')
    }
    reader.onerror = () => {
      setError(t('resources.dataflow.panel.readFileFailed'))
    }
    reader.readAsText(file)

    // Reset input so the same file can be selected again
    event.target.value = ''
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
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#1e293b' }}>{t('resources.dataflow.panel.importGraphTitle')}</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{t('resources.dataflow.panel.importGraphSubtitle')}</p>
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
          {/* JSON input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: '#334155' }}>
                {t('resources.dataflow.panel.graphJsonLabel')}
              </label>
              <button
                onClick={handleFileUpload}
                className="text-xs font-medium flex items-center gap-1"
                style={{ color: '#3b82f6' }}
              >
                <Upload size={12} />
                {t('resources.dataflow.panel.uploadFile')}
              </button>
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={t('resources.dataflow.panel.graphJsonPlaceholder')}
              className="w-full px-4 py-3 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-y"
              style={{
                height: '280px',
                border: '1px solid #e2e8f0',
                color: '#334155',
                backgroundColor: '#ffffff'
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="text-sm px-3 py-2.5 rounded-lg"
              style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
            >
              {error}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
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
            {t('resources.dataflow.panel.import')}
          </button>
        </div>
      </div>
    </div>
  )
}
