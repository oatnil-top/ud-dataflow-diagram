import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFlowStore } from '../../store/flowStoreContext'
import type { SetOperation } from '../../utils/fieldSetOps'
import { SET_OP_SYMBOLS } from '../../utils/fieldSetOps'

const operations: { op: SetOperation; label: string; tooltipKey: string }[] = [
  { op: 'union', label: SET_OP_SYMBOLS.union, tooltipKey: 'resources.dataflow.setOp.union' },
  { op: 'intersection', label: SET_OP_SYMBOLS.intersection, tooltipKey: 'resources.dataflow.setOp.intersection' },
  { op: 'difference', label: `A${SET_OP_SYMBOLS.difference}B`, tooltipKey: 'resources.dataflow.setOp.difference' },
  { op: 'complement', label: `B${SET_OP_SYMBOLS.complement}A`, tooltipKey: 'resources.dataflow.setOp.complement' },
]

interface SetOperationToolbarProps {
  selectedNodeIds: string[]
}

export default function SetOperationToolbar({ selectedNodeIds }: SetOperationToolbarProps) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const nodes = flowStore((state) => state.nodes)
  const generateSetOperation = flowStore((state) => state.generateSetOperation)

  // Only show when exactly 2 JSON nodes are selected
  const jsonNodeIds = useMemo(() => {
    return selectedNodeIds.filter((id) => {
      const node = nodes.find((n) => n.id === id)
      return node?.type === 'json'
    })
  }, [selectedNodeIds, nodes])

  if (jsonNodeIds.length !== 2) return null

  const [idA, idB] = jsonNodeIds
  const nameA = nodes.find((n) => n.id === idA)?.data?.name as string || 'A'
  const nameB = nodes.find((n) => n.id === idB)?.data?.name as string || 'B'

  const handleOp = (op: SetOperation) => {
    generateSetOperation?.(idA, idB, op)
  }

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-slate-200 px-2 py-1.5">
      <span className="text-xs text-slate-500 px-1 truncate max-w-[80px]" title={nameA}>{nameA}</span>
      <span className="text-xs text-slate-300">&amp;</span>
      <span className="text-xs text-slate-500 px-1 truncate max-w-[80px]" title={nameB}>{nameB}</span>
      <div className="w-px h-5 bg-slate-200 mx-1" />
      {operations.map(({ op, label, tooltipKey }) => (
        <button
          key={op}
          onClick={() => handleOp(op)}
          className="px-2.5 py-1 text-sm font-mono rounded hover:bg-slate-100 transition-colors"
          style={{ color: '#334155' }}
          title={t(tooltipKey)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
