import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ImportSummaryBar from '../components/panels/ImportSummaryBar';
import { FlowStoreContext } from '../store/flowStoreContext';
import { createFlowStore } from '../store/flowStore';
import { registerDataflowMessages } from '../locales/register';

/**
 * Rendered against the REAL locale files, not a `t: (k) => k` stub. A stub would pass on
 * a key that does not exist and on interpolation that never fires — the two ways this bar
 * can ship a raw "resources.dataflow.paste.added" or a literal "{{n}}" to a user.
 */
beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    resources: {}, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false },
  });
  registerDataflowMessages(i18n);
});

const GRAPH = {
  nodes: [
    { id: 'users', type: 'json', data: { name: 'users', fields: [] } },
    { id: 'orders', type: 'json', data: { name: 'orders', fields: [] } },
  ],
  pipes: [{ source: 'users', target: 'orders' }],
};

const renderWith = (store: ReturnType<typeof createFlowStore>) =>
  render(
    <FlowStoreContext.Provider value={store}>
      <ImportSummaryBar />
    </FlowStoreContext.Provider>,
  );

describe('ImportSummaryBar', () => {
  it('shows nothing until something has been pasted', () => {
    const { container } = renderWith(createFlowStore());
    expect(container).toBeEmptyDOMElement();
  });

  it('says what landed, in real words with the numbers filled in', () => {
    const store = createFlowStore();
    const result = store.getState().importGraph(JSON.stringify(GRAPH), undefined, { sameIdMeansSameNode: true })!;
    store.getState().setImportSummary(result);

    renderWith(store);
    expect(screen.getByText(/Imported 2 nodes and 1 connections/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('resources.dataflow');
    expect(document.body.textContent).not.toContain('{{');
  });

  it('names what was skipped when the same payload is pasted twice', () => {
    const store = createFlowStore();
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { sameIdMeansSameNode: true });
    const second = store.getState().importGraph(JSON.stringify(GRAPH), undefined, { sameIdMeansSameNode: true })!;
    store.getState().setImportSummary(second);

    renderWith(store);
    expect(screen.getByText(/Nothing new to add/)).toBeInTheDocument();
    expect(document.body.textContent).toContain('2 already on the canvas, skipped');
    expect(document.body.textContent).toContain('1 connections already existed');
  });

  it('names the missing endpoint of a dropped connection', () => {
    const store = createFlowStore();
    const result = store.getState().importGraph(
      JSON.stringify({ nodes: [{ id: 'a', type: 'json', data: { name: 'a', fields: [] } }], pipes: [{ source: 'a', target: 'ghost' }] }),
      undefined, { sameIdMeansSameNode: true },
    )!;
    store.getState().setImportSummary(result);

    renderWith(store);
    expect(document.body.textContent).toContain('no node named "ghost"');
  });

  it('undo puts the graph back and takes the bar away', () => {
    const store = createFlowStore();
    const result = store.getState().importGraph(JSON.stringify(GRAPH), undefined, { sameIdMeansSameNode: true })!;
    store.getState().setImportSummary(result);

    renderWith(store);
    fireEvent.click(screen.getByText('Undo'));

    expect(store.getState().nodes).toHaveLength(0);
    expect(store.getState().importSummary).toBeNull();
  });
});
