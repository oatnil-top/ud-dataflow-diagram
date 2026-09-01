// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseDsl } from '../dslParser'

/**
 * The grammar, its tolerance list and its truncation behaviour — design fb629b6a note
 * 9630c775 §4/§5. Every case here is a line of text a chat model plausibly emits, and
 * the assertion is on the EditPlan, never on a rendered canvas.
 */

describe('grammar — the two verbs', () => {
  it('parses the design §6 runF output verbatim: 5 nodes, 4 field-level links', () => {
    const plan = parseDsl(`node users 用户: id uuid, name string, email string
node products 商品: id uuid, name string, price number
node orders 订单: id uuid, user_id uuid, total number
node order_items 订单项: id uuid, order_id uuid, product_id uuid, quantity number
node payments 支付记录: id uuid, order_id uuid, amount number
link users.id -> orders.user_id
link orders.id -> order_items.order_id
link products.id -> order_items.product_id
link orders.id -> payments.order_id`)

    expect(plan.badLines).toEqual([])
    expect(plan.ops.filter((o) => o.kind === 'node')).toHaveLength(5)
    expect(plan.ops.filter((o) => o.kind === 'link')).toHaveLength(4)
    expect(plan.ops[0]).toMatchObject({
      kind: 'node',
      id: 'users',
      name: '用户',
      fields: [
        { name: 'id', path: ['id'], type: 'uuid' },
        { name: 'name', path: ['name'], type: 'string' },
        { name: 'email', path: ['email'], type: 'string' },
      ],
    })
    expect(plan.ops[5]).toMatchObject({
      kind: 'link', source: 'users', sourceField: 'id', target: 'orders', targetField: 'user_id',
    })
  })

  it('a node line with no ": fields" part is a rename-only op', () => {
    const plan = parseDsl('node users 客户')
    expect(plan.ops[0]).toMatchObject({ kind: 'node', id: 'users', name: '客户', fields: [] })
  })

  it('a node line with no display name leaves the name alone', () => {
    const plan = parseDsl('node users: phone string')
    expect(plan.ops[0]).toMatchObject({ kind: 'node', id: 'users', fields: [{ name: 'phone' }] })
    expect((plan.ops[0] as { name?: string }).name).toBeUndefined()
  })

  it('a field with no type defaults to string; an unknown type is kept verbatim', () => {
    const plan = parseDsl('node t x: a, b bigint')
    expect((plan.ops[0] as { fields: unknown[] }).fields).toEqual([
      { name: 'a', path: ['a'], type: 'string' },
      { name: 'b', path: ['b'], type: 'bigint' },
    ])
  })

  it('a dotted field name is a nested path', () => {
    const plan = parseDsl('node users 客户: address.city string')
    expect((plan.ops[0] as { fields: unknown[] }).fields).toEqual([
      { name: 'city', path: ['address', 'city'], type: 'string' },
    ])
  })

  it('a node-level link carries no field anchors', () => {
    const plan = parseDsl('link products -> orders')
    expect(plan.ops[0]).toMatchObject({ kind: 'link', source: 'products', target: 'orders' })
    expect(plan.ops[0]).not.toHaveProperty('sourceField')
  })
})

describe('tolerance list — §4', () => {
  it('full-width punctuation, alternate arrows and verb case all normalise', () => {
    const plan = parseDsl(`NODE users 用户: id uuid， email string
Link users → orders
link a => b
link c --> d`)
    expect(plan.badLines).toEqual([])
    expect((plan.ops[0] as { fields: unknown[] }).fields).toHaveLength(2)
    expect(plan.ops.slice(1)).toMatchObject([
      { source: 'users', target: 'orders' },
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ])
  })

  it('blank lines and # / // comments are skipped, not reported', () => {
    const plan = parseDsl('# here you go\n\n// and one link\nlink a -> b\n')
    expect(plan.badLines).toEqual([])
    expect(plan.ops).toHaveLength(1)
  })

  it('an unreadable line in the middle is reported by line number and the rest still parse', () => {
    const plan = parseDsl('node a A\nI hope this helps!\nlink a -> b')
    expect(plan.ops).toHaveLength(2)
    expect(plan.badLines).toEqual([{ line: 2, reason: 'unrecognized', text: 'I hope this helps!' }])
  })
})

describe('truncation — §5, each line succeeds or fails alone', () => {
  it('the design §5 measurement: cut at 300 bytes, 5 nodes land and only the tail is flagged', () => {
    const full = `node users 用户: id uuid, name string, email string
node products 商品: id uuid, name string, price number
node orders 订单: id uuid, user_id uuid, total number
node order_items 订单项: id uuid, order_id uuid, product_id uuid, quantity number
node payments 支付记录: id uuid, order_id uuid, amount number
link users.id -> orders.user_id`
    const cut = new TextDecoder().decode(new TextEncoder().encode(full).slice(0, 300))

    const plan = parseDsl(cut)

    expect(plan.ops.filter((o) => o.kind === 'node').length).toBeGreaterThanOrEqual(4)
    expect(plan.badLines.every((b) => b.reason === 'maybeTruncated')).toBe(true)
    expect(plan.badLines.length).toBeLessThanOrEqual(1)
  })

  it('a half-written link on the LAST line is maybeTruncated, not unrecognized', () => {
    const plan = parseDsl('node a A\nlink use')
    expect(plan.ops).toHaveLength(1)
    expect(plan.badLines).toEqual([{ line: 2, reason: 'maybeTruncated', text: 'link use' }])
  })
})

describe('§8(b)2 — the silent merge, blocked at the line level', () => {
  it('two node lines with the same id and BOTH carrying fields: the second is a named conflict', () => {
    const plan = parseDsl('node t 表一: a string\nnode t 表二: b string')
    expect(plan.ops).toHaveLength(1)
    expect(plan.badLines).toEqual([
      { line: 2, reason: 'duplicateNodeId', text: 'node t 表二: b string' },
    ])
  })

  it('naming a node then adding fields to it is NOT a conflict — only one line carries fields', () => {
    const plan = parseDsl('node t 表一\nnode t: b string')
    expect(plan.ops).toHaveLength(2)
    expect(plan.badLines).toEqual([])
  })
})

describe('nothing at all', () => {
  it('prose with no commands yields zero ops and zero suspicious lines — the noJson signal', () => {
    const plan = parseDsl('I cannot help with that request.')
    expect(plan.ops).toEqual([])
    expect(plan.badLines).toEqual([])
  })
})
