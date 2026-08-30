/**
 * Serialize a dataflow graph into a compact, token-friendly text format
 * suitable for pasting into AI agent conversations.
 *
 * Output is structured Markdown that is both human-readable and easy for
 * LLMs to parse.  Dynamic fields (UUIDs, positions) are omitted to keep
 * the payload small.
 */
import type { Node, Edge } from '@xyflow/react'
import type {
  JsonNodeData,
  ProcessNodeData,
  NoteNodeData,
  ResourceNodeData,
  ShapeNodeData,
  GroupNodeData,
  Field,
} from '../types'

// ── type guards ────────────────────────────────────────────────────────
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
function isShapeNode(node: Node): node is Node<ShapeNodeData> {
  return node.type === 'shape'
}
function isGroupNode(node: Node): node is Node<GroupNodeData> {
  return node.type === 'group'
}

// ── helpers ────────────────────────────────────────────────────────────

/** Render fields as indented lines: `  - name (type): example` */
function renderFields(fields: Field[], indent = 2): string {
  const pad = ' '.repeat(indent)
  const lines: string[] = []
  for (const f of fields) {
    const example = f.example !== undefined && f.example !== null && f.example !== ''
      ? `: ${JSON.stringify(f.example)}`
      : ''
    const desc = f.desc ? `  # ${f.desc}` : ''
    lines.push(`${pad}- ${f.name} (${f.type})${example}${desc}`)
    if (f.children && f.children.length > 0) {
      lines.push(renderFields(f.children, indent + 2))
    }
  }
  return lines.join('\n')
}

/** Parse a handle string like "output-profile.age" into a field path */
function handleToField(handle: string | undefined): string | undefined {
  if (!handle) return undefined
  // handles look like "output-fieldName" or "input-fieldName"
  const match = handle.match(/^(?:output|input)-(.+)$/)
  return match ? match[1] : undefined
}

// ── main export ────────────────────────────────────────────────────────

export function graphToText(nodes: Node[], pipes: Edge[]): string {
  const sections: string[] = []

  // Build a node-id → name lookup for connections
  const idToName: Record<string, string> = {}
  for (const node of nodes) {
    const data = node.data as { name?: string }
    idToName[node.id] = data?.name || node.id
  }

  // ── Group nodes ──────────────────────────────────────────────────
  const groupNodes = nodes.filter(isGroupNode)
  const childToGroup: Record<string, string> = {}
  for (const node of nodes) {
    if (node.parentId) {
      childToGroup[node.id] = node.parentId
    }
  }

  if (groupNodes.length > 0) {
    sections.push('## Groups\n')
    for (const g of groupNodes) {
      const children = nodes.filter(n => n.parentId === g.id).map(n => idToName[n.id])
      sections.push(`- **${g.data.name}**${children.length > 0 ? `: ${children.join(', ')}` : ''}`)
    }
    sections.push('')
  }

  // ── JSON nodes ───────────────────────────────────────────────────
  const jsonNodes = nodes.filter(isJsonNode)
  if (jsonNodes.length > 0) {
    sections.push('## Entities\n')
    for (const n of jsonNodes) {
      const group = childToGroup[n.id] ? ` (in ${idToName[childToGroup[n.id]]})` : ''
      const url = n.data.url ? ` — ${n.data.url}` : ''
      sections.push(`### ${n.data.name}${group}${url}\n`)
      if (n.data.fields.length > 0) {
        sections.push(renderFields(n.data.fields))
        sections.push('')
      }
    }
  }

  // ── Process nodes ────────────────────────────────────────────────
  const processNodes = nodes.filter(isProcessNode)
  if (processNodes.length > 0) {
    sections.push('## Transforms\n')
    for (const n of processNodes) {
      sections.push(`### ${n.data.name}\n`)
      if (n.data.inputFields.length > 0) {
        sections.push(`  Inputs: ${n.data.inputFields.join(', ')}`)
      }
      if (n.data.outputFields.length > 0) {
        sections.push('  Outputs:')
        for (const o of n.data.outputFields) {
          const desc = o.desc ? `  # ${o.desc}` : ''
          sections.push(`    - ${o.name} = \`${o.expression}\`${desc}`)
        }
      }
      sections.push('')
    }
  }

  // ── Note nodes ───────────────────────────────────────────────────
  const noteNodes = nodes.filter(isNoteNode)
  if (noteNodes.length > 0) {
    sections.push('## Notes\n')
    for (const n of noteNodes) {
      const content = n.data.content?.trim()
      if (content) {
        sections.push(`- **${n.data.name}**: ${content}`)
      } else {
        sections.push(`- **${n.data.name}**`)
      }
    }
    sections.push('')
  }

  // ── Shape nodes ─────────────────────────────────────────────────
  const shapeNodes = nodes.filter(isShapeNode)
  if (shapeNodes.length > 0) {
    sections.push('## Shapes\n')
    for (const n of shapeNodes) {
      const text = n.data.text ? ` — "${n.data.text}"` : ''
      sections.push(`- **${n.data.name}** [${n.data.shape}]${text}`)
    }
    sections.push('')
  }

  // ── Resource nodes ───────────────────────────────────────────────
  const resourceNodes = nodes.filter(isResourceNode)
  if (resourceNodes.length > 0) {
    sections.push('## Resources\n')
    for (const n of resourceNodes) {
      const alt = n.data.alt ? ` — ${n.data.alt}` : ''
      const ref = n.data.resourceId ? ` (resource:${n.data.resourceId})` : ''
      sections.push(`- **${n.data.name}**${alt}${ref}`)
    }
    sections.push('')
  }

  // ── Connections ──────────────────────────────────────────────────
  // Filter out note/image attachment pipes (no field mapping)
  const fieldPipes = pipes.filter(p => {
    const srcField = handleToField(p.sourceHandle ?? undefined)
    const tgtField = handleToField(p.targetHandle ?? undefined)
    return srcField || tgtField
  })

  // Also include node-level connections (no field handles)
  const nodePipes = pipes.filter(p => {
    const srcField = handleToField(p.sourceHandle ?? undefined)
    const tgtField = handleToField(p.targetHandle ?? undefined)
    return !srcField && !tgtField
  })

  if (fieldPipes.length > 0 || nodePipes.length > 0) {
    sections.push('## Connections\n')
    for (const p of fieldPipes) {
      const srcName = idToName[p.source] || p.source
      const tgtName = idToName[p.target] || p.target
      const srcField = handleToField(p.sourceHandle ?? undefined) || '*'
      const tgtField = handleToField(p.targetHandle ?? undefined) || '*'
      sections.push(`- ${srcName}.${srcField} -> ${tgtName}.${tgtField}`)
    }
    for (const p of nodePipes) {
      const srcName = idToName[p.source] || p.source
      const tgtName = idToName[p.target] || p.target
      sections.push(`- ${srcName} -> ${tgtName}`)
    }
    sections.push('')
  }

  const header = '# Dataflow Diagram\n'
  return header + sections.join('\n').trim() + '\n'
}
