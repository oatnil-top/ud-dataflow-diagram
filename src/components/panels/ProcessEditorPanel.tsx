import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus, Trash2 } from 'lucide-react'
import { validateTemplate } from '../../utils/templateEval'
import type { OutputField } from '../../types'
import { generateId } from '../../types'
import { useFlowStore } from '../../store/flowStoreContext'

interface ProcessEditorPanelProps {
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
}

export default function ProcessEditorPanel({ isOpen, onClose, position }: ProcessEditorPanelProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const addProcessNode = flowStore((state) => state.addProcessNode)
  const [name, setName] = useState('')
  const [inputFields, setInputFields] = useState<string[]>([''])
  const [outputFields, setOutputFields] = useState<OutputField[]>([
    { id: generateId(), name: '', expression: '' }
  ])
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleAddInput = () => {
    setInputFields([...inputFields, ''])
  }

  const handleRemoveInput = (index: number) => {
    setInputFields(inputFields.filter((_, i) => i !== index))
  }

  const handleInputChange = (index: number, value: string) => {
    const updated = [...inputFields]
    updated[index] = value
    setInputFields(updated)
  }

  const handleAddOutput = () => {
    setOutputFields([...outputFields, { id: generateId(), name: '', expression: '' }])
  }

  const handleRemoveOutput = (index: number) => {
    setOutputFields(outputFields.filter((_, i) => i !== index))
  }

  const handleOutputChange = (index: number, field: 'name' | 'expression', value: string) => {
    const updated = [...outputFields]
    updated[index] = { ...updated[index], [field]: value }
    setOutputFields(updated)
  }

  const handleCreate = () => {
    setError('')

    // Validate name
    if (!name.trim()) {
      setError(t('resources.dataflow.panel.processNameRequired'))
      return
    }

    // Validate inputs
    const validInputs = inputFields.filter((f) => f.trim())
    if (validInputs.length === 0) {
      setError(t('resources.dataflow.panel.inputRequired'))
      return
    }

    // Validate outputs
    const validOutputs = outputFields.filter((f) => f.name.trim() && f.expression.trim())
    if (validOutputs.length === 0) {
      setError(t('resources.dataflow.panel.outputRequired'))
      return
    }

    // Validate expressions
    for (const output of validOutputs) {
      const result = validateTemplate(output.expression)
      if (!result.valid) {
        setError(t('resources.dataflow.panel.invalidExpression', { name: output.name, error: result.error }))
        return
      }
    }

    addProcessNode?.(name.trim(), validInputs, validOutputs, position)

    // Reset form
    setName('')
    setInputFields([''])
    setOutputFields([{ id: generateId(), name: '', expression: '' }])
    onClose()
  }

  const handlePasteSample = () => {
    setName('concat_name_id')
    setInputFields(['name', 'id'])
    setOutputFields([{ id: generateId(), name: 'username', expression: '`${name}-${id}`' }])
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-purple-500 text-white">
          <h2 className="font-semibold">{t('resources.dataflow.panel.processTitle')}</h2>
          <button onClick={onClose} className="hover:bg-purple-600 p-1 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Process name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                {t('resources.dataflow.panel.processName')}
              </label>
              <button
                onClick={handlePasteSample}
                className="text-xs text-purple-500 hover:text-purple-600"
              >
                {t('resources.dataflow.panel.loadSample')}
              </button>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('resources.dataflow.panel.processNamePlaceholder')}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Input fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('resources.dataflow.panel.inputFields')}
            </label>
            {inputFields.map((field, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={field}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  placeholder={t('resources.dataflow.node.fieldName')}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                />
                {inputFields.length > 1 && (
                  <button
                    onClick={() => handleRemoveInput(index)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={handleAddInput}
              className="flex items-center gap-1 text-sm text-purple-500 hover:text-purple-600"
            >
              <Plus size={16} /> {t('resources.dataflow.panel.addInput')}
            </button>
          </div>

          {/* Output fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('resources.dataflow.panel.outputFields')}
            </label>
            {outputFields.map((output, index) => (
              <div key={output.id} className="space-y-2 mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={output.name}
                    onChange={(e) => handleOutputChange(index, 'name', e.target.value)}
                    placeholder={t('resources.dataflow.panel.outputFieldNamePlaceholder')}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  {outputFields.length > 1 && (
                    <button
                      onClick={() => handleRemoveOutput(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={output.expression}
                  onChange={(e) => handleOutputChange(index, 'expression', e.target.value)}
                  placeholder="`${name}-${id}`"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500"
                />
              </div>
            ))}
            <button
              onClick={handleAddOutput}
              className="flex items-center gap-1 text-sm text-purple-500 hover:text-purple-600"
            >
              <Plus size={16} /> {t('resources.dataflow.panel.addOutput')}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-purple-500 text-white hover:bg-purple-600 rounded-lg"
          >
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
