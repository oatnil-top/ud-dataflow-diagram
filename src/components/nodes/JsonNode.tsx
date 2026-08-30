import { memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Plus, X, Check, Trash2, Copy, Pencil, Link2, Code2, GripVertical } from 'lucide-react'
import type { JsonNodeData, Field } from '../../types'
import { generateId } from '../../types'
import { useFieldHighlight, HIGHLIGHT_COLORS, HIGHLIGHT_BG_COLORS, HIGHLIGHT_BORDER_COLORS } from '../../hooks/useHighlight'
import { sanitizeNodeUrl } from '../../utils/sanitizeUrl'
import { useFlowStore } from '../../store/flowStoreContext'
import { useConnectedHandles } from '../../hooks/useConnectedHandles'
import NodePerimeterHandles from './NodePerimeterHandles'
import { isImeComposing } from '../../utils/ime'

// Drag state for field reordering within a JsonNode
interface DragState {
  dragFieldPath: string | null       // path.join('.') of the field being dragged
  dragParentPath: string | null      // parent path (null for top-level fields)
  dropTargetPath: string | null      // path.join('.') of the drop target
  dropPosition: 'above' | 'below' | null
}

const INITIAL_DRAG_STATE: DragState = {
  dragFieldPath: null,
  dragParentPath: null,
  dropTargetPath: null,
  dropPosition: null,
}

// Reorder fields within an array by moving the dragged field relative to the drop target
function reorderArray(fields: Field[], dragPath: string, dropPath: string, position: 'above' | 'below'): Field[] {
  const dragIndex = fields.findIndex(f => f.path.join('.') === dragPath)
  const dropIndex = fields.findIndex(f => f.path.join('.') === dropPath)
  if (dragIndex === -1 || dropIndex === -1) return fields

  const result = [...fields]
  const [dragged] = result.splice(dragIndex, 1)
  const newDropIndex = result.findIndex(f => f.path.join('.') === dropPath)
  const insertIndex = position === 'above' ? newDropIndex : newDropIndex + 1
  result.splice(insertIndex, 0, dragged)
  return result
}

type JsonNodeType = Node<JsonNodeData, 'json'>

// Get connected handle IDs for this node
// Custom hook for field highlighting that passes pipes from flow store context
function useFieldHighlightWithPipes(nodeId: string, handleId: string) {
  const flowStore = useFlowStore()
  const pipes = flowStore((state) => state.pipes)
  return useFieldHighlight(nodeId, handleId, pipes)
}

// Recursive component for rendering nested fields
interface FieldRowProps {
  field: Field
  depth: number
  nodeId: string
  parentPath: string | null  // null for top-level fields
  onRemove: (path: string[]) => void
  onUpdateField: (path: string[], updates: { name?: string; example?: unknown; desc?: string; type?: string; children?: Field[] }) => void
  onAddChild: (parentPath: string[]) => void
  connectedHandles: Set<string>
  dragState: DragState
  onDragStart: (fieldPath: string, parentPath: string | null) => void
  onDragOver: (e: React.DragEvent, fieldPath: string, parentPath: string | null) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
}

const FieldRow = memo(function FieldRow({ field, depth, nodeId, parentPath, onRemove, onUpdateField, onAddChild, connectedHandles, dragState, onDragStart, onDragOver, onDragEnd, onDrop }: FieldRowProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true) // Expanded by default
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(field.name)
  const [editExample, setEditExample] = useState(field.example != null ? String(field.example) : '')
  const [editDesc, setEditDesc] = useState(field.desc || '')
  const hasChildren = field.children && field.children.length > 0
  const isParent = hasChildren || field.type === 'object' || field.type.endsWith('[]')
  const fieldId = field.path.join('.')

  const inputHandleId = `input-${fieldId}`
  const outputHandleId = `output-${fieldId}`
  const isInputConnected = connectedHandles.has(inputHandleId)
  const isOutputConnected = connectedHandles.has(outputHandleId)

  // Each field uses the highlight hook to detect its own state
  const { isHighlighted: isInputHighlighted, isSelected: isInputSelected, colorIndex: inputColorIndex } = useFieldHighlightWithPipes(nodeId, inputHandleId)
  const { isHighlighted: isOutputHighlighted, isSelected: isOutputSelected, colorIndex: outputColorIndex } = useFieldHighlightWithPipes(nodeId, outputHandleId)
  const isHighlighted = isInputHighlighted || isOutputHighlighted
  const isSelected = isInputSelected || isOutputSelected
  const colorIndex = isInputHighlighted ? inputColorIndex : outputColorIndex

  // Use the active handle for toggle (prefer output if connected, else input)
  const { toggle } = useFieldHighlightWithPipes(nodeId, isOutputConnected ? outputHandleId : inputHandleId)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggle(e.ctrlKey || e.metaKey)
  }

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(field.name)
    setEditExample(field.example != null ? String(field.example) : '')
    setEditDesc(field.desc || '')
    setIsEditing(true)
  }

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Parse example back to typed value
    let parsedExample: unknown = editExample
    try { parsedExample = JSON.parse(editExample) } catch { /* keep as string */ }
    onUpdateField(field.path, {
      name: editName.trim() || field.name,
      example: parsedExample,
      desc: editDesc.trim() || undefined,
    })
    setIsEditing(false)
  }

  const handleConvertToObject = (e: React.MouseEvent) => {
    e.stopPropagation()
    let parsedExample: unknown = editExample
    try { parsedExample = JSON.parse(editExample) } catch { /* keep as string */ }
    onUpdateField(field.path, {
      name: editName.trim() || field.name,
      example: parsedExample,
      desc: editDesc.trim() || undefined,
      type: 'object',
      children: field.children || [],
    })
    setIsEditing(false)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(false)
  }

  const fieldPathStr = field.path.join('.')
  const isDragging = dragState.dragFieldPath === fieldPathStr
  const isDropTarget = dragState.dropTargetPath === fieldPathStr
  const canDrop = isDropTarget && dragState.dragParentPath === parentPath && dragState.dragFieldPath !== fieldPathStr

  return (
    <>
      <div
        className={`field-row group relative flex items-center py-1.5 transition-colors cursor-pointer ${isHighlighted ? 'field-highlighted' : ''} ${isSelected ? 'field-selected' : ''}`}
        style={{
          paddingLeft: depth > 0 ? `${8 + depth * 20}px` : '8px',
          backgroundColor: isHighlighted ? HIGHLIGHT_BG_COLORS[colorIndex % HIGHLIGHT_COLORS.length] : undefined,
          boxShadow: isSelected
            ? `inset 0 0 0 2px ${HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]}`
            : isHighlighted
              ? `inset 0 0 0 1px ${HIGHLIGHT_BORDER_COLORS[colorIndex % HIGHLIGHT_COLORS.length]}`
              : undefined,
          '--highlight-color': isHighlighted ? HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length] : undefined,
          opacity: isDragging ? 0.4 : 1,
          borderTop: canDrop && dragState.dropPosition === 'above' ? '2px solid #3b82f6' : undefined,
          borderBottom: canDrop && dragState.dropPosition === 'below' ? '2px solid #3b82f6' : undefined,
        } as React.CSSProperties}
        onClick={handleClick}
        title={field.desc || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDragOver(e, fieldPathStr, parentPath)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDrop(e)
        }}
      >
        {/* Input Handle (left side) - contextual port */}
        <Handle
          type="target"
          position={Position.Left}
          id={inputHandleId}
          className={`port !top-1/2 !-left-[4px] ${isInputConnected ? 'connected' : ''}`}
        />

        {/* Visual indent line */}
        {depth > 0 && (
          <div
            className="absolute top-0 bottom-0"
            style={{ left: `${8 + (depth - 1) * 20 + 6}px`, borderLeft: '1px solid #e2e8f0' }}
          />
        )}

        {/* Drag handle */}
        <div
          className="nodrag mr-0.5 cursor-grab opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', fieldPathStr)
            onDragStart(fieldPathStr, parentPath)
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={12} style={{ color: '#94a3b8' }} />
        </div>

        {/* Expand/collapse toggle for parent fields */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="mr-1.5 transition-colors text-xs"
            style={{ color: '#64748b' }}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3.5" /> // Spacer for alignment when no toggle
        )}

        {/* Field content */}
        <div className="flex-1 pr-2">
          <div className="flex justify-between items-center">
            {/* Field name with type indicator for parents */}
            <span className="font-mono text-[13px] flex items-center gap-1.5" style={{ color: '#1e293b' }}>
              {field.name}
              {isParent && (
                <span className="text-[11px]" style={{ color: '#94a3b8' }}>
                  {field.type === 'object' ? '{}' : field.type.endsWith('[]') ? '[]' : ''}
                </span>
              )}
            </span>

            {/* Field value - only show for leaf nodes.
                240px cap, not 100px (card 249e596f): the old cap cut a hard
                retirement date to "⛔ 2026-09-…" — the one value on the
                diagram that must be readable without hovering. The name
                column is unbounded, so widening the value cap only widens
                nodes whose width was value-driven; rows still hold one line. */}
            {!hasChildren && (
              <span className="truncate max-w-[240px] font-mono text-[13px]" style={{ color: '#64748b' }} title={String(field.example)}>
                {formatExample(field.example)}
              </span>
            )}
          </div>
          {/* Field description - shown inline */}
          {field.desc && (
            <div className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: '#94a3b8' }}>
              {field.desc}
            </div>
          )}
        </div>

        {/* Action buttons - overlay on hover, centered in row */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 rounded transition-all"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', padding: '1px 2px' }}
        >
          {isParent && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddChild(field.path)
              }}
              className="p-1 rounded transition-colors"
              style={{ color: '#10b981' }}
              title={t('resources.dataflow.node.addChildField')}
            >
              <Plus size={12} />
            </button>
          )}
          <button
            onClick={handleStartEdit}
            className="p-1 rounded transition-colors"
            style={{ color: '#3b82f6' }}
            title={t('resources.dataflow.node.editField')}
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(field.path)
            }}
            className="p-1 rounded transition-colors"
            style={{ color: '#ef4444' }}
            title={t('resources.dataflow.node.removeField')}
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Output Handle (right side) - contextual port */}
        <Handle
          type="source"
          position={Position.Right}
          id={outputHandleId}
          className={`port !top-1/2 !-right-[4px] ${isOutputConnected ? 'connected' : ''}`}
        />
      </div>

      {/* Inline field editor — name, example, desc */}
      {isEditing && (
        <div
          className="nodrag py-1.5 px-2 flex flex-col gap-1"
          style={{
            paddingLeft: depth > 0 ? `${8 + depth * 20}px` : '8px',
            backgroundColor: '#f8fafc'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder={t('resources.dataflow.node.fieldName')}
            className="px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#1e293b' }}
            autoFocus
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setIsEditing(false) }}
          />
          <input
            type="text"
            value={editExample}
            onChange={(e) => setEditExample(e.target.value)}
            placeholder={t('resources.dataflow.node.exampleValue')}
            className="px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b' }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setIsEditing(false) }}
          />
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder={t('resources.dataflow.node.description')}
            className="px-2 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#94a3b8' }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setIsEditing(false) }}
          />
          <div className="flex justify-end gap-1">
            {!isParent && (
              <button
                onClick={handleConvertToObject}
                className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold"
                style={{ color: '#3b82f6', border: '1px solid #bfdbfe' }}
                title={t('resources.dataflow.node.convertToObject')}
              >
                {'{ }'}
              </button>
            )}
            <button onClick={handleSave} className="p-1 rounded" style={{ color: '#10b981' }}>
              <Check size={12} />
            </button>
            <button onClick={handleCancel} className="p-1 rounded" style={{ color: '#64748b' }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Render children if expanded */}
      {hasChildren && isExpanded && field.children!.map((child) => (
        <FieldRow
          key={child.id}
          field={child}
          depth={depth + 1}
          nodeId={nodeId}
          parentPath={fieldPathStr}
          onRemove={onRemove}
          onUpdateField={onUpdateField}
          onAddChild={onAddChild}
          connectedHandles={connectedHandles}
          dragState={dragState}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ))}
    </>
  )
})

function JsonNode({ id, data, selected }: NodeProps<JsonNodeType>) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const [isAdding, setIsAdding] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldExample, setNewFieldExample] = useState('')
  const [editedName, setEditedName] = useState(data.name)
  const [editedUrl, setEditedUrl] = useState(data.url || '')
  const updateJsonNodeFields = flowStore((state) => state.updateJsonNodeFields)
  const updateNodeName = flowStore((state) => state.updateNodeName)
  const updateNodeUrl = flowStore((state) => state.updateNodeUrl)
  const duplicateNode = flowStore((state) => state.duplicateNode)
  const removeNode = flowStore((state) => state.removeNode)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)
  const connectedHandles = useConnectedHandles(id)

  // Drag-to-reorder state
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE)

  const handleFieldDragStart = useCallback((fieldPath: string, parentPath: string | null) => {
    setDragState({
      dragFieldPath: fieldPath,
      dragParentPath: parentPath,
      dropTargetPath: null,
      dropPosition: null,
    })
  }, [])

  const handleFieldDragOver = useCallback((e: React.DragEvent, fieldPath: string, parentPath: string | null) => {
    // Only allow dropping within the same parent level
    if (dragState.dragParentPath !== parentPath) return
    if (dragState.dragFieldPath === fieldPath) return

    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position = e.clientY < midY ? 'above' : 'below'

    // dragover fires continuously — bail when nothing changed so the whole
    // node isn't re-rendered on every mouse move during a field drag
    setDragState(prev =>
      prev.dropTargetPath === fieldPath && prev.dropPosition === position
        ? prev
        : { ...prev, dropTargetPath: fieldPath, dropPosition: position }
    )
  }, [dragState.dragParentPath, dragState.dragFieldPath])

  const handleFieldDragEnd = useCallback(() => {
    setDragState(INITIAL_DRAG_STATE)
  }, [])

  const handleFieldDrop = useCallback(() => {
    const { dragFieldPath, dragParentPath, dropTargetPath, dropPosition } = dragState
    if (!dragFieldPath || !dropTargetPath || !dropPosition || dragFieldPath === dropTargetPath) {
      setDragState(INITIAL_DRAG_STATE)
      return
    }

    // Reorder within the appropriate fields array (top-level or nested children)
    const reorderFields = (fields: Field[]): Field[] => {
      // Find the parent that contains both fields
      if (dragParentPath === null) {
        // Top-level reorder
        return reorderArray(fields, dragFieldPath, dropTargetPath, dropPosition)
      }
      // Nested reorder — find parent and reorder its children
      return fields.map(f => {
        if (f.path.join('.') === dragParentPath && f.children) {
          return { ...f, children: reorderArray(f.children, dragFieldPath, dropTargetPath, dropPosition) }
        }
        if (f.children) {
          return { ...f, children: reorderFields(f.children) }
        }
        return f
      })
    }

    updateJsonNodeFields?.(id, reorderFields([...data.fields]))
    setDragState(INITIAL_DRAG_STATE)
  }, [dragState, id, data.fields, updateJsonNodeFields])

  const handleDuplicate = useCallback(() => {
    duplicateNode?.(id)
  }, [id, duplicateNode])

  const handleDelete = useCallback(() => {
    removeNode?.(id)
  }, [id, removeNode])

  const handleStartRename = useCallback(() => {
    setEditedName(data.name)
    setIsRenaming(true)
  }, [data.name])

  const handleConfirmRename = useCallback(() => {
    if (editedName.trim()) {
      updateNodeName?.(id, editedName.trim())
    }
    setIsRenaming(false)
  }, [id, editedName, updateNodeName])

  const handleCancelRename = useCallback(() => {
    setEditedName(data.name)
    setIsRenaming(false)
  }, [data.name])

  const handleStartEditUrl = useCallback(() => {
    setEditedUrl(data.url || '')
    setIsEditingUrl(true)
  }, [data.url])

  const handleConfirmUrl = useCallback(() => {
    const trimmed = editedUrl.trim()
    updateNodeUrl?.(id, trimmed || undefined)
    setIsEditingUrl(false)
  }, [id, editedUrl, updateNodeUrl])

  const handleCancelUrl = useCallback(() => {
    setEditedUrl(data.url || '')
    setIsEditingUrl(false)
  }, [data.url])

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return

    // Infer type from example value
    let example: unknown = newFieldExample
    let type = 'string'

    // Try to parse as JSON (number, boolean, array, object)
    try {
      const parsed = JSON.parse(newFieldExample)
      example = parsed
      if (typeof parsed === 'number') type = 'number'
      else if (typeof parsed === 'boolean') type = 'boolean'
      else if (Array.isArray(parsed)) type = 'array'
      else if (typeof parsed === 'object') type = 'object'
    } catch {
      // Keep as string
      example = newFieldExample
    }

    // Path is always [name] for a top-level field — splitting on '.' would
    // create a phantom nesting prefix that collides with real nested paths
    const newField: Field = {
      id: generateId(),
      name: newFieldName.trim(),
      path: [newFieldName.trim()],
      type,
      example,
    }

    updateJsonNodeFields?.(id, [...data.fields, newField])
    setNewFieldName('')
    setNewFieldExample('')
    setIsAdding(false)
  }, [id, data.fields, newFieldName, newFieldExample, updateJsonNodeFields])

  const handleAddObjectField = useCallback(() => {
    let name = newFieldName.trim()
    if (!name) {
      // Auto-generate a unique object name
      name = 'object'
      if (data.fields.some(f => f.name === name)) {
        let i = 2
        while (data.fields.some(f => f.name === `object_${i}`)) i++
        name = `object_${i}`
      }
    }

    const newField: Field = {
      id: generateId(),
      name,
      path: [name],
      type: 'object',
      example: {},
      children: [],
    }

    updateJsonNodeFields?.(id, [...data.fields, newField])
    setNewFieldName('')
    setNewFieldExample('')
    setIsAdding(false)
  }, [id, data.fields, newFieldName, updateJsonNodeFields])

  const handleCancel = useCallback(() => {
    setNewFieldName('')
    setNewFieldExample('')
    setIsAdding(false)
  }, [])

  // Remove field by path (works for nested fields too).
  // Must be fully immutable: mutating `f.children` in place would also mutate
  // the objects captured by the undo snapshot, making the removal un-undoable.
  const handleRemoveField = useCallback((pathToRemove: string[]) => {
    const target = pathToRemove.join('.')
    const removeFromFields = (fields: Field[]): Field[] => {
      return fields
        .filter((f) => f.path.join('.') !== target)
        .map((f) => (f.children ? { ...f, children: removeFromFields(f.children) } : f))
    }
    updateJsonNodeFields?.(id, removeFromFields(data.fields))
  }, [id, data.fields, updateJsonNodeFields])

  // Update field properties by path (name, example, desc, type, children — works for nested fields too)
  const handleUpdateField = useCallback((pathToUpdate: string[], updates: { name?: string; example?: unknown; desc?: string; type?: string; children?: Field[] }) => {
    // Renames change the field's path, which is what pipe handle IDs are
    // derived from — collect them so the store can remap connected pipes
    const renamedPaths: { from: string; to: string }[] = []

    // Descendant paths embed every ancestor name, so a parent rename must
    // rebuild the whole subtree's paths
    const rebuildChildPaths = (children: Field[] | undefined, parentPath: string[]): Field[] | undefined => {
      if (!children) return children
      return children.map((c) => {
        const childPath = [...parentPath, c.name]
        return { ...c, path: childPath, children: rebuildChildPaths(c.children, childPath) }
      })
    }

    const updateInFields = (fields: Field[]): Field[] => {
      return fields.map((f) => {
        if (f.path.join('.') === pathToUpdate.join('.')) {
          const newName = updates.name ?? f.name
          // Rebuild path with new name
          const newPath = f.path.length > 1
            ? [...f.path.slice(0, -1), newName]
            : [newName]
          if (newName !== f.name) {
            renamedPaths.push({ from: f.path.join('.'), to: newPath.join('.') })
          }
          const newChildren = updates.children !== undefined ? updates.children : f.children
          return {
            ...f,
            name: newName,
            path: newPath,
            example: updates.example !== undefined ? updates.example : f.example,
            desc: updates.desc !== undefined ? (updates.desc || undefined) : f.desc,
            type: updates.type !== undefined ? updates.type : f.type,
            children: newName !== f.name ? rebuildChildPaths(newChildren, newPath) : newChildren,
          }
        }
        if (f.children) {
          return { ...f, children: updateInFields(f.children) }
        }
        return f
      })
    }
    const updated = updateInFields(data.fields)
    updateJsonNodeFields?.(id, updated, renamedPaths.length > 0 ? { renamedPaths } : undefined)
  }, [id, data.fields, updateJsonNodeFields])

  // Add a child field to a parent (object/array) field
  const handleAddChild = useCallback((parentPath: string[]) => {
    // Find the parent to determine a unique child name
    const findField = (fields: Field[], path: string[]): Field | undefined => {
      for (const f of fields) {
        if (f.path.join('.') === path.join('.')) return f
        if (f.children) {
          const found = findField(f.children, path)
          if (found) return found
        }
      }
      return undefined
    }
    const parent = findField(data.fields, parentPath)
    const existing = parent?.children || []
    let childName = 'new_field'
    if (existing.some(c => c.name === childName)) {
      let i = 2
      while (existing.some(c => c.name === `new_field_${i}`)) i++
      childName = `new_field_${i}`
    }

    const newChild: Field = {
      id: generateId(),
      name: childName,
      path: [...parentPath, childName],
      type: 'string',
      example: '',
    }

    const addChildToFields = (fields: Field[]): Field[] => {
      return fields.map((f) => {
        if (f.path.join('.') === parentPath.join('.')) {
          return {
            ...f,
            type: f.type === 'string' || f.type === 'number' || f.type === 'boolean' ? 'object' : f.type,
            children: [...(f.children || []), newChild],
          }
        }
        if (f.children) {
          return { ...f, children: addChildToFields(f.children) }
        }
        return f
      })
    }
    updateJsonNodeFields?.(id, addChildToFields([...data.fields]))
  }, [id, data.fields, updateJsonNodeFields])

  return (
    <div
      className={`
        json-node-wrapper group/node rounded-lg min-w-[280px] transition-colors duration-200
        ${selected ? 'ring-1 ring-blue-500' : ''}
      `}
      style={{
        backgroundColor: '#ffffff',
        border: `1px solid ${selected ? '#3b82f6' : '#e5e5e5'}`,
      }}
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
      <div
        className="group/header px-4 py-3 rounded-t-lg flex items-center gap-2.5"
        style={{ borderBottom: '1px solid #e2e8f0', color: '#0f172a' }}
      >
        {/* Node name - editable */}
        {isRenaming ? (
          <div className="flex-1 flex items-center gap-1">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) handleConfirmRename()
                if (e.key === 'Escape') handleCancelRename()
              }}
              className="flex-1 px-2 py-0.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' }}
              autoFocus
            />
            <button
              onClick={handleConfirmRename}
              className="p-1 rounded transition-colors"
              style={{ color: '#10b981' }}
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancelRename}
              className="p-1 rounded transition-colors"
              style={{ color: '#64748b' }}
            >
              <X size={14} />
            </button>
          </div>
        ) : isEditingUrl ? (
          <div className="flex-1 flex items-center gap-1">
            <input
              type="text"
              value={editedUrl}
              onChange={(e) => setEditedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) handleConfirmUrl()
                if (e.key === 'Escape') handleCancelUrl()
              }}
              placeholder="https://..."
              className="flex-1 px-2 py-0.5 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' }}
              autoFocus
            />
            <button
              onClick={handleConfirmUrl}
              className="p-1 rounded transition-colors"
              style={{ color: '#10b981' }}
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancelUrl}
              className="p-1 rounded transition-colors"
              style={{ color: '#64748b' }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            {data.url ? (
              <a
                href={sanitizeNodeUrl(data.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="nodrag font-semibold text-sm tracking-wide flex-1 hover:underline"
                style={{ color: '#3b82f6' }}
                title={data.url}
              >
                {data.name}
              </a>
            ) : (
              <span className="font-semibold text-sm tracking-wide flex-1" style={{ color: '#0f172a' }}>{data.name}</span>
            )}
            {/* Action buttons - show on node hover or when selected */}
            <div className={`nodrag node-actions flex items-center gap-0.5 transition-opacity ${selected ? 'opacity-100' : ''}`}>
              <button
                onClick={() => setRawEditNode?.(id)}
                className="node-btn node-btn-rename p-1"
                title={t('resources.dataflow.node.rawEditor')}
              >
                <Code2 size={12} />
              </button>
              <button
                onClick={handleStartEditUrl}
                className={`node-btn p-1 ${data.url ? 'node-btn-link-active' : 'node-btn-link'}`}
                title={data.url ? t('resources.dataflow.node.editLink', { url: data.url }) : t('resources.dataflow.node.addLink')}
              >
                <Link2 size={12} />
              </button>
              <button
                onClick={handleStartRename}
                className="node-btn node-btn-rename p-1"
                title={t('resources.dataflow.node.renameNode')}
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={handleDuplicate}
                className="node-btn node-btn-duplicate p-1"
                title={t('resources.dataflow.node.duplicateNode')}
              >
                <Copy size={12} />
              </button>
              <button
                onClick={handleDelete}
                className="node-btn node-btn-delete p-1"
                title={t('resources.dataflow.node.deleteNode')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Fields - now rendered recursively */}
      <div className="py-2">
        {data.fields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            depth={0}
            nodeId={id}
            parentPath={null}
            onRemove={handleRemoveField}
            onUpdateField={handleUpdateField}
            onAddChild={handleAddChild}
            connectedHandles={connectedHandles}
            dragState={dragState}
            onDragStart={handleFieldDragStart}
            onDragOver={handleFieldDragOver}
            onDragEnd={handleFieldDragEnd}
            onDrop={handleFieldDrop}
          />
        ))}

        {/* Add Field Form */}
        {isAdding ? (
          <div className="nodrag px-3 pt-2 mt-1" style={{ borderTop: '1px solid #e2e8f0' }}>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder={t('resources.dataflow.node.fieldNamePlaceholder')}
                className="flex-1 px-2 py-1.5 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b' }}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldExample}
                onChange={(e) => setNewFieldExample(e.target.value)}
                placeholder={t('resources.dataflow.node.exampleValuePlaceholder')}
                className="flex-1 px-2 py-1.5 text-xs rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b' }}
                onKeyDown={(e) => e.key === 'Enter' && !isImeComposing(e) && handleAddField()}
              />
              <button
                onClick={handleAddObjectField}
                className="px-1.5 py-1 rounded transition-colors text-[11px] font-mono font-bold"
                style={{ color: '#3b82f6', border: '1px solid #bfdbfe' }}
                title={t('resources.dataflow.node.addAsObject')}
              >
                {'{ }'}
              </button>
              <button
                onClick={handleAddField}
                className="p-1.5 rounded transition-colors"
                style={{ color: '#10b981' }}
              >
                <Check size={14} />
              </button>
              <button
                onClick={handleCancel}
                className="p-1.5 rounded transition-colors"
                style={{ color: '#64748b' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full mt-1 py-2 text-xs flex items-center justify-center gap-1 transition-colors hover:bg-black/5"
            style={{ color: '#64748b', borderTop: '1px solid #e2e8f0' }}
          >
            <Plus size={12} />
            <span>{t('resources.dataflow.node.addField')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

function formatExample(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.length <= 2) return JSON.stringify(value)
    return `[${value.length} items]`
  }
  if (typeof value === 'string') {
    // No JS-side slice (card 249e596f): this used to cut strings at 10 chars,
    // which is what actually rendered a retirement date as "⛔ 2026-09-...".
    // Overflow is the value cell's CSS concern (truncate + max-w + title
    // tooltip) — cutting here threw the tail away before CSS could decide.
    return `"${value}"`
  }
  if (typeof value === 'object') {
    return '{...}'
  }
  return String(value)
}

export default memo(JsonNode)
