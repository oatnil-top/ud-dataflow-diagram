import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ImportSummaryBar from '../components/panels/ImportSummaryBar';
import { FlowStoreContext } from '../store/flowStoreContext';
import { createFlowStore } from '../store/flowStore';
import { registerDataflowMessages } from '../locales/register';
import { parseDsl } from '../store/dslParser';

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

  it('a pure pipe delta reads as connections, not as "0 nodes"', () => {
    const store = createFlowStore();
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { replace: true });
    const result = store.getState().importGraph(
      JSON.stringify({ nodes: [], pipes: [{ source: 'orders', target: 'users' }] }),
      undefined, { sameIdMeansSameNode: true },
    )!;
    store.getState().setImportSummary(result);

    renderWith(store);
    expect(screen.getByText(/Imported 1 connections/)).toBeInTheDocument();
    // "Imported 0 nodes and 1 connections" is true and unreadable; the bar must not say it.
    expect(document.body.textContent).not.toContain('0 nodes');
    expect(document.body.textContent).not.toContain('resources.dataflow');
    expect(document.body.textContent).not.toContain('{{');
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

/**
 * The DSL channel's own report lines. Same rule as above: rendered through the real
 * locale files, so a missing key or an unfired interpolation fails here rather than in
 * front of a user.
 */
describe('ImportSummaryBar — what a DSL paste reports', () => {
  const seeded = () => {
    const store = createFlowStore();
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { replace: true });
    return store;
  };
  const applyAndRender = (store: ReturnType<typeof createFlowStore>, dsl: string) => {
    const result = store.getState().applyEditPlan(parseDsl(dsl), { x: 0, y: 0, width: 1440, height: 900 })!;
    store.getState().setImportSummary(result);
    renderWith(store);
  };

  it('a rename with no new node is "Modified 1 nodes", not "nothing happened"', () => {
    applyAndRender(seeded(), 'node users 客户');
    expect(screen.getByText(/Modified 1 nodes/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Nothing new to add');
    expect(document.body.textContent).not.toContain('{{');
  });

  it('names the ignored lines by number', () => {
    applyAndRender(seeded(), 'node payments 支付: amount number\nI hope this helps!');
    expect(document.body.textContent).toMatch(/1 lines ignored \(from line 2\)/);
    expect(document.body.textContent).not.toContain('resources.dataflow');
  });

  it('a cut-off last line gets the way out, with the line to continue from', () => {
    applyAndRender(seeded(), 'node payments 支付: amount number\nlink orde');
    expect(document.body.textContent).toMatch(/continue from line 2/);
    expect(document.body.textContent).not.toContain('{{');
  });

  it('a field-level link that had to degrade says so', () => {
    applyAndRender(seeded(), 'link users.nope -> orders.also_nope');
    expect(document.body.textContent).toMatch(/1 connected node-to-node \(field not found\)/);
  });
});
