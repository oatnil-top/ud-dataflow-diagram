import type { AnyNode, Pipe } from '../store/flowStore'
import { graphToContext } from './graphToContext'

/**
 * The prompt a user copies into whatever chat window they have, so that pasting the
 * answer back draws a diagram. Also the in-app AI panel's system prompt: the two differ
 * only in their opening sentence, and the body is single-sourced here so they can never
 * drift apart.
 *
 * The body teaches the FULL graph format — the only format the editor accepts and the
 * only format of a stored diagram's data (master, 2026-08-26). It deliberately teaches no
 * coordinates: the caller declares structure, the editor solves the layout
 * (importFormats.ts).
 *
 * Three things in v2 are answers to measurements, not taste (design fb629b6a):
 *  - ONE example, not three. The examples were 60% of a 6.6KB prompt, and a free chat
 *    input box is the one budget we do not control.
 *  - Field-level handles are opt-in, not required. They were taught as mandatory while
 *    master's own two production diagrams use them on 0 of 61 edges (card 5df49fde) — a
 *    large hallucination surface bought nothing. Omitted, importFormats.ts fills
 *    perimeter handles from geometry.
 *  - A "Current graph" contract. buildCopyPrompt appends the canvas below the prompt when
 *    it is not empty, and this clause is what tells the model to reference those ids and
 *    return only additions. It is inert when no such section follows, which is why the
 *    in-app panel (which sends no canvas) can share the same body.
 *
 * "Respond with no fence" stays in, and is not relied on: 5 of 5 real runs fenced anyway.
 * The defence that works lives on the paste side (extractJson.ts).
 */
const DATAFLOW_PROMPT_BODY = `
Each node is a data entity (table, API response, object). Each pipe is a relationship
between two nodes (foreign key, mapping).

## Output format

Respond with ONE JSON object only — no markdown fence, no explanation before or after.
This is the editor's native format and the only one it accepts.

{
  "nodes": [
    { "id": "<short unique id>", "type": "json",
      "data": { "name": "<entity name>", "fields": [
        { "name": "<field>", "path": ["<field>"], "type": "<type>", "example": <value> }
      ] } }
  ],
  "pipes": [
    { "source": "<node id>", "target": "<node id>" }
  ]
}

## Rules

- Do NOT write "position" or any coordinates — the editor computes the layout.
- Every node needs "id" (short, stable; the entity name works), "type": "json", and
  "data.name". "data.fields" is an ARRAY of field objects, never a {key: value} map.
- "type" is one of "string" | "number" | "boolean" | "uuid" | "object" | "string[]" |
  "object[]". "example" is a realistic sample value ("alice@example.com", 1700000000,
  true, "uuid", "2025-01-15T10:30:00Z").
- A nested field has "type": "object" and a "children" array; each child's "path"
  includes the parent, e.g. ["address", "city"]. Flat relational tables have no children.
- "pipes" express relationships. "source"/"target" must exactly match a node "id".
  No relationship implied → "pipes": [].
- Only when you need to connect two specific FIELDS, add "sourceHandle":
  "output-<source field>" and "targetHandle": "input-<target field>" to that pipe.
  Otherwise omit both — the editor picks sensible anchors.

## Working on an existing diagram

If a "Current graph" section is provided below, that is what is already on my canvas:

- Reference its node ids directly in "pipes" to connect to what is already there.
- Output ONLY what should be ADDED — new nodes and new pipes. Do not repeat existing
  nodes. Repeating one is harmless (it is recognised by id and skipped) but it wastes
  your output space, and running out of space mid-answer is the one failure I cannot
  recover from.
- Adding only a relationship between two nodes that are already there? Then send
  "nodes": [] and put the connection in "pipes". That alone is a complete answer.

## Example

Given:
  Table users: id varchar(36) PK, email varchar(255)
  Table orders: id varchar(36) PK, user_id varchar(36) REFERENCES users(id)

The expected output is:

{
  "nodes": [
    { "id": "users", "type": "json", "data": { "name": "users", "fields": [
      { "name": "id", "path": ["id"], "type": "uuid", "example": "uuid" },
      { "name": "email", "path": ["email"], "type": "string", "example": "alice@example.com" }
    ] } },
    { "id": "orders", "type": "json", "data": { "name": "orders", "fields": [
      { "name": "id", "path": ["id"], "type": "uuid", "example": "uuid" },
      { "name": "user_id", "path": ["user_id"], "type": "uuid", "example": "uuid" }
    ] } }
  ],
  "pipes": [
    { "source": "users", "target": "orders",
      "sourceHandle": "output-id", "targetHandle": "input-user_id" }
  ]
}`

export const DATAFLOW_COPY_PROMPT = `You are a data flow diagram generator. Given a data structure description (SQL DDL, psql \\d output, API specs, plain text, etc.), generate a JSON graph. I will paste your answer into a diagram editor.
${DATAFLOW_PROMPT_BODY}`

/** System prompt for the in-app AI Generate panel */
export const DATAFLOW_SYSTEM_PROMPT = `You are a data flow diagram generator. The user will provide structured data descriptions (SQL DDL, psql \\d output, API specs, plain text, etc.) and you must parse them into a JSON structure representing data flow nodes and their connections.
${DATAFLOW_PROMPT_BODY}`

export interface CopyPrompt {
  text: string
  /** Nodes handed to the model as context; 0 when the canvas was empty. */
  contextNodes: number
  /** True when the canvas was too large to send in full — example values were dropped. */
  degraded: boolean
}

/**
 * The prompt as it goes to the clipboard: the static body, plus the current canvas when
 * there is one. An empty canvas gets the prompt alone — the "Current graph" clause above
 * is written to be inert without this section.
 */
export function buildCopyPrompt(nodes: AnyNode[], pipes: Pipe[]): CopyPrompt {
  if (nodes.length === 0) {
    return { text: DATAFLOW_COPY_PROMPT, contextNodes: 0, degraded: false }
  }
  const context = graphToContext(nodes, pipes)
  return {
    text: `${DATAFLOW_COPY_PROMPT}

## Current graph

${context.json}`,
    contextNodes: context.nodeCount,
    degraded: context.degraded,
  }
}
