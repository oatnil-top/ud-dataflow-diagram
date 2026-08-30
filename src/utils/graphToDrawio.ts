import type { Node, Edge } from '@xyflow/react'
import type { JsonNodeData, ProcessNodeData, NoteNodeData, ResourceNodeData, ShapeNodeData, GroupNodeData, IconNodeData, Field } from '../types'

// Type guards
function isJsonNode(node: Node): node is Node<JsonNodeData> {
  return node.type === 'json'
}
function isProcessNode(node: Node): node is Node<ProcessNodeData> {
  return node.type === 'process'
}
function isNoteNode(node: Node): node is Node<NoteNodeData> {
  return node.type === 'note'
}
function isResourceNode(node: Node): node is Node<ResourceNodeData> {
  return node.type === 'resource' || node.type === 'image'
}
function isGroupNode(node: Node): node is Node<GroupNodeData> {
  return node.type === 'group'
}
function isShapeNode(node: Node): node is Node<ShapeNodeData> {
  return node.type === 'shape'
}
function isIconNode(node: Node): node is Node<IconNodeData> {
  return node.type === 'icon'
}

// draw.io cell ID counter
let cellId = 2 // 0 and 1 are reserved for root cells

function nextId(): number {
  return cellId++
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Collect flat field names from nested Field tree
function flattenFieldNames(fields: Field[], prefix = ''): string[] {
  const result: string[] = []
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.name}` : f.name
    result.push(path)
    if (f.children && f.children.length > 0) {
      result.push(...flattenFieldNames(f.children, path))
    }
  }
  return result
}

const NODE_WIDTH = 200
const ITEM_HEIGHT = 26
const HEADER_HEIGHT = 30

// List container style (swimlane with stackLayout — the draw.io "List" element)
const LIST_STYLE = 'swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=HEADER;horizontalStack=0;' +
  'resizeParent=1;resizeParentMax=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;'

// List item style (text cell with east/west connection points)
const ITEM_STYLE = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;' +
  'spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];' +
  'portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fontSize=11;'

/**
 * Convert React Flow graph state to draw.io XML format.
 * Uses the draw.io List shape (swimlane + stackLayout) for clean rendering.
 */
export function graphToDrawioXml(
  nodes: Node[],
  pipes: Edge[],
): string {
  cellId = 2
  const cells: string[] = []
  // Map: nodeId -> fieldHandleId -> drawio cell id
  const handleToCellId = new Map<string, Map<string, number>>()
  // Map: React Flow nodeId -> drawio cellId (for parent references)
  const nodeToCellId = new Map<string, number>()

  // Build a map of node positions, converting relative (child) to absolute
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  function absPos(node: Node): { x: number; y: number } {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (parent) {
        const pp = absPos(parent)
        return { x: pp.x + node.position.x, y: pp.y + node.position.y }
      }
    }
    return node.position
  }

  // Sort: groups by depth first (parents before children), then non-groups
  const depthOf = (n: Node): number => {
    let d = 0, cur = n
    while (cur.parentId) { d++; cur = nodeMap.get(cur.parentId) || cur; if (cur.id === n.id) break }
    return d
  }
  const sortedNodes = [...nodes].sort((a, b) => depthOf(a) - depthOf(b))

  // Helper: get drawio parent cell ID for a node
  function drawioParent(node: Node): string {
    if (node.parentId) {
      const parentCellId = nodeToCellId.get(node.parentId)
      if (parentCellId !== undefined) return String(parentCellId)
    }
    return '1' // default layer
  }

  for (const node of sortedNodes) {
    const nodeHandles = new Map<string, number>()
    handleToCellId.set(node.id, nodeHandles)
    const pos = absPos(node)

    if (isJsonNode(node)) {
      const { data } = node
      const fieldNames = flattenFieldNames(data.fields)
      const totalHeight = HEADER_HEIGHT + fieldNames.length * ITEM_HEIGHT

      // List container
      const containerId = nextId()
      nodeToCellId.set(node.id, containerId)
      const containerStyle = LIST_STYLE.replace('HEADER', String(HEADER_HEIGHT)) +
        'strokeColor=#6c8ebf;fillColor=#dae8fc;'
      cells.push(
        `      <mxCell id="${containerId}" value="${escapeXml(data.name)}" ` +
        `style="${containerStyle}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${NODE_WIDTH}" height="${totalHeight}" as="geometry" />` +
        `\n      </mxCell>`
      )

      // List items
      fieldNames.forEach((fieldName, i) => {
        const itemId = nextId()
        const itemY = HEADER_HEIGHT + i * ITEM_HEIGHT
        cells.push(
          `      <mxCell id="${itemId}" value="${escapeXml(fieldName)}" ` +
          `style="${ITEM_STYLE}" vertex="1" parent="${containerId}">` +
          `\n        <mxGeometry y="${itemY}" width="${NODE_WIDTH}" height="${ITEM_HEIGHT}" as="geometry" />` +
          `\n      </mxCell>`
        )
        nodeHandles.set(`input-${fieldName}`, itemId)
        nodeHandles.set(`output-${fieldName}`, itemId)
      })
    } else if (isProcessNode(node)) {
      const { data } = node
      const allFields = [
        ...data.inputFields.map(f => ({ name: f, side: 'input' })),
        ...data.outputFields.map(f => ({ name: f.name, side: 'output' })),
      ]
      const totalHeight = HEADER_HEIGHT + allFields.length * ITEM_HEIGHT

      const containerId = nextId()
      nodeToCellId.set(node.id, containerId)
      const containerStyle = LIST_STYLE.replace('HEADER', String(HEADER_HEIGHT)) +
        'strokeColor=#82b366;fillColor=#d5e8d4;rounded=1;'
      cells.push(
        `      <mxCell id="${containerId}" value="${escapeXml(data.name)}" ` +
        `style="${containerStyle}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${NODE_WIDTH}" height="${totalHeight}" as="geometry" />` +
        `\n      </mxCell>`
      )

      allFields.forEach((field, i) => {
        const prefix = field.side === 'input' ? '\u2192 ' : '\u2190 '
        const itemId = nextId()
        const itemY = HEADER_HEIGHT + i * ITEM_HEIGHT
        cells.push(
          `      <mxCell id="${itemId}" value="${escapeXml(prefix + field.name)}" ` +
          `style="${ITEM_STYLE}" vertex="1" parent="${containerId}">` +
          `\n        <mxGeometry y="${itemY}" width="${NODE_WIDTH}" height="${ITEM_HEIGHT}" as="geometry" />` +
          `\n      </mxCell>`
        )
        nodeHandles.set(`${field.side}-${field.name}`, itemId)
      })
    } else if (isNoteNode(node)) {
      const { data } = node
      const text = data.collapsed ? data.name : `${data.name}\n${data.content}`
      const noteId = nextId()
      const noteStyle = 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;' +
        'fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;align=left;verticalAlign=top;spacingTop=4;spacingLeft=8;'
      const height = data.collapsed ? 30 : Math.max(60, 30 + (data.content.split('\n').length) * 18)
      nodeToCellId.set(node.id, noteId)
      cells.push(
        `      <mxCell id="${noteId}" value="${escapeXml(text)}" ` +
        `style="${noteStyle}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${NODE_WIDTH}" height="${height}" as="geometry" />` +
        `\n      </mxCell>`
      )
    } else if (isResourceNode(node)) {
      const { data } = node
      const resourceId = nextId()
      const w = 200
      const h = 150

      // Resource nodes reference uploaded resources — presigned URLs are ephemeral,
      // so we render as a labeled placeholder box in draw.io export
      const placeholderStyle = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#7dd3fc;' +
        'fontSize=12;verticalAlign=middle;align=center;'
      nodeToCellId.set(node.id, resourceId)
      cells.push(
        `      <mxCell id="${resourceId}" value="${escapeXml(data.name)}" ` +
        `style="${placeholderStyle}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${w}" height="${h}" as="geometry" />` +
        `\n      </mxCell>`
      )
    } else if (isIconNode(node)) {
      const { data } = node
      const iconCellId = nextId()
      nodeToCellId.set(node.id, iconCellId)
      // Render icon node as a labeled rounded rectangle (icon not representable in drawio XML)
      const iconStyle = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f1f5f9;strokeColor=#94a3b8;' +
        'fontSize=11;verticalAlign=middle;align=center;'
      cells.push(
        `      <mxCell id="${iconCellId}" value="${escapeXml(data.name)}" ` +
        `style="${iconStyle}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="80" height="60" as="geometry" />` +
        `\n      </mxCell>`
      )
    } else if (isShapeNode(node)) {
      const { data } = node
      const shapeCellId = nextId()
      nodeToCellId.set(node.id, shapeCellId)
      const w = node.measured?.width ?? node.width ?? 160
      const h = node.measured?.height ?? node.height ?? 80
      const fill = data.fillColor || '#eef2ff'
      const stroke = data.strokeColor || '#6366f1'
      const shapeStyleMap: Record<string, string> = {
        'rectangle': '',
        'rounded-rectangle': 'rounded=1;',
        'circle': 'ellipse;',
        'diamond': 'rhombus;',
        'parallelogram': 'shape=parallelogram;perimeter=parallelogramPerimeter;',
        'hexagon': 'shape=hexagon;perimeter=hexagonPerimeter2;',
        'triangle': 'triangle;',
        'cylinder': 'shape=cylinder3;whiteSpace=wrap;boundedLbl=1;size=15;',
      }
      const shapeStyle = shapeStyleMap[data.shape] || ''
      const label = data.text ? escapeXml(data.text) : escapeXml(data.name)
      const style = `${shapeStyle}whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontSize=12;verticalAlign=middle;align=center;`
      cells.push(
        `      <mxCell id="${shapeCellId}" value="${label}" ` +
        `style="${style}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${w}" height="${h}" as="geometry" />` +
        `\n      </mxCell>`
      )
    } else if (isGroupNode(node)) {
      const { data } = node
      const groupId = nextId()
      nodeToCellId.set(node.id, groupId)
      const w = node.measured?.width ?? node.width ?? 400
      const h = node.measured?.height ?? node.height ?? 300
      const fillColor = data.color || '#dbeafe'
      const strokeColor = data.borderColor || '#93c5fd'
      const rounded = (data.rounded ?? true) ? 'rounded=1;' : ''
      const groupStyle = `swimlane;startSize=24;fillColor=${fillColor};strokeColor=${strokeColor};${rounded}`
      cells.push(
        `      <mxCell id="${groupId}" value="${escapeXml(data.name)}" ` +
        `style="${groupStyle}" vertex="1" parent="${drawioParent(node)}">` +
        `\n        <mxGeometry x="${pos.x}" y="${pos.y}" ` +
        `width="${w}" height="${h}" as="geometry" />` +
        `\n      </mxCell>`
      )
    }
  }

  // Edges
  for (const pipe of pipes) {
    const sourceHandles = handleToCellId.get(pipe.source)
    const targetHandles = handleToCellId.get(pipe.target)
    if (!sourceHandles || !targetHandles) continue

    const sourceCellId = pipe.sourceHandle
      ? sourceHandles.get(pipe.sourceHandle)
      : undefined
    const targetCellId = pipe.targetHandle
      ? targetHandles.get(pipe.targetHandle)
      : undefined

    if (!sourceCellId || !targetCellId) continue

    const edgeId = nextId()
    cells.push(
      `      <mxCell id="${edgeId}" value="" ` +
      `style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;` +
      `html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" ` +
      `edge="1" source="${sourceCellId}" target="${targetCellId}" parent="1">` +
      `\n        <mxGeometry relative="1" as="geometry" />` +
      `\n      </mxCell>`
    )
  }

  return `<mxfile>
  <diagram name="Dataflow">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`
}

/**
 * Trigger browser download of a .drawio file.
 */
export function downloadDrawioFile(xml: string, filename = 'dataflow.drawio') {
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
