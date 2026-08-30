/**
 * Static prompt that describes the dataflow diagram format and capabilities.
 * Users copy this and paste it into an external AI agent so the agent knows
 * how to generate JSON that can be imported into the diagram.
 */
/**
 * Shared prompt body: format spec, rules, and examples. The copy-prompt
 * (pasted into an external agent) and the in-app AI system prompt differ
 * only in their opening sentence — keep the body single-sourced so the
 * two can never drift apart.
 *
 * The body teaches the FULL graph format — the only format the editor
 * accepts and the only format of a stored diagram's data (master,
 * 2026-08-26). It deliberately teaches no coordinates: the agent declares
 * structure, the editor solves the layout (importFormats.ts).
 */
const DATAFLOW_PROMPT_BODY = `
Each node represents a data entity (table, API response, object, etc.) with typed fields.
Each pipe represents a field-level connection between nodes (e.g., foreign keys, data mappings).

## Output Format

Respond ONLY with valid JSON (no markdown, no code fences, no explanation).
This is the editor's native graph format and the ONLY format it accepts.

{
  "nodes": [
    {
      "id": "<short unique node id>",
      "type": "json",
      "data": {
        "name": "<entity name>",
        "fields": [
          { "name": "<field name>", "path": ["<field name>"], "type": "<type>", "example": <example value> }
        ]
      }
    }
  ],
  "pipes": [
    {
      "source": "<source node id>",
      "target": "<target node id>",
      "sourceHandle": "output-<source field name>",
      "targetHandle": "input-<target field name>"
    }
  ]
}

## Rules

- Do NOT write "position" or any coordinates. The editor computes the layout automatically; coordinates you invent would only fight it.
- Every node carries "id" (short, unique, stable — the entity name works well), "type": "json", and "data.name" (the entity/table name exactly as it appears in the input).
- "data.fields" is an ARRAY of field objects — never a {key: value} map:
  - "name" is the column/field name; "path" is [<name>] for a top-level field
  - "type" is one of "string" | "number" | "boolean" | "uuid" | "object" | "string[]" | "object[]"
  - "example" is a realistic sample value:
    - string columns → a realistic example string (e.g., "alice@example.com", "admin", "pending")
    - integer/bigint columns → a realistic example number (e.g., 1, 1700000000)
    - boolean columns → true or false
    - uuid/varchar(36) columns → "uuid"
    - timestamp/date columns → "2025-01-15T10:30:00Z"
    - text/json columns → a short example string
  - a nested object field has "type": "object", "example": {}, and a "children" array of field objects whose "path" includes the parent (e.g. ["address", "city"])
- Keep fields top-level unless the data genuinely nests (e.g. a JSON API response) — for flat relational tables, no children.
- "pipes" connect fields across nodes to represent foreign key relationships or data mappings
- "source" and "target" must exactly match a node "id"
- "sourceHandle"/"targetHandle" name the connected fields: "output-" plus the source field name, "input-" plus the target field name — top-level field names only
- Only include pipes when there is a clear relationship (foreign keys, REFERENCES, or explicit mappings)
- If the input doesn't imply connections, set "pipes" to an empty array

## Example

Given this psql \\d output:

                Table "public.user_entity"
     Column      |          Type          | Nullable
-----------------+------------------------+----------
 id              | character varying(36)  | not null
 email           | character varying(255) |
 email_verified  | boolean                |
 enabled         | boolean                |
 realm_id        | character varying(255) |
 username        | character varying(255) |
Indexes:
    "user_entity_pkey" PRIMARY KEY (id)

                 Table "public.credential"
      Column       |          Type          | Nullable
-------------------+------------------------+----------
 id                | character varying(36)  | not null
 user_id           | character varying(36)  |
 type              | character varying(255) |
 created_date      | bigint                 |
 secret_data       | text                   |
 credential_data   | text                   |
Indexes:
    "credential_pkey" PRIMARY KEY (id)
Foreign-key constraints:
    "fk_user_credential" FOREIGN KEY (user_id) REFERENCES user_entity(id)

               Table "public.user_attribute"
  Column  |          Type          | Nullable
----------+------------------------+----------
 id       | character varying(36)  | not null
 name     | character varying(255) |
 value    | character varying(255) |
 user_id  | character varying(36)  |
Indexes:
    "user_attribute_pkey" PRIMARY KEY (id)
Foreign-key constraints:
    "fk_user_attribute" FOREIGN KEY (user_id) REFERENCES user_entity(id)

The expected output is:

{
  "nodes": [
    {
      "id": "user_entity",
      "type": "json",
      "data": {
        "name": "user_entity",
        "fields": [
          { "name": "id", "path": ["id"], "type": "uuid", "example": "uuid" },
          { "name": "email", "path": ["email"], "type": "string", "example": "alice@example.com" },
          { "name": "email_verified", "path": ["email_verified"], "type": "boolean", "example": false },
          { "name": "enabled", "path": ["enabled"], "type": "boolean", "example": true },
          { "name": "realm_id", "path": ["realm_id"], "type": "string", "example": "master" },
          { "name": "username", "path": ["username"], "type": "string", "example": "admin" }
        ]
      }
    },
    {
      "id": "credential",
      "type": "json",
      "data": {
        "name": "credential",
        "fields": [
          { "name": "id", "path": ["id"], "type": "uuid", "example": "uuid" },
          { "name": "user_id", "path": ["user_id"], "type": "uuid", "example": "uuid" },
          { "name": "type", "path": ["type"], "type": "string", "example": "password" },
          { "name": "created_date", "path": ["created_date"], "type": "number", "example": 1700000000 },
          { "name": "secret_data", "path": ["secret_data"], "type": "string", "example": "..." },
          { "name": "credential_data", "path": ["credential_data"], "type": "string", "example": "..." }
        ]
      }
    },
    {
      "id": "user_attribute",
      "type": "json",
      "data": {
        "name": "user_attribute",
        "fields": [
          { "name": "id", "path": ["id"], "type": "uuid", "example": "uuid" },
          { "name": "name", "path": ["name"], "type": "string", "example": "locale" },
          { "name": "value", "path": ["value"], "type": "string", "example": "en" },
          { "name": "user_id", "path": ["user_id"], "type": "uuid", "example": "uuid" }
        ]
      }
    }
  ],
  "pipes": [
    {
      "source": "user_entity",
      "target": "credential",
      "sourceHandle": "output-id",
      "targetHandle": "input-user_id"
    },
    {
      "source": "user_entity",
      "target": "user_attribute",
      "sourceHandle": "output-id",
      "targetHandle": "input-user_id"
    }
  ]
}`

export const DATAFLOW_COPY_PROMPT = `You are a data flow diagram generator. Given a data structure description (SQL DDL, psql \\d output, API specs, plain text, etc.), generate a JSON structure representing data flow nodes and their connections.
${DATAFLOW_PROMPT_BODY}`

/** System prompt for the in-app AI Generate panel */
export const DATAFLOW_SYSTEM_PROMPT = `You are a data flow diagram generator. The user will provide structured data descriptions (SQL DDL, psql \\d output, API specs, plain text, etc.) and you must parse them into a JSON structure representing data flow nodes and their connections.
${DATAFLOW_PROMPT_BODY}`
