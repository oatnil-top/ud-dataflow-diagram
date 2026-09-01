/**
 * Public surface of @oatnil/ud-dataflow-diagram.
 *
 * Consumers import from here, never from a deep path — what is not exported here is free
 * to move. Everything the diagram needs FROM its host goes the other way, through
 * `DataflowHost` (./host.ts): the package imports nothing from any application.
 */
export { default as DataflowEditor } from './DataflowEditor'
export { default as DataflowCanvas, type DataflowCanvasRef } from './DataflowCanvas'
export { default as DataflowReadonlyPreview } from './DataflowReadonlyPreview'
export {
  DataflowHostContext,
  useDataflowHost,
  useNotify,
  type DataflowHost,
  type ResourceResolution,
} from './host'
export { DiagramContext, useDiagramContext, type DiagramContextValue } from './diagramContext'
export * from './types'
export { createFlowStore, type FlowStore, type ImportResult, type ImportOptions } from './store/flowStore'
export { detectLegacyDialect, computeTopologicalLayout } from './store/importFormats'
export { graphToText } from './utils/graphToText'
export {
  DATAFLOW_COPY_PROMPT,
  DATAFLOW_SYSTEM_PROMPT,
  buildGraphForEditing,
  type GraphForEditing,
} from './utils/graphToPrompt'
export { graphToContext, type GraphContext } from './utils/graphToContext'
export { extractGraphJson, looksLikeGraphPayload, unwrapModelText, type ExtractFailure } from './utils/extractJson'
export { parseDsl, type EditPlan, type EditOp, type BadLine } from './store/dslParser'
export { type ViewportRect } from './store/editPlan'
export {
  importPastedGraph,
  clipboardTextIsGraph,
  PASTE_FAILURE_KEYS,
  type PasteFailure,
  type PasteOutcome,
  type PasteViewport,
} from './store/pasteImport'
export { graphToDrawioXml, downloadDrawioFile } from './utils/graphToDrawio'
export {
  embedJsonInPng,
  extractJsonFromPng,
  captureCanvasToBlob,
  DATAFLOW_KEYWORD,
  MINDMAP_KEYWORD,
} from './utils/pngEncoder'
export { registerDataflowMessages } from './locales/register'
export { nodeTypes, edgeTypes } from './registry'

import './index.css'
