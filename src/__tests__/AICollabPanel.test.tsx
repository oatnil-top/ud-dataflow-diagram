import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AICollabPanel from '../components/panels/AICollabPanel';
import { FlowStoreContext } from '../store/flowStoreContext';
import { createFlowStore } from '../store/flowStore';
import { registerDataflowMessages } from '../locales/register';
import { DATAFLOW_COPY_PROMPT } from '../utils/graphToPrompt';

/**
 * The AI Collaborate panel (task 5b0bfd1e A, design note d48020cd position 1).
 *
 * The acceptance criterion is NAMING, not existence: the round trip broke because the
 * way out was called "Copy as Prompt" and the way back was called "Import Graph JSON",
 * and nothing on screen said they were two halves of one flow. So these tests render
 * the REAL locale files and assert the flow reads as numbered steps of one story —
 * copy the prompt, chat elsewhere, paste the answer back — plus the two behaviors the
 * card pins: same pipeline as every other paste door, and named failures, never silence.
 */

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    resources: {}, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
  });
  registerDataflowMessages(i18n);
});

const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

const GRAPH = {
  nodes: [
    { id: 'users', type: 'json', position: { x: 0, y: 0 }, data: { name: 'users', fields: [] } },
    { id: 'orders', type: 'json', position: { x: 300, y: 0 }, data: { name: 'orders', fields: [] } },
  ],
  pipes: [{ source: 'users', target: 'orders' }],
};

const renderPanel = (store = createFlowStore(), onClose = vi.fn()) => {
  render(
    <FlowStoreContext.Provider value={store}>
      <AICollabPanel isOpen={true} onClose={onClose} />
    </FlowStoreContext.Provider>,
  );
  return { store, onClose };
};

describe('the three steps read as one flow', () => {
  it('shows three numbered steps: copy the prompt, copy the current diagram, paste the answer', () => {
    renderPanel();
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
    expect(screen.getByText(/step 2/i)).toBeInTheDocument();
    expect(screen.getByText(/step 3/i)).toBeInTheDocument();
    // The way back in is named after what the user is holding — the AI's ANSWER —
    // not after a file format. "Import Graph JSON" is the name this panel replaces.
    expect(screen.getByRole('button', { name: /import.*answer/i })).toBeInTheDocument();
    expect(screen.queryByText(/import graph json/i)).not.toBeInTheDocument();
    // Real locales, fully interpolated
    expect(document.body.textContent).not.toContain('resources.dataflow');
    expect(document.body.textContent).not.toContain('{{');
  });

  it('step 1 puts the teaching prompt itself on the clipboard', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(DATAFLOW_COPY_PROMPT));
  });

  it('step 2 copies the current diagram, and says so when the canvas is empty instead of copying nothing', async () => {
    const store = createFlowStore();
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { replace: true });
    renderPanel(store);
    fireEvent.click(screen.getByRole('button', { name: /copy current diagram/i }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0][0])).toContain('users');

    // empty canvas: no clipboard write
    writeText.mockClear();
    renderPanel(createFlowStore());
    fireEvent.click(screen.getAllByRole('button', { name: /copy current diagram/i }).pop()!);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('step 3 is the same paste door as every other entry', () => {
  it('a pasted answer lands in the graph through the shared pipeline and closes the panel', () => {
    const { store, onClose } = renderPanel();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '```json\n' + JSON.stringify(GRAPH) + '\n```' },
    });
    fireEvent.click(screen.getByRole('button', { name: /import.*answer/i }));

    expect(store.getState().nodes.map((n) => n.id).sort()).toEqual(['orders', 'users']);
    expect(onClose).toHaveBeenCalled();
  });

  it('a truncated answer fails BY NAME — the panel stays open and tells the user what to do', () => {
    const truncated = JSON.stringify(GRAPH).slice(0, 60);
    const { store, onClose } = renderPanel();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: truncated } });
    fireEvent.click(screen.getByRole('button', { name: /import.*answer/i }));

    expect(store.getState().nodes).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/incomplete|cut off/i)).toBeInTheDocument();
  });

  it('an empty paste is refused with words, not silence', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /import.*answer/i }));
    expect(screen.getByText(/please enter or upload/i)).toBeInTheDocument();
  });
});
