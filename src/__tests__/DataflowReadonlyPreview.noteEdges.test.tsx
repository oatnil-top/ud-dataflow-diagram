import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import DataflowReadonlyPreview from '../DataflowReadonlyPreview';

/**
 * The read-only viewer is the surface the card's diagram is actually read on
 * (`/learn/azure/network/foundation/`), so the collapsed-note muting has to reach it and
 * not just the editor. A first pass wired only DataflowCanvas, which would have fixed
 * nothing the reporter could see — this is the guard against that regression.
 *
 * It asserts on the props React Flow RECEIVES rather than on the DOM, because React Flow
 * renders no edges at all under jsdom: it needs measured handle bounds, and jsdom reports
 * none, so `.react-flow__edge` is always empty here. A DOM assertion would therefore pass
 * or fail for reasons that have nothing to do with this feature. The pixels (fade,
 * amber stroke, hit-testing) were checked in a real browser; see the task notes.
 */
const captured: { nodes?: unknown[]; edges?: Record<string, unknown>[]; onNodeMouseEnter?: unknown; onNodeMouseLeave?: unknown } = {};

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
    { id: 'svc', type: 'shape', position: { x: 0, y: 0 }, style: { width: 160, height: 60 }, data: { name: 'svc' } },
    { id: 'tf', type: 'note', position: { x: 300, y: 0 }, data: { name: 'tf', content: 'x', collapsed: true } },
    { id: 'open', type: 'note', position: { x: 300, y: 200 }, data: { name: 'open', content: 'x', collapsed: false } },
  ],
  pipes: [
    { id: 'muted', type: 'dataflow', source: 'tf', target: 'svc', data: { name: '' } },
    { id: 'kept', type: 'dataflow', source: 'open', target: 'svc', data: { name: '' } },
  ],
};

describe('the read-only viewer and collapsed notes', () => {
  it('mutes a collapsed note’s edge here too, and leaves an expanded one alone', () => {
    render(<DataflowReadonlyPreview content={JSON.stringify(graph)} />);
    const byId = Object.fromEntries((captured.edges ?? []).map((e) => [e.id as string, e]));

    expect(byId.muted.className).toContain('pipe-note-muted');
    // The label is portalled out of the edge, so it needs the flag on data as well —
    // without it a hidden line leaves its caption floating on the canvas.
    expect((byId.muted.data as { noteMuted?: boolean }).noteMuted).toBe(true);

    // Collapse is what hides a line, not being a note: the expanded note keeps its line.
    expect(byId.kept.className ?? '').not.toContain('pipe-note-muted');
    // And nothing is revealed until something is hovered.
    expect(byId.muted.className).not.toContain('pipe-note-revealed');
  });

  it('passes the hover handlers React Flow needs, or nothing can ever be revealed', () => {
    render(<DataflowReadonlyPreview content={JSON.stringify(graph)} />);
    expect(typeof captured.onNodeMouseEnter).toBe('function');
    expect(typeof captured.onNodeMouseLeave).toBe('function');
  });
});
