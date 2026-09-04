import { Plus, FileJson, FileStack, BotMessageSquare, Sparkles, StickyNote, Group, FileIcon, Hexagon, Undo2, Redo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CanvasMenuProps {
  onCreateNode: () => void
  onCreateNote: () => void
  onCreateResource: () => void
  onCreateGroup: () => void
  onCreateShape: () => void
  onImportJson: () => void
  onImportJsonl: () => void
  onOpenAICollab: () => void
  onAIGenerate?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
}

export default function CanvasMenu({ onCreateNode, onCreateNote, onCreateResource, onCreateGroup, onCreateShape, onImportJson, onImportJsonl, onOpenAICollab, onAIGenerate, canUndo, canRedo, onUndo, onRedo }: CanvasMenuProps) {
  const { t } = useTranslation()
  return (
    <div
      className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-lg p-1"
      style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
    >
      <button
        onClick={onCreateNode}
        className="p-2 rounded transition-colors hover:bg-slate-100"
        style={{ color: '#64748b' }}
        title={t('resources.dataflow.menu.createNode')}
      >
        <Plus size={16} />
      </button>
      <button
        onClick={onCreateNote}
        className="p-2 rounded transition-colors hover:bg-amber-100"
        style={{ color: '#d97706' }}
        title={t('resources.dataflow.menu.addNote')}
      >
        <StickyNote size={16} />
      </button>
      <button
        onClick={onCreateResource}
        className="p-2 rounded transition-colors hover:bg-sky-100"
        style={{ color: '#0ea5e9' }}
        title={t('resources.dataflow.menu.addResource')}
      >
        <FileIcon size={16} />
      </button>
      <button
        onClick={onCreateGroup}
        className="p-2 rounded transition-colors hover:bg-blue-100"
        style={{ color: '#3b82f6' }}
        title={t('resources.dataflow.menu.addGroup')}
      >
        <Group size={16} />
      </button>
      <button
        onClick={onCreateShape}
        className="p-2 rounded transition-colors hover:bg-indigo-100"
        style={{ color: '#6366f1' }}
        title={t('resources.dataflow.menu.addShape')}
      >
        <Hexagon size={16} />
      </button>
      <button
        onClick={onImportJson}
        className="p-2 rounded transition-colors hover:bg-slate-100"
        style={{ color: '#64748b' }}
        title={t('resources.dataflow.menu.importJson')}
      >
        <FileJson size={16} />
      </button>
      <button
        onClick={onImportJsonl}
        className="p-2 rounded transition-colors hover:bg-slate-100"
        style={{ color: '#64748b' }}
        title={t('resources.dataflow.menu.importJsonl')}
      >
        <FileStack size={16} />
      </button>
      <div className="w-px h-5 mx-0.5" style={{ backgroundColor: '#e2e8f0' }} />
      <button
        onClick={onOpenAICollab}
        className="p-2 rounded transition-colors hover:bg-violet-100"
        style={{ color: '#7c3aed' }}
        title={t('resources.dataflow.menu.aiCollab')}
      >
        <BotMessageSquare size={16} />
      </button>
      {onAIGenerate && (
        <>
          <div className="w-px h-5 mx-0.5" style={{ backgroundColor: '#e2e8f0' }} />
          <button
            onClick={onAIGenerate}
            className="p-2 rounded transition-colors hover:bg-violet-100"
            style={{ color: '#7c3aed' }}
            title={t('resources.dataflow.menu.aiGenerate')}
          >
            <Sparkles size={16} />
          </button>
        </>
      )}
      {onUndo && onRedo && (
        <>
          <div className="w-px h-5 mx-0.5" style={{ backgroundColor: '#e2e8f0' }} />
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-2 rounded transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: '#64748b' }}
            title={t('resources.dataflow.menu.undo')}
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-2 rounded transition-colors hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: '#64748b' }}
            title={t('resources.dataflow.menu.redo')}
          >
            <Redo2 size={16} />
          </button>
        </>
      )}
    </div>
  )
}
