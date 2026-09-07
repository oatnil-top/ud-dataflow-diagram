import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import DataflowReadonlyPreview from '../DataflowReadonlyPreview';

/**
 * Card 7338db76 ②: the read-only viewer opened a diagram containing a group at zoom 2.43
 * (or 4.0 with the group collapsed) and left the right-hand nodes off-screen, while the
 * editor framed the same diagram at 0.87.
 *
 * Root cause, and the reason this file exists at all: `<ReactFlow fitView>` resolves ONE
 * queued fit, and `GroupNode` / `NoteNode` / `ResourceNode` each call
 * `useUpdateNodeInternals()(id)` in a MOUNT effect. React Flow schedules that on a rAF,
 * which beats the ResizeObserver's first broadcast, and 12.10.0's store drops the
 * `{ triggerFitView: false }` guard the library passes itself — so the fit fires against
 * the one node that call just measured and the queue is empty when the rest arrive. The
 * viewer needs its own measurement-gated fit, the way commit 8865912 gave the editor one.
 *
 * ⚠️ jsdom measures nothing and this suite stubs `<ReactFlow>`, so the VIEWPORT is not
 * observable here — the browser numbers are on the card. What is pinned instead is the
 * decision that produces it: the fit waits for every visible node to carry real measured
 * dimensions, then fires exactly once with the editor's own options. `useStore` is driven
 * with the component's REAL selector against a hand-built `nodeLookup`, so the predicate
 * under test is the shipped one, not a restatement of it.
 *
 * On the pre-fix tree every assertion below is red: there is no fitView call at all.
 */

const fitView = vi.fn();
/** The React Flow store state the viewer's selector runs against, swapped per test. */
let storeState: { nodeLookup: Map<string, { hidden?: boolean; measured?: { width?: number; height?: number } }> };

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: () => <div data-testid="rf-stub" />,
    useReactFlow: () => ({ fitView }),
    // The real selector, real state shape — so a selector that stopped skipping hidden
    // nodes, or stopped checking `measured`, fails here.
    useStore: (selector: (s: unknown) => unknown) => selector(storeState),
  };
});

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', getFixedT: () => (k: string) => k } }),
}));

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

beforeEach(() => {
  fitView.mockClear();
});

const MEASURED = { measured: { width: 120, height: 60 } };
const UNMEASURED = { measured: { width: 0, height: 0 } };

/** A group + two far-right nodes: the shape that opened clipped (devbox a0c34269). */
const CONTENT = JSON.stringify({
  nodes: [
    { id: 'grp', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Subnet B', collapsed: true } },
    { id: 'logs', type: 'icon', position: { x: 900, y: 40 }, data: { label: 'Logs' } },
    { id: 'vault', type: 'icon', position: { x: 1200, y: 40 }, data: { label: 'Key Vault' } },
  ],
  pipes: [],
});

function lookup(entries: [string, { hidden?: boolean; measured?: { width?: number; height?: number } }][]) {
  return new Map(entries);
}

describe('DataflowReadonlyPreview — the fit waits for measurement (card 7338db76)', () => {
  it('does NOT fit while a node is still unmeasured — the frame the bug fired on', () => {
    storeState = { nodeLookup: lookup([['grp', MEASURED], ['logs', UNMEASURED], ['vault', UNMEASURED]]) };
    render(<DataflowReadonlyPreview content={CONTENT} />);
    // This is the exact state the broken build fitted in: the group measured by its own
    // mount effect, everything else still at zero. Fitting here frames the group alone.
    expect(fitView).not.toHaveBeenCalled();
  });

  it('fits once every visible node is measured, with the editor’s own options', () => {
    storeState = { nodeLookup: lookup([['grp', MEASURED], ['logs', MEASURED], ['vault', MEASURED]]) };
    render(<DataflowReadonlyPreview content={CONTENT} />);
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith({ padding: 0.15, maxZoom: 1 });
  });

  it('does not wait for hidden nodes, which the fit excludes anyway', () => {
    // Every descendant of a collapsed group is `hidden`, and @xyflow/system's
    // getFitViewNodes drops those — waiting for one to be measured would never fit at all.
    storeState = {
      nodeLookup: lookup([
        ['grp', MEASURED],
        ['inner-1', { hidden: true, ...UNMEASURED }],
        ['logs', MEASURED],
        ['vault', MEASURED],
      ]),
    };
    render(<DataflowReadonlyPreview content={CONTENT} />);
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it('an empty diagram is not fitted at all', () => {
    storeState = { nodeLookup: lookup([]) };
    render(<DataflowReadonlyPreview content={JSON.stringify({ nodes: [], pipes: [] })} />);
    expect(fitView).not.toHaveBeenCalled();
  });
});
