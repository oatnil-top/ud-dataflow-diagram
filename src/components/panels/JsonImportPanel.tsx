import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { parseJsonToFields } from '../../utils/jsonParser'
import { useFlowStore } from '../../store/flowStoreContext'

interface JsonImportPanelProps {
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
}

export default function JsonImportPanel({ isOpen, onClose, position }: JsonImportPanelProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const addJsonNode = flowStore((state) => state.addJsonNode)
  const [jsonText, setJsonText] = useState('')
  const [nodeName, setNodeName] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleImport = () => {
    setError('')

    try {
      const parsed = JSON.parse(jsonText)
      const fields = parseJsonToFields(parsed)

      // Use provided name or default to "JSON Data"
      const name = nodeName.trim() || 'JSON Data'
      addJsonNode?.(name, fields, position)

      // Reset form
      setJsonText('')
      setNodeName('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('resources.dataflow.panel.invalidJson'))
    }
  }

  const handlePasteSample = () => {
    const sample = JSON.stringify({
      id: 123,
      name: "Alice",
      profile: {
        age: 30,
        email: "alice@example.com"
      },
      tags: ["developer", "admin"],
      orders: [
        { id: 1, amount: 99.99 },
        { id: 2, amount: 149.50 }
      ]
    }, null, 2)
    setJsonText(sample)
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
          <h2 className="font-semibold text-base" style={{ color: '#1e293b' }}>{t('resources.dataflow.panel.importJsonTitle')}</h2>
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
          {/* Node name input */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#334155' }}>
              {t('resources.dataflow.panel.nodeName')} <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>{t('resources.dataflow.panel.optional')}</span>
            </label>
            <input
              type="text"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              placeholder={t('resources.dataflow.panel.nodeNamePlaceholder')}
              className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              style={{ border: '1px solid #e2e8f0', color: '#1e293b', backgroundColor: '#ffffff' }}
            />
          </div>

          {/* JSON input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium" style={{ color: '#334155' }}>
                {t('resources.dataflow.panel.jsonDataLabel')}
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
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={t('resources.dataflow.panel.jsonPlaceholder')}
              className="w-full px-4 py-3 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-y"
              style={{
                height: '240px',
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
