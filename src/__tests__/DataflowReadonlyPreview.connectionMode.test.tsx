import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { ConnectionMode, Position } from '@xyflow/react';
import { getEdgePosition } from '@xyflow/system';
import DataflowReadonlyPreview from '../DataflowReadonlyPreview';

/**
 * Card 89b04194: the read-only viewer drew every node and not one edge, in a real browser
 * as well as headless, on every diagram, since the day it was introduced (58e550ba).
 *
 * Root cause: every perimeter handle a node exposes is `type="source"` (NodePerimeterHandles
 * — the editor went all-source + `connectionMode=Loose` together in 6ad6ecde2, 2026-07-03,
 * because a stored pipe may leave from or arrive at any side). A stored pipe therefore
 * names a SOURCE handle as its `targetHandle`. React Flow resolves an edge's target end from
 * the target node's `target` handles only — unless connectionMode is Loose, in which case it
 * also searches the `source` handles. The viewer shares the editor's node registry (so its
 * nodes have only source handles) but never passed connectionMode, so it ran Strict: the
 * target lookup came back empty for every pipe, React Flow returned null for the edge
 * position and rendered nothing. The warning that explains it (React Flow error 008) goes
 * through devWarn, which is silent outside NODE_ENV=development — hence a production bundle
 * that shows 0 edges and a clean console.
 *
 * Two guards, because the DOM cannot be the guard (jsdom measures nothing, so
 * `.react-flow__edge` is empty here whatever the mode — see the noteEdges test):
 *   1. the mechanism, straight from @xyflow/system: a target lookup against source-only
 *      handle bounds fails under Strict and succeeds under Loose;
 *   2. the wiring: the viewer hands React Flow the Loose mode.
 */

const captured: Record<string, unknown> = {};

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

/** A measured node whose only handles are the four all-source perimeter dots. */
function sourceOnlyNode(id: string, x: number) {
  const dot = (hid: string, position: Position, hx: number, hy: number) => ({
    id: hid, nodeId: id, x: hx, y: hy, width: 10, height: 10, position, type: 'source' as const,
  });
  return {
    id,
    type: 'icon',
    position: { x, y: 0 },
    measured: { width: 100, height: 60 },
    internals: {
      positionAbsolute: { x, y: 0 },
      z: 0,
      userNode: { id, position: { x, y: 0 }, data: {} },
      handleBounds: {
        source: [
          dot('node-top', Position.Top, 45, -5),
          dot('node-right', Position.Right, 95, 25),
          dot('node-bottom', Position.Bottom, 45, 55),
          dot('node-left', Position.Left, -5, 25),
        ],
        target: [],
      },
    },
  };
}

describe('why the viewer had no edges (card 89b04194)', () => {
  const sourceNode = sourceOnlyNode('client', 0);
  const targetNode = sourceOnlyNode('vnet', 300);
  const pipe = { id: 'e-client-vnet', sourceHandle: 'node-right', targetHandle: 'node-left' };

  it('React Flow refuses to path a pipe whose target names a source handle, under Strict', () => {
    const onError = vi.fn();
    const pos = getEdgePosition({ ...pipe, sourceNode, targetNode, connectionMode: ConnectionMode.Strict, onError } as never);
    expect(pos).toBeNull();
    expect(onError).toHaveBeenCalledWith('008', expect.stringContaining('target handle id: "node-left"'));
  });

  it('...and paths it under Loose, which is what the all-source perimeter handles require', () => {
    const onError = vi.fn();
    const pos = getEdgePosition({ ...pipe, sourceNode, targetNode, connectionMode: ConnectionMode.Loose, onError } as never);
    expect(pos).not.toBeNull();
    expect(pos?.targetPosition).toBe(Position.Left);
    expect(onError).not.toHaveBeenCalled();
  });

  it('the read-only viewer runs React Flow in Loose mode, like the editor', () => {
    const graph = {
      nodes: [
        { id: 'client', type: 'icon', position: { x: 0, y: 0 }, data: { name: 'client', icon: 'server' } },
        { id: 'vnet', type: 'icon', position: { x: 300, y: 0 }, data: { name: 'vnet', icon: 'server' } },
      ],
      pipes: [{ ...pipe, type: 'dataflow', source: 'client', target: 'vnet', data: { name: '' } }],
    };
    render(<DataflowReadonlyPreview content={JSON.stringify(graph)} />);
    expect(captured.connectionMode).toBe(ConnectionMode.Loose);
  });
});
