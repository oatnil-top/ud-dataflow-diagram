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
 * Whole card is one <a>: no close button, no overlay, no tracking pixel.
 */
export function LandingCard() {
  return (
    <a href="https://oatnil.com/?ref=dataflow-playground" target="_blank" rel="noopener"
       className="fixed top-14 right-2 sm:right-4 z-[60] flex items-center gap-2 h-14 max-w-[300px] px-3 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 hover:border-slate-300">
      <img src="/favicon.svg" width={20} height={20} alt="" />
      <span><b>UnDercontrol</b> — the diagram editor your agents draw with. <span className="underline">See how →</span></span>
    </a>
  )
}
