import { useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Save, Download, FileDown, MessageSquareText, BotMessageSquare, ClipboardCopy, Image } from 'lucide-react';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import DataflowCanvas, { type DataflowCanvasRef } from './DataflowCanvas';
import { embedJsonInPng, captureCanvasToBlob } from './utils/pngEncoder';
import { DATAFLOW_COPY_PROMPT, buildGraphForEditing } from './utils/graphToPrompt';
import { graphToDrawioXml, downloadDrawioFile } from './utils/graphToDrawio';
import { graphToText } from './utils/graphToText';
import './index.css';
import type { FlowStore } from './store/flowStore';
import type { DiagramContextValue } from './diagramContext';
import { useNotify } from './host';

interface DataflowEditorProps {
  initialContent: string;     // JSON string or empty for new
  /**
   * The stored diagram being edited, so its images resolve through it.
   *
   * Absent until the first save of a new diagram: what an unsaved diagram shows are
   * uploads its own author just made, which the ordinary endpoint serves.
   */
  diagram?: DiagramContextValue;
  /**
   * Write the graph out. The editor knows the graph and nothing about where it goes —
   * whether that is a `dataflows` row or a file in `resources` is the page's business.
   */
  onSaveGraph: (graphJson: string) => Promise<void>;
  onClose: () => void;
  /**
   * What Ctrl/Cmd+S does. Default `'save-and-close'`.
   *
   * The editor cannot know what closing costs — `onClose` is the host's function. Where
   * closing is a cheap navigation and the graph lives elsewhere (ud: leaving the editor
   * page, the row stays on the server) bundling it into the save key is right. Where it is
   * not, the muscle-memory key inherits whatever the host's close does: the playground's
   * page has nowhere to go, so its close reloads, and Ctrl+S there meant "write the diagram,
   * then throw it away". Save must not lose data down any path, so a host whose close is
   * not free passes `'save'` and gets save-only on the shortcut.
   *
   * Both toolbar buttons are unaffected either way — Save and Save & Close stay.
   */
  saveShortcut?: 'save' | 'save-and-close';
}

/**
 * The full-screen diagram editor.
 *
 * It takes a graph in and hands a graph back: no file name, no storage shape, and nothing
 * about the surrounding application's chrome. Whatever it needs from the app it asks for
 * through host.ts.
 */
export default function DataflowEditor({ initialContent, diagram, onSaveGraph, onClose, saveShortcut = 'save-and-close' }: DataflowEditorProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const flowStoreRef = useRef<FlowStore | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefRef = useRef<DataflowCanvasRef | null>(null);

  const handleStoreReady = useCallback((store: FlowStore) => {
    flowStoreRef.current = store;
  }, []);

  const handleCanvasRefReady = useCallback((ref: DataflowCanvasRef) => {
    canvasRefRef.current = ref;
  }, []);

  const writeGraph = useCallback(async (): Promise<boolean> => {
    if (!flowStoreRef.current) return false;
    await onSaveGraph(flowStoreRef.current.getState().exportGraph());
    return true;
  }, [onSaveGraph]);

  // Ref mirror of `saving` — the Ctrl+S handler can fire again before React
  // re-renders with the disabled buttons, so the guard must be synchronous
  const savingRef = useRef(false);
  const handleSave = useCallback(async (shouldClose: boolean = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const written = await writeGraph();
      if (written) {
        flowStoreRef.current?.getState().markClean();
        notify('info', t('resources.dataflow.saveSuccess'));
        if (shouldClose) {
          onClose();
        }
      }
    } catch (error) {
      console.error('Failed to save dataflow:', error);
      notify('error', t('common.status.error'), error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [writeGraph, onClose, t, notify]);

  const handleSaveOnly = useCallback(() => handleSave(false), [handleSave]);
  const handleSaveAndExit = useCallback(() => handleSave(true), [handleSave]);

  // Ctrl+S → save, and close as well unless the host said its close is not free (saveShortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveShortcut === 'save') handleSaveOnly();
        else handleSaveAndExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveAndExit, handleSaveOnly, saveShortcut]);

  // Warn on browser tab/window close if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (flowStoreRef.current?.getState().isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Close button: show confirmation if dirty, otherwise close immediately
  const handleClose = useCallback(() => {
    if (flowStoreRef.current?.getState().isDirty) {
      setShowQuitConfirm(true);
    } else {
      onClose();
    }
  }, [onClose]);

  // Export PNG — full canvas capture, downloads as file
  const handleExportPng = useCallback(async () => {
    if (!flowStoreRef.current || !canvasContainerRef.current) return;

    setExporting(true);
    try {
      const graphJson = flowStoreRef.current.getState().exportGraph();
      const reactFlowContainer = canvasContainerRef.current.querySelector('.react-flow');

      let pngBlob: Blob;
      if (reactFlowContainer instanceof HTMLElement) {
        if (canvasRefRef.current) {
          await canvasRefRef.current.fitViewForCapture();
        }
        await new Promise(resolve => setTimeout(resolve, 200));
        pngBlob = await captureCanvasToBlob(reactFlowContainer, {
          scale: 2,
          backgroundColor: '#f8fafc',
        });
      } else {
        // Fallback: simple placeholder
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed')), 'image/png');
        });
      }

      const embeddedBlob = await embedJsonInPng(pngBlob, graphJson);
      const url = URL.createObjectURL(embeddedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dataflow-${Date.now()}.dataflow.png`;
      a.click();
      URL.revokeObjectURL(url);

      notify('info', t('resources.dataflow.editor.pngExported'));
    } catch (error) {
      console.error('Failed to export PNG:', error);
      notify('error', t('common.status.error'), error);
    } finally {
      setExporting(false);
    }
  }, [t, notify]);

  const handleExportJson = useCallback(async () => {
    if (!flowStoreRef.current) return;
    const json = flowStoreRef.current.getState().exportGraph();
    try {
      await navigator.clipboard.writeText(json);
      notify('info', t('resources.dataflow.editor.jsonCopied'));
    } catch (error) {
      notify('error', t('common.status.error'), error);
    }
  }, [t, notify]);

  const handleExportDrawio = useCallback(() => {
    if (!flowStoreRef.current) return;
    const state = flowStoreRef.current.getState();
    const xml = graphToDrawioXml(state.nodes, state.pipes);
    downloadDrawioFile(xml);
    notify('info', t('resources.dataflow.editor.drawioExported'));
  }, [t, notify]);

  // The teaching material alone, no diagram attached — see utils/graphToPrompt.ts for why
  // the two were split. Same behaviour as the playground toolbar; both read the same const.
  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DATAFLOW_COPY_PROMPT);
      notify('info', t('resources.dataflow.promptCopied'));
    } catch (error) {
      notify('error', t('common.status.error'), error);
    }
  }, [t, notify]);

  // The companion button: the current diagram, for the requests that need its ids
  // ("connect products to orders"). Separate because most requests do not.
  const handleCopyGraphForEditing = useCallback(async () => {
    if (!flowStoreRef.current) return;
    const state = flowStoreRef.current.getState();
    const graph = buildGraphForEditing(state.nodes, state.pipes);
    if (graph.nodeCount === 0) {
      notify('info', t('resources.dataflow.graphForEditingEmpty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(graph.text);
      notify('info', t(graph.degraded
        ? 'resources.dataflow.paste.graphForEditingTrimmed'
        : 'resources.dataflow.paste.graphForEditingCopied', { n: graph.nodeCount }));
    } catch (error) {
      notify('error', t('common.status.error'), error);
    }
  }, [t, notify]);

  const handleCopyForAI = useCallback(async () => {
    if (!flowStoreRef.current) return;
    const state = flowStoreRef.current.getState();
    const text = graphToText(state.nodes, state.pipes);
    try {
      await navigator.clipboard.writeText(text);
      notify('info', t('resources.dataflow.copiedForAI'));
    } catch (error) {
      notify('error', t('common.status.error'), error);
    }
  }, [t, notify]);

  const busy = saving || exporting;

  return (
    <div className="fixed inset-0 z-50 bg-primary/80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b shrink-0">
        <h2 className="text-sm font-medium">
          {t('resources.dataflow.editing')}
        </h2>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('resources.dataflow.saving')}
            </span>
          )}
          {exporting && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('resources.dataflow.editor.exporting')}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleCopyPrompt} disabled={busy} title={t('resources.dataflow.copyPrompt')}>
            <MessageSquareText className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyGraphForEditing} disabled={busy} title={t('resources.dataflow.copyGraphForEditing')}>
            <ClipboardCopy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyForAI} disabled={busy} title={t('resources.dataflow.copyForAI')}>
            <BotMessageSquare className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportPng} disabled={busy} title={t('resources.dataflow.editor.exportPng')}>
            <Image className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportJson} disabled={busy} title={t('resources.dataflow.editor.exportJson')}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportDrawio} disabled={busy} title={t('resources.dataflow.editor.exportDrawio')}>
            <FileDown className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={handleSaveOnly} disabled={busy}>
            <Save className="h-4 w-4 mr-1" />
            {t('common.save')}
          </Button>
          <Button variant="default" size="sm" onClick={handleSaveAndExit} disabled={busy}>
            <Save className="h-4 w-4 mr-1" />
            {t('common.saveAndClose')}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor Canvas */}
      <div ref={canvasContainerRef} className="flex-1 w-full">
        <DataflowCanvas
          initialContent={initialContent}
          embedMode={true}
          onStoreReady={handleStoreReady}
          onCanvasRefReady={handleCanvasRefReady}
          diagram={diagram}
        />
      </div>

      {/* Quit confirmation dialog */}
      <AlertDialog open={showQuitConfirm} onOpenChange={setShowQuitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resources.dataflow.quitConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('resources.dataflow.quitConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>{t('resources.dataflow.quitConfirmAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
