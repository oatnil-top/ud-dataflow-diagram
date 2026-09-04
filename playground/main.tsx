import { createRoot } from 'react-dom/client'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DataflowEditor, DataflowHostContext, registerDataflowMessages } from '@oatnil/ud-dataflow-diagram'
import { usePlaygroundHost } from './host'
import { LandingCard } from './LandingCard'
import { SAMPLE_JSON } from './sample'
import { DOC_KEY } from './byok'
import './index.css'

/**
 * The package's own strings mount under `resources.dataflow.*` (locales/register.ts:20).
 * The eight `common.*` keys below are the host's to supply — the package calls them for
 * its Save / Cancel / Delete buttons, and a host that supplies none ships an editor whose
 * buttons read "common.save". Values are ud's (i18n/locales/{en,zh}/common.json).
 */
const HOST_STRINGS = {
  en: { common: { cancel: 'Cancel', create: 'Create', delete: 'Delete', edit: 'Edit', retry: 'Retry', save: 'Save', saveAndClose: 'Save & Close', status: { error: 'Error' } } },
  zh: { common: { cancel: '取消', create: '创建', delete: '删除', edit: '编辑', retry: '重试', save: '保存', saveAndClose: '保存并关闭', status: { error: '错误' } } },
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: HOST_STRINGS.en }, zh: { translation: HOST_STRINGS.zh } },
  lng: navigator.language.startsWith('zh') ? 'zh' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})
registerDataflowMessages(i18n)

function App() {
  const { host, status, clearStatus, useOfficialEndpoint } = usePlaygroundHost()
  // A returning visitor sees their own diagram; a first visit sees the sample.
  const initial = localStorage.getItem(DOC_KEY) ?? SAMPLE_JSON

  return (
    <DataflowHostContext.Provider value={host}>
      <DataflowEditor
        initialContent={initial}
        onSaveGraph={async (g) => { localStorage.setItem(DOC_KEY, g) }}
        // No onClose, and autosave (owner, 2026-09-04): the editor IS this page — close,
        // Save & Close, and the Save button are all embed furniture here. Edits write to
        // localStorage on pause; Ctrl+S still saves immediately for muscle memory. History
        // worth keeping: close used to `removeItem(DOC_KEY)` (every close silently wiped
        // the visitor's diagram), then `location.reload()` (dropped unsaved edits) — both
        // were answers to a question the page should never have asked.
        autoSave
      />
      <LandingCard />
      {status && (
        <div className="fixed bottom-0 inset-x-0 z-50 border-t bg-white px-4 py-3 text-sm">
          <div className="mx-auto flex max-w-3xl items-start gap-3">
            <div className="flex-1">
              <div className={status.kind === 'error' ? 'font-medium text-destructive' : 'font-medium'}>{status.title}</div>
              {status.body && <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{status.body}</div>}
            </div>
            {status.official && (
              <button type="button" className="rounded-lg border px-3 py-1.5" onClick={useOfficialEndpoint}>
                Use the official endpoint
              </button>
            )}
            <button type="button" className="rounded-lg border px-3 py-1.5" onClick={clearStatus}>Dismiss</button>
          </div>
        </div>
      )}
    </DataflowHostContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
