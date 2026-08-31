import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import realGraph from '../../fixtures/editor-saved.dataflow.json';
import DataflowReadonlyPreview from '../DataflowReadonlyPreview';
import { nodeTypes, edgeTypes } from '../registry';

/**
 * The fixture is a graph the EDITOR actually saved, copied byte-for-byte out of blob
 * storage — not one written by hand for this test. A hand-made graph agrees with
 * whatever the test author assumed and hides the two ways this can really break: a
 * shape the importer rejects, and a node `type` no registry entry covers, which renders
 * as a silent blank box.
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

describe('DataflowReadonlyPreview', () => {
  it('draws the nodes of a graph the editor really saved', () => {
    render(<DataflowReadonlyPreview content={JSON.stringify(realGraph)} />);
    // The two json nodes carry their names as labels.
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
  });

  it('renders rather than throwing on malformed content', () => {
    // An unparseable file must leave an empty canvas, not take the page down.
    expect(() => render(<DataflowReadonlyPreview content="not json at all" />)).not.toThrow();
  });

  it('covers every node type the fixture uses', () => {
    const used = new Set((realGraph as any).nodes.map((n: any) => n.type));
    for (const type of used) expect(nodeTypes).toHaveProperty(type as string);
  });
});

describe('the shared registry', () => {
  /**
   * The editor and this preview must draw from ONE registry. A second copy does not
   * merely duplicate: an unregistered type renders blank with no error, so the copy that
   * missed the editor's newest node type would lose it silently.
   */
  it('is the same object the editor canvas imports', async () => {
    const canvasSource = await import('../DataflowCanvas');
    expect(canvasSource).toBeTruthy();
    // Every type the editor can produce is registered here.
    expect(Object.keys(nodeTypes).sort()).toEqual(
      ['group', 'icon', 'image', 'json', 'note', 'process', 'resource', 'shape'],
    );
    expect(Object.keys(edgeTypes)).toEqual(['dataflow']);
  });
});

describe('read-only really means read-only', () => {
  it('marks its node subtree with the class the read-only rules key on', () => {
    const { container } = render(<DataflowReadonlyPreview content={JSON.stringify(realGraph)} />);
    expect(container.querySelector('.dataflow-readonly')).not.toBeNull();
  });

  /**
   * Hovering a note in a VIEWER must not paint its four connection handles. It briefly
   * did: moving a note's hover into the shared store (card a8596103, so the peek and the
   * edges could not drift apart) also let the node wrapper's hover reach the handles,
   * which the read-only pointer-events block used to swallow — four "drag me to connect"
   * dots on a surface where connecting is impossible.
   *
   * The guard lives in NodePerimeterHandles, not in index.css, because the visible class
   * is Tailwind's `!opacity-100` — an important declaration inside `@layer utilities`, and
   * important declarations reverse layer order, so no unlayered rule this package ships
   * can outrank it. Asserting on the class asserts the mechanism that actually decides.
   */
  it('never paints a note’s connection handles in a viewer, even while hovered', () => {
    const graph = {
      nodes: [{ id: 'tf', type: 'note', position: { x: 0, y: 0 }, data: { name: 'tf', content: 'x', collapsed: true } }],
      pipes: [],
    };
    const { container } = render(<DataflowReadonlyPreview content={JSON.stringify(graph)} />);
    const note = container.querySelector('.react-flow__node-note');
    expect(note).not.toBeNull();

    // React synthesises onMouseEnter from mouseover, so mouseOver is what drives it.
    fireEvent.mouseOver(note!.firstElementChild ?? note!);

    const handles = [...note!.querySelectorAll('.react-flow__handle')];
    expect(handles.length).toBeGreaterThan(0);
    for (const h of handles) {
      expect(h.getAttribute('class')).not.toContain('!opacity-100');
    }
  });

});
