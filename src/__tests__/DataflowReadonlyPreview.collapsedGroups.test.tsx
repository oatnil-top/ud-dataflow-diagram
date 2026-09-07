import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import DataflowReadonlyPreview from '../DataflowReadonlyPreview';

/**
 * A diagram saved with a folded group opens folded in the VIEWER too (card 20d64f9b).
 *
 * This is the guard against wiring only DataflowCanvas: a shared diagram is read here,
 * so a viewer that quietly unfolded every group would be showing a different diagram
 * from the one its author saved. Asserted on the props React Flow receives, for the
 * reason spelled out in DataflowReadonlyPreview.noteEdges.test.tsx — jsdom measures no
 * handles, so React Flow renders no edges at all here.
 */
const captured: { nodes?: Record<string, unknown>[]; edges?: Record<string, unknown>[] } = {};

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: Record<string, unknown>) => {
      Object.assign(captured, props);
      return <div data-testid="rf-stub" />;
    },
  };
});

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', getFixedT: () => (k: string) => k } }),
}));

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

const graph = {
  nodes: [
    { id: 'vpc', type: 'group', position: { x: 0, y: 0 }, style: { width: 400, height: 300 }, data: { name: 'VPC', collapsed: true } },
    { id: 'api', type: 'icon', position: { x: 40, y: 40 }, parentId: 'vpc', data: { name: 'api', icon: 'lucide:Server' } },
    { id: 'db', type: 'icon', position: { x: 200, y: 40 }, parentId: 'vpc', data: { name: 'db', icon: 'lucide:Database' } },
    { id: 'out', type: 'icon', position: { x: 900, y: 60 }, data: { name: 'out', icon: 'lucide:Globe' } },
  ],
  pipes: [
    { id: 'crossing', type: 'dataflow', source: 'api', target: 'out', sourceHandle: 'node-right', targetHandle: 'node-left', data: { name: '' } },
    { id: 'internal', type: 'dataflow', source: 'api', target: 'db', sourceHandle: 'node-right', targetHandle: 'node-left', data: { name: '' } },
  ],
};

describe('the read-only viewer and a collapsed group', () => {
  it('hides the members, keeps the group, and redraws the crossing edge to it', () => {
    render(<DataflowReadonlyPreview content={JSON.stringify(graph)} />);
    const nodes = Object.fromEntries((captured.nodes ?? []).map((n) => [n.id as string, n]));
    const edges = Object.fromEntries((captured.edges ?? []).map((e) => [e.id as string, e]));

    expect(nodes.api.hidden).toBe(true);
    expect(nodes.db.hidden).toBe(true);
    expect(nodes.vpc.hidden).toBeFalsy();
    expect(nodes.out.hidden).toBeFalsy();
    // The chip must not keep the container's footprint (stripSizeWhenCollapsed).
    expect(nodes.vpc.style).toBeUndefined();

    expect(edges.crossing).toMatchObject({ source: 'vpc', target: 'out' });
    expect(edges.crossing.hidden).toBeFalsy();
    // Both ends folded into the same chip: there is nothing to draw.
    expect(edges.internal.hidden).toBe(true);
  });
});
