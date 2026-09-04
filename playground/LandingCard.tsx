import { useState } from 'react'

/**
 * The one piece of chrome the playground adds outside the editor.
 *
 * The package puts every control on the left (Toolbar.tsx:202 `top-2 left-2`,
 * IconSidebar.tsx:125 `top-14 left-2`) and has zero `right-` positioning, so the top-right
 * corner is the only place a card can sit without covering something. It mirrors the icon
 * sidebar's `top-14`, not the toolbar's `top-2`, because the editor's own header bar owns
 * the first 48px of the page.
 *
 * `fixed` + z-[60] rather than `absolute` + z-10: the editor root is `fixed inset-0 z-50`
 * (DataflowEditor.tsx:223), so a card below that z never appears at all.
 *
 * Closable (owner, 2026-09-04), and the dismissal is remembered — a promo card that
 * comes back every reload is nagware. It also matters more now that the AI Collaborate
 * dock lives on the right: dismissing the card frees that corner. Still one <a> for the
 * whole card body, no overlay, no tracking pixel.
 */

const DISMISS_KEY = 'dataflow-playground:landing-card-dismissed'

export function LandingCard() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // storage unavailable — closes for this visit only
    }
  }

  return (
    <div className="fixed top-14 right-2 sm:right-4 z-[60] flex items-center h-14 max-w-[320px] rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 hover:border-slate-300">
      <a href="https://oatnil.com/?ref=dataflow-playground" target="_blank" rel="noopener"
         className="flex items-center gap-2 pl-3 pr-1 py-2">
        <img src="/favicon.svg" width={20} height={20} alt="" />
        <span><b>UnDercontrol</b> — the diagram editor your agents draw with. <span className="underline">See how →</span></span>
      </a>
      <button
        onClick={dismiss}
        aria-label="Close"
        title="Close"
        className="self-start mt-1 mr-1 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  )
}
