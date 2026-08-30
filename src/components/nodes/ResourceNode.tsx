import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { NodeResizer, useUpdateNodeInternals, type NodeProps, type Node } from '@xyflow/react'
import { Pencil, Check, X, Trash2, FileIcon, Link2, Code2, Loader2, ImageOff, RefreshCw } from 'lucide-react'
import type { ResourceNodeData } from '../../types'
import { useFlowStore } from '../../store/flowStoreContext'
import { sanitizeNodeUrl } from '../../utils/sanitizeUrl'
import { useDiagramContext } from '../../diagramContext'
import { useDataflowHost, useNotify, type ResourceResolution } from '../../host'
import NodePerimeterHandles, { handleStyle } from './NodePerimeterHandles'
import { isImeComposing } from '../../utils/ime'

type ResourceNodeType = Node<ResourceNodeData, 'resource'>

function ResourceNode({ id, data, selected }: NodeProps<ResourceNodeType>) {
  const { t } = useTranslation()
  const updateNodeInternals = useUpdateNodeInternals()
  const flowStore = useFlowStore()
  const updateResourceNode = flowStore((state) => state.updateResourceNode)
  const updateNodeUrl = flowStore((state) => state.updateNodeUrl)
  const removeNode = flowStore((state) => state.removeNode)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(data.name)
  const [isEditingLink, setIsEditingLink] = useState(false)
  const [linkValue, setLinkValue] = useState(data.url || '')
  const [hovered, setHovered] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolve resourceId to a presigned URL — through THIS diagram, so a shared
  // diagram shows its pictures without the pictures themselves being shared.
  //
  // The result is kept whole rather than reduced to a URL-or-null. An image can
  // fail to resolve because it was deleted, because this diagram does not grant
  // it, or because the request itself failed, and a node that renders the same
  // empty box for all three tells the user nothing — which is what it used to do
  // (`catch { return null }`, and then an empty node).
  const diagram = useDiagramContext()
  const host = useDataflowHost()
  const notify = useNotify()
  const resources = host.resources
  const [resolution, setResolution] = useState<ResourceResolution | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!data.resourceId) { setResolution(null); return }
    let cancelled = false
    setResolution(null)
    // `diagram` goes through untouched — it is what authorizes a non-owner viewing a
    // shared diagram. A host with no `resources` cannot answer at all, which is a
    // different thing from an image that is gone, but the node has nothing better to say.
    const pending = resources
      ? resources.resolve(data.resourceId, diagram)
      : Promise.resolve<ResourceResolution>({ status: 'unavailable' })
    pending.then((r) => {
      if (!cancelled) setResolution(r)
    })
    return () => { cancelled = true }
  }, [data.resourceId, diagram, resources, retryCount])

  // Legacy inline `src` still renders: diagrams written before images became
  // resource references carry their bytes in the node, and card [4] is what
  // converts the last of them.
  const resolvedUrl = resolution?.status === 'ok' ? resolution.url : null
  const displayUrl = resolvedUrl || data.src || null
  // A failure only counts when there is nothing else to show.
  const failure = !displayUrl && resolution && resolution.status !== 'ok' ? resolution : null

  useEffect(() => { setNameValue(data.name) }, [data.name])
  useEffect(() => { setLinkValue(data.url || '') }, [data.url])

  // Update node internals when collapsed state changes so handles reposition correctly
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, data.collapsed, updateNodeInternals])

  const toggleCollapsed = useCallback(() => {
    updateResourceNode?.(id, { collapsed: !data.collapsed })
  }, [id, data.collapsed, updateResourceNode])

  const saveName = useCallback(() => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== data.name) {
      updateResourceNode?.(id, { name: trimmed })
    } else {
      setNameValue(data.name)
    }
    setIsEditingName(false)
  }, [id, nameValue, data.name, updateResourceNode])

  // Uploading is the host's job — see host.ts `resources.upload`. Every affordance that
  // reaches this is hidden when the host has none, so the guard is belt-and-braces.
  const canUpload = !!resources?.upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!resources?.upload) return
    setUploading(true)
    try {
      const { resourceId } = await resources.upload(file)
      updateResourceNode?.(id, {
        resourceId,
        mimeType: file.type,
        name: data.name === 'Resource' ? file.name : data.name,
      })
    } catch (err) {
      console.error('Failed to upload resource:', err)
      notify('error', t('resources.dataflow.node.uploadFailed'), err)
    } finally {
      setUploading(false)
    }
  }, [id, data.name, updateResourceNode, resources, notify, t])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canUpload) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [canUpload])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.kind === 'file') {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) handleFileUpload(file)
        return
      }
    }
  }, [handleFileUpload])

  const handleClass = handleStyle('sky', hovered || selected)

  // Collapsed: small square with icon, double-click to expand
  if (data.collapsed) {
    return (
      <div
        className={`rounded-lg border w-8 h-8 flex items-center justify-center cursor-pointer ${
          selected ? 'border-sky-400' : 'border-sky-200'
        }`}
        style={{ backgroundColor: '#e0f2fe' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={toggleCollapsed}
        title={data.name}
      >
        <NodePerimeterHandles className={handleClass} />
        <FileIcon size={14} className="text-sky-600" />
      </div>
    )
  }

  // Expanded: full resource node
  return (
    <div
      className={`rounded-lg border w-full h-full ${
        selected ? 'border-sky-400 ring-1 ring-sky-400' : 'border-sky-200'
      } ${isDragOver ? 'ring-2 ring-sky-400' : ''}`}
      style={{ backgroundColor: '#f0f9ff' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <NodeResizer
        minWidth={120}
        minHeight={80}
        isVisible={selected}
        lineClassName="!border-sky-400"
        handleClassName="!w-2.5 !h-2.5 !bg-sky-400 !border-2 !border-white !rounded"
      />
      <NodePerimeterHandles className={handleClass} />

      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-sky-200"
        style={{ backgroundColor: '#e0f2fe' }}
      >
        <button
          onClick={toggleCollapsed}
          className="p-0.5 rounded hover:bg-sky-200 transition-colors text-sky-600"
          title={t('resources.dataflow.node.collapse')}
        >
          <FileIcon size={14} />
        </button>

        {isEditingName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) saveName()
                if (e.key === 'Escape') { setNameValue(data.name); setIsEditingName(false) }
              }}
              className="flex-1 min-w-0 px-1 py-0.5 text-xs font-semibold rounded border border-sky-300 bg-white text-sky-900 focus:outline-none focus:ring-1 focus:ring-sky-400"
              autoFocus
            />
            <button onClick={saveName} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
              <Check size={12} />
            </button>
            <button onClick={() => { setNameValue(data.name); setIsEditingName(false) }} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
              <X size={12} />
            </button>
          </div>
        ) : isEditingLink ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) { updateNodeUrl?.(id, linkValue.trim() || undefined); setIsEditingLink(false) }
                if (e.key === 'Escape') { setLinkValue(data.url || ''); setIsEditingLink(false) }
              }}
              placeholder="https://..."
              className="flex-1 min-w-0 px-1 py-0.5 text-xs rounded border border-sky-300 bg-white text-sky-900 focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono"
              autoFocus
            />
            <button onClick={() => { updateNodeUrl?.(id, linkValue.trim() || undefined); setIsEditingLink(false) }} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
              <Check size={12} />
            </button>
            <button onClick={() => { setLinkValue(data.url || ''); setIsEditingLink(false) }} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            {data.url ? (
              <a
                href={sanitizeNodeUrl(data.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="nodrag flex-1 text-xs font-semibold truncate hover:underline"
                style={{ color: '#0369a1' }}
                title={data.url}
              >
                {data.name}
              </a>
            ) : (
              <span
                className="flex-1 text-xs font-semibold text-sky-900 truncate cursor-pointer"
                onDoubleClick={() => setIsEditingName(true)}
              >
                {data.name}
              </span>
            )}
          </>
        )}

        {!isEditingName && !isEditingLink && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setRawEditNode?.(id)}
              className="p-0.5 rounded hover:bg-sky-200 transition-colors text-sky-500"
              title={t('resources.dataflow.node.rawEditor')}
            >
              <Code2 size={11} />
            </button>
            <button
              onClick={() => { setLinkValue(data.url || ''); setIsEditingLink(true) }}
              className={`p-0.5 rounded hover:bg-sky-200 transition-colors ${data.url ? 'text-sky-700' : 'text-sky-400'}`}
              title={data.url ? t('resources.dataflow.node.editLink', { url: data.url }) : t('resources.dataflow.node.addLink')}
            >
              <Link2 size={11} />
            </button>
            <button
              onClick={() => setIsEditingName(true)}
              className="p-0.5 rounded hover:bg-sky-200 transition-colors text-sky-500"
              title={t('resources.dataflow.node.rename')}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={() => removeNode?.(id)}
              className="p-0.5 rounded hover:bg-red-100 transition-colors text-sky-400 hover:text-red-500"
              title={t('common.delete')}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Resource body */}
      <div className="px-2 py-2 overflow-hidden" style={{ height: 'calc(100% - 36px)' }}>
        {(uploading || data.uploading) ? (
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <Loader2 size={24} className="text-sky-400 animate-spin" />
            <p className="text-xs text-sky-500">{t('resources.dataflow.node.uploading')}</p>
          </div>
        ) : displayUrl && (data.mimeType?.startsWith('image/') || data.src) ? (
          <div className="relative group w-full h-full">
            <img
              src={displayUrl}
              alt={data.alt || data.name}
              className="w-full h-full rounded object-contain"
              draggable={false}
            />
            {canUpload && (
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded bg-white/80 hover:bg-white text-sky-600 shadow-sm"
                  title={t('resources.dataflow.node.replaceFile')}
                >
                  <FileIcon size={12} />
                </button>
              </div>
            )}
          </div>
        ) : failure ? (
          /* Visible failure. ⛔ Never a blank node — see the resolve effect above. */
          <div className="flex flex-col items-center justify-center h-full gap-1 px-2 text-center">
            <ImageOff size={24} className="text-slate-400" />
            <p className="text-xs text-slate-500">
              {failure.status === 'unavailable'
                ? t('resources.dataflow.node.imageDeleted')
                : failure.status === 'forbidden'
                  ? t('resources.dataflow.node.imageUnavailable')
                  : failure.status === 'no-content'
                    ? t('resources.dataflow.node.imageNoPreview')
                    : t('resources.dataflow.node.imageLoadFailed')}
            </p>
            {/* Only a transport failure is worth retrying; the other three are
                answers, not accidents. */}
            {failure.status === 'error' && (
              <button
                onClick={() => setRetryCount((n) => n + 1)}
                className="flex items-center gap-1 text-[10px] text-sky-600 hover:underline"
              >
                <RefreshCw size={10} />
                {t('common.retry')}
              </button>
            )}
          </div>
        ) : (data.resourceId || displayUrl) ? (
          <div className="relative group flex flex-col items-center justify-center h-full gap-2">
            <FileIcon size={32} className="text-sky-400" />
            <p className="text-xs text-sky-600 truncate max-w-full px-2">{data.name}</p>
            {data.mimeType && (
              <p className="text-[10px] text-sky-400">{data.mimeType}</p>
            )}
            {canUpload && (
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded bg-white/80 hover:bg-white text-sky-600 shadow-sm"
                  title={t('resources.dataflow.node.replaceFile')}
                >
                  <FileIcon size={12} />
                </button>
              </div>
            )}
          </div>
        ) : canUpload ? (
          /* Drop zone — shown when no resource */
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragOver ? 'border-sky-400 bg-sky-50' : 'border-sky-200 hover:border-sky-300'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileIcon size={24} className="mx-auto text-sky-300 mb-1" />
            <p className="text-xs text-sky-500">{t('resources.dataflow.node.dropOrPaste')}</p>
          </div>
        ) : (
          /* No host upload: an empty node, not an invitation that leads nowhere. */
          <div className="flex items-center justify-center h-full">
            <FileIcon size={24} className="text-sky-200" />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      {canUpload && <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileUpload(file)
          e.target.value = ''
        }}
      />}
    </div>
  )
}

export default memo(ResourceNode)
