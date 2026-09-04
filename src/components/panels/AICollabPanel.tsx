import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, MessageSquareText, ClipboardCopy, ClipboardPaste, Check, BotMessageSquare, PanelRightClose } from 'lucide-react'
import { useNotify } from '../../host'
import { useFlowStore } from '../../store/flowStoreContext'
import { importPastedGraph, PASTE_FAILURE_KEYS } from '../../store/pasteImport'
import { DATAFLOW_COPY_PROMPT, buildGraphForEditing } from '../../utils/graphToPrompt'
import type { ViewportRect } from '../../store/editPlan'

/**
 * The "AI Collaborate" DOCK: the whole external-chat round trip in one place, as
 * numbered steps (task 5b0bfd1e A, design notes d48020cd position 1 + faa64fe3 v3).
 *
 * Docked to the right of the canvas, not a popup — the owner's requirement (2026-09-04)
 * is to keep it open WHILE editing the diagram, so it takes real width from the canvas
 * (an overlay would cover nodes he is editing) and folds to a zero-width edge tab.
 * Three behaviors follow from "keep it while I edit", all deliberate:
 *   - the component stays MOUNTED when folded (hidden via CSS), so a half-written
 *     answer and the "copied" feedback survive fold/unfold;
 *   - a successful import does NOT close the dock — the round trip is rarely one
 *     round, so the textarea clears and the panel stays for the next paste;
 *   - whether it was left open is remembered by the parent (localStorage).
 *
 * This panel exists because the round trip used to be spread over controls whose names
 * did not mention each other — the way out was "Copy as Prompt", the way back was a
 * panel called "Import Graph JSON". The fix is naming, not plumbing: it is a THIN face
 * over the same machinery as every other paste entry — step 3 calls importPastedGraph,
 * the shared pipeline behind canvas Ctrl+V and the playground toolbar, so the doors
 * cannot drift apart and every failure keeps its specific name, shown inline.
 *
 * Distinct from AIGeneratePanel on purpose: that one needs a host-configured model;
 * this one is for any external chat and needs no key.
 */

const DOCK_WIDTH = 360

interface AICollabPanelProps {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  getViewportCenter?: () => { x: number; y: number }
  getViewportRect?: () => ViewportRect
}

const stepBadge = (n: string) => (
  <span
    className="inline-flex items-center justify-center rounded-full text-xs font-semibold shrink-0"
    style={{ width: '22px', height: '22px', backgroundColor: '#ede9fe', color: '#7c3aed' }}
  >
    {n}
  </span>
)

export default function AICollabPanel({ expanded, onExpandedChange, getViewportCenter, getViewportRect }: AICollabPanelProps) {
  const { t } = useTranslation()
  const notify = useNotify()
  const flowStore = useFlowStore()
  const importGraph = flowStore((state) => state.importGraph)
  const setImportSummary = flowStore((state) => state.setImportSummary)
  const applyEditPlan = flowStore((state) => state.applyEditPlan)
  const [answerText, setAnswerText] = useState('')
  const [error, setError] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [graphCopied, setGraphCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(DATAFLOW_COPY_PROMPT)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch (e) {
      notify('error', t('resources.dataflow.toolbar.copyFailed'), e)
    }
  }

  const handleCopyGraph = async () => {
    const state = flowStore.getState()
    const graph = buildGraphForEditing(state.nodes, state.pipes)
    if (graph.nodeCount === 0) {
      notify('info', t('resources.dataflow.graphForEditingEmpty'))
      return
    }
    try {
      await navigator.clipboard.writeText(graph.text)
      setGraphCopied(true)
      setTimeout(() => setGraphCopied(false), 2000)
      if (graph.degraded) {
        notify('info', t('resources.dataflow.paste.graphForEditingTrimmed', { n: graph.nodeCount }))
      }
    } catch (e) {
      notify('error', t('resources.dataflow.toolbar.copyFailed'), e)
    }
  }

  const runImport = (text: string) => {
    setError('')
    if (!text.trim()) {
      setError(t('resources.dataflow.panel.enterOrUpload'))
      return
    }
    // Same pipeline as canvas Ctrl+V and the toolbar entry — unwrap fence/prose,
    // dispatch JSON vs commands, refuse retired dialects by name (pasteImport.ts).
    const outcome = importPastedGraph(text, { importGraph, applyEditPlan, setImportSummary }, {
      center: getViewportCenter?.(),
      rect: getViewportRect?.(),
    })
    if (!outcome.ok) {
      setError(t(PASTE_FAILURE_KEYS[outcome.reason]))
      return
    }
    // Clear, but stay open: the next round's paste door should still be at hand.
    // ImportSummaryBar reports what landed.
    setAnswerText('')
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setAnswerText(e.target?.result as string)
      setError('')
    }
    reader.onerror = () => setError(t('resources.dataflow.panel.readFileFailed'))
    reader.readAsText(file)
    event.target.value = ''
  }

  const stepTitleStyle = { color: '#1e293b' }
  const stepDescStyle = { color: '#64748b' }

  return (
    <div className="relative shrink-0 h-full" style={{ width: expanded ? DOCK_WIDTH : 0 }}>
      {/* Folded: a zero-width dock plus an edge tab hanging over the canvas — no
          permanent rail, so people who never use the round trip pay no width for it. */}
      {!expanded && (
        <button
          onClick={() => onExpandedChange(true)}
          className="absolute z-10 flex items-center justify-center rounded-l-lg transition-colors hover:bg-violet-50"
          style={{
            top: '72px',
            right: 0,
            width: '32px',
            height: '40px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRight: 'none',
            color: '#7c3aed',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
          }}
          title={t('resources.dataflow.menu.aiCollab')}
        >
          <BotMessageSquare size={16} />
        </button>
      )}

      {/* Stays mounted while folded — display:none, state intact */}
      <div
        className="h-full flex-col"
        style={{
          display: expanded ? 'flex' : 'none',
          width: DOCK_WIDTH,
          backgroundColor: '#ffffff',
          borderLeft: '1px solid #e2e8f0',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <div>
            <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>
              {t('resources.dataflow.aiCollab.title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
              {t('resources.dataflow.aiCollab.subtitle')}
            </p>
          </div>
          <button
            onClick={() => onExpandedChange(false)}
            className="p-1.5 rounded-lg transition-colors hover:bg-slate-200 shrink-0"
            style={{ color: '#64748b' }}
            title={t('resources.dataflow.aiCollab.fold')}
          >
            <PanelRightClose size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          {/* Step 1 — copy the prompt */}
          <div className="flex items-start gap-3">
            {stepBadge('1')}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={stepTitleStyle}>
                {t('resources.dataflow.aiCollab.step1Title')}
              </div>
              <p className="text-xs mt-0.5" style={stepDescStyle}>
                {t('resources.dataflow.aiCollab.step1Desc')}
              </p>
              <button
                onClick={handleCopyPrompt}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={promptCopied
                  ? { color: '#15803d', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }
                  : { color: '#334155', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
              >
                {promptCopied ? <Check size={14} /> : <MessageSquareText size={14} />}
                {t(promptCopied ? 'resources.dataflow.aiCollab.copied' : 'resources.dataflow.aiCollab.copyPrompt')}
              </button>
            </div>
          </div>

          {/* Step 2 — optional: copy the current diagram */}
          <div className="flex items-start gap-3">
            {stepBadge('2')}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={stepTitleStyle}>
                {t('resources.dataflow.aiCollab.step2Title')}
              </div>
              <p className="text-xs mt-0.5" style={stepDescStyle}>
                {t('resources.dataflow.aiCollab.step2Desc')}
              </p>
              <button
                onClick={handleCopyGraph}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={graphCopied
                  ? { color: '#15803d', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }
                  : { color: '#334155', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
              >
                {graphCopied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                {t(graphCopied ? 'resources.dataflow.aiCollab.copied' : 'resources.dataflow.copyGraphForEditing')}
              </button>
            </div>
          </div>

          {/* Step 3 — paste the answer */}
          <div className="flex items-start gap-3">
            {stepBadge('3')}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={stepTitleStyle}>
                    {t('resources.dataflow.aiCollab.step3Title')}
                  </div>
                  <p className="text-xs mt-0.5" style={stepDescStyle}>
                    {t('resources.dataflow.aiCollab.step3Desc')}
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-medium flex items-center gap-1 shrink-0"
                  style={{ color: '#3b82f6' }}
                >
                  <Upload size={12} />
                  {t('resources.dataflow.panel.uploadFile')}
                </button>
              </div>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={t('resources.dataflow.aiCollab.answerPlaceholder')}
                className="w-full px-3 py-2.5 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow resize-y"
                style={{
                  height: '160px',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  backgroundColor: '#ffffff',
                }}
              />
              {error && (
                <div
                  className="text-sm px-3 py-2.5 rounded-lg mt-2"
                  style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
                >
                  {error}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt,application/json,text/plain"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
        >
          <button
            onClick={() => runImport(answerText)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: '#ffffff', backgroundColor: '#7c3aed', borderRadius: '6px' }}
          >
            <ClipboardPaste size={14} />
            {t('resources.dataflow.aiCollab.importAnswer')}
          </button>
        </div>
      </div>
    </div>
  )
}
