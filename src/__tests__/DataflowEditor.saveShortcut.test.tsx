import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import realGraph from '../../fixtures/editor-saved.dataflow.json';
import DataflowEditor from '../DataflowEditor';

/**
 * Ctrl+S is the one key every user presses from muscle memory, and it runs a host function
 * (`onClose`) whose cost the editor cannot see. In ud that close is a cheap navigation; in
 * the playground it reloads a page that has nowhere to go, and the pair — each half correct
 * on its own — turned Save into "write the diagram, then discard it".
 *
 * So these two cases are the contract, and the second one is the one that regresses
 * silently: nothing throws, nothing logs, the diagram is just gone.
 */
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', getFixedT: () => (k: string) => k } }),
}));

beforeAll(() => {
  // ReactFlow measures its container; jsdom reports zero for everything.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
  global.DOMMatrixReadOnly = class { m22 = 1; constructor(_t?: string) {} } as never;
});

function mount(saveShortcut?: 'save' | 'save-and-close') {
  const onSaveGraph = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <DataflowEditor
      initialContent={JSON.stringify(realGraph)}
      onSaveGraph={onSaveGraph}
      onClose={onClose}
      saveShortcut={saveShortcut}
    />,
  );
  return { onSaveGraph, onClose };
}

describe('Ctrl+S', () => {
  it('saves and closes by default — ud leaves the editor page, the graph stays on the server', async () => {
    const { onSaveGraph, onClose } = mount();
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await waitFor(() => expect(onSaveGraph).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("saves only when the host says its close is not free — it must never reach a destructive onClose", async () => {
    const { onSaveGraph, onClose } = mount('save');
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await waitFor(() => expect(onSaveGraph).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });
});
