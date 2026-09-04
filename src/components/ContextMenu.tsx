import { Plus, BotMessageSquare, Sparkles, StickyNote, Group, FileIcon, Layers, Hexagon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onCreateNode: () => void
  onCreateNote: () => void
  onCreateResource: () => void
  onCreateGroup: () => void
  onCreateShape: () => void
  onShowElements: () => void
  onOpenAICollab?: () => void
  onAIGenerate?: () => void
}

export default function ContextMenu({ x, y, onClose, onCreateNode, onCreateNote, onCreateResource, onCreateGroup, onCreateShape, onShowElements, onOpenAICollab, onAIGenerate }: ContextMenuProps) {
  const { t } = useTranslation()
  return (
    <>
      {/* Backdrop to close menu */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />

      {/* Menu — clamped so right-clicks near the viewport edge don't render
          it partially offscreen (menu is ~200px wide, ~420px tall fully open) */}
      <div
        className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[180px]"
        style={{
          left: Math.max(0, Math.min(x, window.innerWidth - 200)),
          top: Math.max(0, Math.min(y, window.innerHeight - 430)),
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
        }}
      >
        <button
          onClick={() => {
            onCreateNode()
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
          style={{ color: '#1e293b' }}
        >
          <Plus size={14} style={{ color: '#64748b' }} />
          {t('resources.dataflow.menu.createNode')}
        </button>
        <button
          onClick={() => {
            onCreateNote()
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
          style={{ color: '#1e293b' }}
        >
          <StickyNote size={14} style={{ color: '#d97706' }} />
          {t('resources.dataflow.menu.addNote')}
        </button>
        <button
          onClick={() => {
            onCreateResource()
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
          style={{ color: '#1e293b' }}
        >
          <FileIcon size={14} style={{ color: '#0ea5e9' }} />
          {t('resources.dataflow.menu.addResource')}
        </button>
        <button
          onClick={() => {
            onCreateGroup()
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
          style={{ color: '#1e293b' }}
        >
          <Group size={14} style={{ color: '#3b82f6' }} />
          {t('resources.dataflow.menu.addGroup')}
        </button>
        <button
          onClick={() => {
            onCreateShape()
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
          style={{ color: '#1e293b' }}
        >
          <Hexagon size={14} style={{ color: '#6366f1' }} />
          {t('resources.dataflow.menu.addShape')}
        </button>
        <button
          onClick={() => {
            onShowElements()
            onClose()
          }}
          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
          style={{ color: '#1e293b' }}
        >
          <Layers size={14} style={{ color: '#475569' }} />
          {t('resources.dataflow.menu.elementsPanel')}
        </button>
        <div className="my-1" style={{ borderTop: '1px solid #e2e8f0' }} />
        {onOpenAICollab && (
          <>
            <div className="my-1" style={{ borderTop: '1px solid #e2e8f0' }} />
            <button
              onClick={() => {
                onOpenAICollab()
                onClose()
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
              style={{ color: '#1e293b' }}
            >
              <BotMessageSquare size={14} style={{ color: '#7c3aed' }} />
              {t('resources.dataflow.menu.aiCollab')}
            </button>
          </>
        )}
        {onAIGenerate && (
          <>
            <div className="my-1" style={{ borderTop: '1px solid #e2e8f0' }} />
            <button
              onClick={() => {
                onAIGenerate()
                onClose()
              }}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-slate-100"
              style={{ color: '#1e293b' }}
            >
              <Sparkles size={14} style={{ color: '#7c3aed' }} />
              {t('resources.dataflow.menu.aiGenerate')}
            </button>
          </>
        )}
      </div>
    </>
  )
}
