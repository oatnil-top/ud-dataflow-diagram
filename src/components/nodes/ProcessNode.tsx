import { memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Pencil, Check, X, Link2, Code2 } from 'lucide-react'
import type { ProcessNodeData, OutputField } from '../../types'
import { useFieldHighlight, HIGHLIGHT_COLORS, HIGHLIGHT_BG_COLORS, HIGHLIGHT_BORDER_COLORS } from '../../hooks/useHighlight'
import { useFlowStore } from '../../store/flowStoreContext'
import { useConnectedHandles } from '../../hooks/useConnectedHandles'
import { sanitizeNodeUrl } from '../../utils/sanitizeUrl'
import NodePerimeterHandles from './NodePerimeterHandles'
import { isImeComposing } from '../../utils/ime'

type ProcessNodeType = Node<ProcessNodeData, 'process'>

// Separate component for each field row so we can use hooks
interface ProcessFieldRowProps {
  nodeId: string
  inputField: string | undefined
  outputField: OutputField | undefined
  outputFields: OutputField[]
}

function ProcessFieldRow({ nodeId, inputField, outputField, outputFields }: ProcessFieldRowProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const pipes = flowStore((state) => state.pipes)
  const updateProcessNode = flowStore((state) => state.updateProcessNode)

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(outputField?.name || '')
  const [editExpression, setEditExpression] = useState(outputField?.expression || '')
  const [editDesc, setEditDesc] = useState(outputField?.desc || '')

  const inputHandleId = inputField ? `input-${inputField}` : ''
  const outputHandleId = outputField ? `output-${outputField.name}` : ''

  const { isHighlighted: isInputHighlighted, isSelected: isInputSelected, colorIndex: inputColorIndex } = useFieldHighlight(nodeId, inputHandleId, pipes)
  const { isHighlighted: isOutputHighlighted, isSelected: isOutputSelected, colorIndex: outputColorIndex } = useFieldHighlight(nodeId, outputHandleId, pipes)
  const isRowHighlighted = isInputHighlighted || isOutputHighlighted
  const isRowSelected = isInputSelected || isOutputSelected
  const colorIndex = isInputHighlighted ? inputColorIndex : outputColorIndex

  const activeHandleId = inputHandleId || outputHandleId
  const { toggle } = useFieldHighlight(nodeId, activeHandleId, pipes)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeHandleId) toggle(e.ctrlKey || e.metaKey)
  }

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(outputField?.name || '')
    setEditExpression(outputField?.expression || '')
    setEditDesc(outputField?.desc || '')
    setIsEditing(true)
  }, [outputField])

  const handleSave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (outputField) {
      const newName = editName.trim() || outputField.name
      // Match by id when available — matching by name would bulk-overwrite
      // duplicate-named outputs
      const updated = outputFields.map(f =>
        (f.id && outputField.id ? f.id === outputField.id : f.name === outputField.name)
          ? { id: f.id, name: newName, expression: editExpression, desc: editDesc.trim() || undefined }
          : f
      )
      // Handle IDs derive from the output name — tell the store so connected
      // pipes are remapped instead of silently losing their handle
      const opts = newName !== outputField.name
        ? { renamedPaths: [{ from: outputField.name, to: newName }] }
        : undefined
      updateProcessNode?.(nodeId, { outputFields: updated }, opts)
    }
    setIsEditing(false)
  }, [nodeId, outputField, outputFields, editName, editExpression, editDesc, updateProcessNode])

  const tooltipDesc = outputField?.desc || undefined

  return (
    <>
      <div
        className={`group relative flex items-center justify-between py-2 pl-4 pr-4 text-sm min-h-[32px] cursor-pointer transition-colors ${isRowHighlighted ? 'field-highlighted' : ''} ${isRowSelected ? 'field-selected' : ''}`}
        style={{
          backgroundColor: isRowHighlighted ? HIGHLIGHT_BG_COLORS[colorIndex % HIGHLIGHT_COLORS.length] : undefined,
          boxShadow: isRowSelected
            ? `inset 0 0 0 2px ${HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]}`
            : isRowHighlighted
              ? `inset 0 0 0 1px ${HIGHLIGHT_BORDER_COLORS[colorIndex % HIGHLIGHT_COLORS.length]}`
              : undefined,
        }}
        onClick={handleClick}
        title={tooltipDesc}
      >
        {/* Input Handle & Label */}
        {inputField && (
          <>
            <Handle
              type="target"
              position={Position.Left}
              id={inputHandleId}
              className={`!w-3 !h-3 !bg-purple-400 !border-2 !border-white !top-1/2 !-translate-y-1/2 !-left-1.5 ${isInputHighlighted ? 'process-handle-highlighted' : ''}`}
            />
            <span className="text-gray-600 font-mono">{inputField}</span>
          </>
        )}

        {!inputField && <span />}

        {/* Arrow */}
        {inputField && outputField && (
          <span className="text-gray-300 mx-2">→</span>
        )}

        {/* Output Handle & Label */}
        {outputField && (
          <>
            <div className="text-right">
              <span className="text-gray-600 font-mono">
                {outputField.name}
              </span>
              {outputField.desc && (
                <div className="text-[10px] leading-tight mt-0.5 truncate max-w-[120px]" style={{ color: '#94a3b8' }}>
                  {outputField.desc}
                </div>
              )}
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={outputHandleId}
              className={`!w-3 !h-3 !bg-green-400 !border-2 !border-white !top-1/2 !-translate-y-1/2 !-right-1.5 ${isOutputHighlighted ? 'process-handle-highlighted' : ''}`}
            />
          </>
        )}

        {/* Edit button - overlay on hover */}
        {outputField && (
          <button
            onClick={handleStartEdit}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
            style={{ color: '#3b82f6', backgroundColor: 'rgba(255,255,255,0.95)' }}
            title={t('resources.dataflow.node.editField')}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {/* Inline field editor — name, expression, desc */}
      {isEditing && outputField && (
        <div className="py-1.5 px-4 flex flex-col gap-1" style={{ backgroundColor: '#f8fafc' }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder={t('resources.dataflow.node.fieldName')}
            className="px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#1e293b' }}
            autoFocus
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setIsEditing(false) }}
          />
          <input
            type="text"
            value={editExpression}
            onChange={(e) => setEditExpression(e.target.value)}
            placeholder={t('resources.dataflow.node.expressionPlaceholder')}
            className="px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b' }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setIsEditing(false) }}
          />
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t('resources.dataflow.node.description')}
            className="px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#94a3b8' }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setIsEditing(false) }}
          />
          <div className="flex justify-end gap-1">
            <button onClick={handleSave} className="p-1 rounded" style={{ color: '#10b981' }}>
              <Check size={12} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setIsEditing(false) }} className="p-1 rounded" style={{ color: '#64748b' }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ProcessNode({ id, data, selected }: NodeProps<ProcessNodeType>) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const updateNodeUrl = flowStore((state) => state.updateNodeUrl)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)
  const connectedHandles = useConnectedHandles(id)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [editedUrl, setEditedUrl] = useState(data.url || '')

  const inputCount = data.inputFields.length
  const outputCount = data.outputFields.length
  const maxFields = Math.max(inputCount, outputCount)

  return (
    <div
      className={`
        json-node-wrapper bg-white rounded-lg border min-w-[220px]
        ${selected ? 'border-purple-500 ring-1 ring-purple-500' : 'border-[#e5e5e5]'}
      `}
    >
      {/* Node-level handles */}
      <NodePerimeterHandles
        classNameByPosition={{
          top: `node-handle ${connectedHandles.has('node-top') ? 'connected' : ''}`,
          bottom: `node-handle ${connectedHandles.has('node-bottom') ? 'connected' : ''}`,
          left: `node-handle node-handle-header ${connectedHandles.has('node-left') ? 'connected' : ''}`,
          right: `node-handle node-handle-header ${connectedHandles.has('node-right') ? 'connected' : ''}`,
        }}
      />

      {/* Header */}
      <div className="group/header bg-purple-500 text-white px-3 py-2 rounded-t-md font-semibold flex items-center gap-2">
        <span className="text-xs bg-purple-400 px-1.5 py-0.5 rounded">fn</span>
        {isEditingUrl ? (
          <div className="flex-1 flex items-center gap-1">
            <input
              type="text"
              value={editedUrl}
              onChange={(e) => setEditedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) { updateNodeUrl?.(id, editedUrl.trim() || undefined); setIsEditingUrl(false) }
                if (e.key === 'Escape') { setEditedUrl(data.url || ''); setIsEditingUrl(false) }
              }}
              placeholder="https://..."
              className="flex-1 px-2 py-0.5 text-xs rounded focus:outline-none focus:ring-1 focus:ring-purple-300 font-mono"
              style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' }}
              autoFocus
            />
            <button onClick={() => { updateNodeUrl?.(id, editedUrl.trim() || undefined); setIsEditingUrl(false) }} className="p-1 rounded text-white/80 hover:text-white">
              <Check size={14} />
            </button>
            <button onClick={() => { setEditedUrl(data.url || ''); setIsEditingUrl(false) }} className="p-1 rounded text-white/60 hover:text-white">
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            {data.url ? (
              <a href={sanitizeNodeUrl(data.url)} target="_blank" rel="noopener noreferrer" className="nodrag flex-1 hover:underline text-white" title={data.url}>
                {data.name}
              </a>
            ) : (
              <span className="flex-1">{data.name}</span>
            )}
            <button
              onClick={() => setRawEditNode?.(id)}
              className="nodrag p-1 rounded transition-opacity opacity-0 group-hover/header:opacity-100 text-white/60 hover:text-white"
              title={t('resources.dataflow.node.rawEditor')}
            >
              <Code2 size={12} />
            </button>
            <button
              onClick={() => { setEditedUrl(data.url || ''); setIsEditingUrl(true) }}
              className={`nodrag p-1 rounded transition-opacity opacity-0 group-hover/header:opacity-100 ${data.url ? 'text-white' : 'text-white/60 hover:text-white'}`}
              title={data.url ? t('resources.dataflow.node.editLink', { url: data.url }) : t('resources.dataflow.node.addLink')}
            >
              <Link2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Fields */}
      <div className="p-2">
        {Array.from({ length: maxFields }).map((_, index) => (
          <ProcessFieldRow
            key={data.outputFields[index]?.id ?? data.inputFields[index] ?? index}
            nodeId={id}
            inputField={data.inputFields[index]}
            outputField={data.outputFields[index]}
            outputFields={data.outputFields}
          />
        ))}

        {/* Expression preview */}
        {data.outputFields.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-400 font-mono bg-gray-50 p-1.5 rounded truncate">
              {data.outputFields[0].expression}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(ProcessNode)
