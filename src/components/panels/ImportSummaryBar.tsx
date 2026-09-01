import { useTranslation } from 'react-i18next'
import { X, Undo2 } from 'lucide-react'
import { useFlowStore } from '../../store/flowStoreContext'

/**
 * What the last paste actually did, and the way back out of it.
 *
 * Partial success is the deliberate policy (design fb629b6a §Q3): nine nodes out of ten
 * land, and this bar is the other half of that bargain — without it the user counts
 * nodes and concludes the feature is broken, which is what silently dropping edges looks
 * like today. Undo is offered inline because "press Ctrl+Z" is not an answer for someone
 * who does not yet know anything went wrong.
 *
 * Rendered from store state (flowStore `importSummary`) rather than props: three entry
 * points produce a summary and only this one component shows it.
 */
export default function ImportSummaryBar() {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const summary = flowStore((state) => state.importSummary)
  const setImportSummary = flowStore((state) => state.setImportSummary)
  const undo = flowStore((state) => state.undo)
  const canUndo = flowStore((state) => state.canUndo)

  if (!summary) return null

  const { addedNodes, addedPipes, skippedNodes, skippedPipes, droppedPipes } = summary
  const nothingHappened = addedNodes === 0 && addedPipes === 0

  const notes: string[] = []
  if (skippedNodes > 0) notes.push(t('resources.dataflow.paste.skippedNodes', { n: skippedNodes }))
  if (skippedPipes > 0) notes.push(t('resources.dataflow.paste.skippedPipes', { n: skippedPipes }))
  if (droppedPipes.length > 0) {
    notes.push(t('resources.dataflow.paste.droppedPipes', {
      n: droppedPipes.length,
      // Name one missing endpoint: enough to recognise the mistake, short enough to read.
      endpoint: droppedPipes[0].target,
    }))
  }

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg"
      style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', maxWidth: 'calc(100vw - 2rem)' }}
    >
      <div className="text-sm" style={{ color: '#334155' }}>
        <span className="font-medium">
          {nothingHappened
            ? t('resources.dataflow.paste.nothingAdded')
            : t('resources.dataflow.paste.added', { nodes: addedNodes, pipes: addedPipes })}
        </span>
        {notes.length > 0 && (
          <span style={{ color: '#64748b' }}>{` · ${notes.join(' · ')}`}</span>
        )}
      </div>
      {!nothingHappened && canUndo && (
        <button
          onClick={() => {
            undo()
            setImportSummary(null)
          }}
          className="flex items-center gap-1 text-sm font-medium px-2 py-1 rounded transition-colors hover:bg-slate-100"
          style={{ color: '#3b82f6' }}
        >
          <Undo2 size={14} />
          {t('resources.dataflow.paste.undo')}
        </button>
      )}
      <button
        onClick={() => setImportSummary(null)}
        className="p-1 rounded transition-colors hover:bg-slate-100"
        style={{ color: '#94a3b8' }}
        aria-label={t('resources.dataflow.paste.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  )
}
