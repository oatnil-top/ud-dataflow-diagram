import type { AnyNode, Pipe } from '../store/flowStore'
import { graphToContext } from './graphToContext'

/**
 * The in-app AI Generate panel's system prompt — WHOLE-GRAPH JSON.
 *
 * It used to be shared with the copy-to-clipboard prompt; the two have parted ways
 * (design fb629b6a note 9630c775 section 2). This panel asks a host-configured model for
 * a whole diagram, which is what JSON is for and what the model behind it is known to
 * handle. The clipboard prompt now teaches the edit DSL instead, because it serves a
 * different job (a small change, in someone else's free chat window) with a different
 * constraint (output length).
 *
 * Whether this panel should follow is a separate decision, deliberately not taken here.
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

/** System prompt for the in-app AI Generate panel */
export const DATAFLOW_SYSTEM_PROMPT = `You are a data flow diagram generator. The user will provide structured data descriptions (SQL DDL, psql \\d output, API specs, plain text, etc.) and you must parse them into a JSON structure representing data flow nodes and their connections.
${DATAFLOW_PROMPT_BODY}`

/**
 * The text a user copies into whatever chat window they have, so that pasting the answer
 * back EDITS their diagram.
 *
 * This is a teaching material, not a serialization format. It defines four verbs —
 * `node`, `icon`, `group`, `link` (master 2026-09-04: structure is sayable, geometry
 * never) — and store/dslParser.ts is the implementation of exactly this contract.
 * Change one and change the other: this paragraph is what a stranger's model reads,
 * and the parser is what their answer meets. The icon whitelist below mirrors
 * NodeIcon.tsx's LUCIDE_ICONS map — an id outside it renders as a caption with no
 * glyph, so keep the two lists in step too.
 *
 * WHY IT IS NOT JSON ANY MORE (design fb629b6a note 9630c775). Measured, same request,
 * same model: five tables and their foreign keys came back as 3665 bytes / 1110 tokens of
 * JSON and 468 bytes / 113 tokens of this. Output length is the whole ballgame in a free
 * chat window — it is where answers get cut off — and the shape of the damage differs
 * too. Truncate this and every complete line still applies, because each line is parsed
 * alone; truncate JSON and half an object takes the whole answer with it. Measured there
 * as well: cut at 300 bytes, five nodes landed and only the tail line was flagged.
 *
 * IT DOES NOT CARRY THE GRAPH. Earlier versions appended the current canvas below the
 * prompt. It is a separate button now (buildGraphForEditing) because most requests do not
 * need it, and a canvas pasted into every conversation was spending the one budget that
 * matters on context the model was not going to use. The material tells the model to ASK
 * when it needs the graph, and a real run confirmed it does.
 *
 * These 2346 bytes (~590 tokens, measured 2026-09-04; the icon whitelist is ~440 bytes
 * of that) are the delivered artifact, not a draft of one.
 */
export const DATAFLOW_COPY_PROMPT = `Turn my request into diagram edit commands — plain text, ONE command per line, nothing else. No JSON, no code fence, no explanations.

Commands:
node <id> <display name>: <field> <type>, <field> <type>, ...
icon <id> <display name>: <icon-id>
group <id> <display name> @<preset>: <memberId>, <memberId>, ...
link <sourceId> -> <targetId>

Rules:
- "node" is a data entity (table, API object). With a new id it CREATES; with an existing id it MODIFIES: the display name is replaced, listed fields are added or updated by name, existing fields are never removed.
- ids are short ascii words; the display name may be in any language; the ": ..." part is optional.
- <type> is one of string | number | boolean | uuid | object (optional, default string). Nested fields use dots: address.city string
- "icon" is an architecture element (service, gateway, queue...). <icon-id> is lucide:<Name>, Name one of: User Users Building2 Contact Server Cpu Monitor Laptop Smartphone Tablet Terminal Container Database HardDrive Archive FolderOpen MemoryStick Globe Network Wifi Router Cable Cloud CloudCog CloudUpload CloudDownload Shield Lock Key ShieldCheck Fingerprint Mail MessageSquare Bell Send Webhook Blocks Workflow Plug GitBranch RefreshCcw Layers Boxes Cog Zap BarChart3 FileText Clock Sparkles
- "group" draws a container around EXISTING members — write the members' own lines first. @<preset> is optional, one of cloud region network security cluster service danger subtle (a VPC is @network, a k8s/AKS cluster is @cluster).
- "link" connects two ids (nodes, icons or groups) — ids from my current graph (I may paste it in this chat) or ids you created above. To connect two specific fields: link users.id -> orders.user_id
- Direction follows the reference: from the entity being referenced to the entity holding the reference.
- NEVER write positions, sizes or coordinates — I arrange the canvas myself.
- Never invent ids I did not give you, except ids for nodes you are creating. If my request refers to my existing diagram and I have not pasted my current graph, ask me for it in plain text first.

Example:
node users 用户: id uuid, email string
node orders 订单: id uuid, user_id uuid, total number
link users.id -> orders.user_id
icon gw API Gateway: lucide:Globe
group vpc 生产 VPC @network: users, orders, gw
link gw -> users`

export interface GraphForEditing {
  text: string
  /** Nodes handed to the model; 0 when the canvas was empty. */
  nodeCount: number
  /** True when the canvas was too large to send in full — example values were dropped. */
  degraded: boolean
}

/**
 * The current diagram, for pasting into a chat that has already been taught the DSL.
 *
 * Its own button, on purpose. The material above teaches editing without needing a graph,
 * and a request like "add a payments table" needs no context at all; only "connect
 * products to orders" and "rename users" do, and those are the moments the user reaches
 * for this. Splitting them means the common case does not pay for the rare one.
 *
 * READ material, not a WRITE format: the model reads ids out of this JSON and answers in
 * the DSL. It is graphToContext (the import format minus geometry) precisely so the ids
 * it shows are the ids a `link` line has to name.
 */
export function buildGraphForEditing(nodes: AnyNode[], pipes: Pipe[]): GraphForEditing {
  if (nodes.length === 0) return { text: '', nodeCount: 0, degraded: false }
  const context = graphToContext(nodes, pipes)
  return {
    text: `This is my current diagram. Use these ids when you write link and node commands.

${context.json}`,
    nodeCount: context.nodeCount,
    degraded: context.degraded,
  }
}
