import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import GroupNode from '../components/nodes/GroupNode';
import { createFlowStore } from '../store/flowStore';
import { FlowStoreContext } from '../store/flowStoreContext';

/**
 * A group is connectable, and a group folds (card 20d64f9b).
 *
 * React Flow's own pieces are stubbed rather than mounted: <Handle> and <NodeResizer>
 * need a provider, a node context and MEASURED bounds, none of which jsdom has — the
 * existing preview test says the same thing about edges. What is asserted here is what
 * this component decides: which handle ids it renders, whether the chip or the frame is
 * drawn, and what the chip says. Pixels, hover fade and a real drag-connect are browser
 * work.
 */
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    Handle: ({ id, className }: { id?: string; className?: string }) => (
      <div data-testid="handle" data-handleid={id} className={className} />
    ),
    NodeResizer: () => <div data-testid="node-resizer" />,
    useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    useUpdateNodeInternals: () => () => {},
    useStore: (selector: (s: unknown) => unknown) =>
      selector({ elementsSelectable: true, nodes: [], edges: [] }),
  };
});

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.count === undefined ? k : `${k}:${o.count}`),
    i18n: { language: 'en', getFixedT: () => (k: string) => k },
  }),
}));

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

const storeWith = (collapsed: boolean) => {
  const store = createFlowStore();
  store.getState().importGraph(JSON.stringify({
    nodes: [
      { id: 'vpc', type: 'group', position: { x: 0, y: 0 }, style: { width: 400, height: 300 }, data: { name: 'VNet', collapsed } },
      { id: 'a', type: 'icon', position: { x: 20, y: 20 }, parentId: 'vpc', data: { name: 'a', icon: 'lucide:Server' } },
      { id: 'inner', type: 'group', position: { x: 20, y: 150 }, parentId: 'vpc', style: { width: 200, height: 100 }, data: { name: 'inner' } },
      { id: 'b', type: 'icon', position: { x: 10, y: 10 }, parentId: 'inner', data: { name: 'b', icon: 'lucide:Server' } },
    ],
    pipes: [],
  }), undefined, { replace: true });
  return store;
};

const renderGroup = (collapsed: boolean, dropRejected = false) => {
  const store = storeWith(collapsed);
  if (dropRejected) store.getState().setDropRejectedGroup('vpc');
  const props = {
    id: 'vpc',
    data: { name: 'VNet', ...(collapsed ? { collapsed: true } : {}) },
    selected: false,
    positionAbsoluteY: 0,
  } as unknown as React.ComponentProps<typeof GroupNode>;
  return render(
    <FlowStoreContext.Provider value={store}>
      <GroupNode {...props} />
    </FlowStoreContext.Provider>,
  );
};

const handleIds = () =>
  screen.getAllByTestId('handle').map((el) => el.getAttribute('data-handleid')).sort();

describe('GroupNode', () => {
  it('an expanded group exposes the four perimeter handles, same ids as every other node', () => {
    renderGroup(false);
    expect(handleIds()).toEqual(['node-bottom', 'node-left', 'node-right', 'node-top']);
    expect(screen.getByText('VNet')).toBeInTheDocument();
    expect(screen.getByTestId('node-resizer')).toBeInTheDocument();
  });

  it('a collapsed group is a chip: name, hidden count, still four handles, no resizer', () => {
    renderGroup(true);
    expect(handleIds()).toEqual(['node-bottom', 'node-left', 'node-right', 'node-top']);
    expect(screen.getByText('VNet')).toBeInTheDocument();
    // Three descendants: the icon, the nested group, and the nested group's own child.
    expect(screen.getByText('resources.dataflow.node.hiddenNodes:3')).toBeInTheDocument();
    // Nothing to resize, and the style-preset strip belongs to the frame, not the chip.
    expect(screen.queryByTestId('node-resizer')).toBeNull();
  });

  it('the collapse toggle writes data.collapsed and nothing else', () => {
    const store = storeWith(false);
    store.getState().updateGroupNode('vpc', { collapsed: true });
    const group = store.getState().nodes.find((n) => n.id === 'vpc')!;
    expect(group.data).toMatchObject({ name: 'VNet', collapsed: true });
    // The container size stays in the store — expanding must put the frame back.
    expect(group.style).toMatchObject({ width: 400, height: 300 });
  });

  /**
   * Card 1cb78460: dragging a node onto a folded chip did nothing AND said nothing, so the
   * frame at release — node sitting on top of the chip — read as "it went in". It cannot go
   * in (computeGroupDropUpdates refuses every collapsed group), so the chip says so while
   * the pointer is still over it.
   *
   * Asserted as DATA and as the outline, not as a colour name: the outline is the part that
   * has to survive, because React Flow paints the dragged node at z-index +1000 (dragging
   * selects it) and anything drawn inside the chip's own box is behind the node covering it.
   */
  it('the chip shows a rejected state while a drag is over it, and none otherwise', () => {
    const { container } = renderGroup(true, true);
    const chip = container.querySelector('[data-drop-rejected]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.style.outline).toContain('dashed');
    expect(chip.className).toContain('cursor-no-drop');
  });

  it('a folded chip with no drag over it is unchanged', () => {
    const { container } = renderGroup(true);
    expect(container.querySelector('[data-drop-rejected]')).toBeNull();
    const chip = screen.getByText('VNet').parentElement as HTMLElement;
    expect(chip.style.outline).toBe('');
    expect(chip.className).toContain('cursor-pointer');
  });

  it('collapsing deselects what it hides, so the selection bar cannot count invisible nodes', () => {
    const store = storeWith(false);
    store.setState({
      nodes: store.getState().nodes.map((n) => (n.id === 'vpc' ? n : { ...n, selected: true })),
    });
    store.getState().updateGroupNode('vpc', { collapsed: true });
    expect(store.getState().nodes.filter((n) => n.selected)).toEqual([]);
  });
});
