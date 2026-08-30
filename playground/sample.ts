/**
 * The diagram on the canvas when someone opens the playground for the first time.
 *
 * Entirely fabricated — no diagram, name, address or id here comes from any UnDercontrol
 * instance (CLAUDE.md "Never in this repo"). Coordinates and ids are hand-written rather
 * than exported from a real board for the same reason.
 *
 * The shape is exactly what `flowStore.exportGraph()` writes (flowStore.ts:881): `nodes`
 * and `pipes`. `edges` is accepted as an alias when reading (importFormats.ts:84), but
 * `pipes` is what the editor writes and what the Copy-prompt reference asks an agent for.
 *
 * Every `type` here must be a key of `registry.nodeTypes` / `edgeTypes` — an unknown type
 * renders as a blank box with no error (registry.ts:13-18). __tests__/sample.test.ts is
 * the gate on that.
 */
export const SAMPLE_JSON = JSON.stringify({
  nodes: [
    // Groups come before their children: React Flow requires a parent to exist first, and a
    // child's `position` is RELATIVE to its parent (groupDrop.ts:24-32).
    {
      id: 'g_storefront',
      type: 'group',
      position: { x: 40, y: 80 },
      style: { width: 280, height: 300 },
      data: { name: 'Storefront', stylePreset: 'cloud' },
    },
    {
      id: 'g_backend',
      type: 'group',
      position: { x: 420, y: 80 },
      style: { width: 360, height: 400 },
      data: { name: 'Order backend', stylePreset: 'cluster' },
    },
    {
      id: 'n_internet',
      type: 'icon',
      parentId: 'g_storefront',
      position: { x: 80, y: 60 },
      data: { name: 'Internet', icon: 'lucide:Globe' },
    },
    {
      id: 'n_checkout',
      type: 'icon',
      parentId: 'g_storefront',
      position: { x: 80, y: 190 },
      data: { name: 'Checkout API', icon: 'aws:lambda' },
    },
    {
      id: 'n_orders_svc',
      type: 'icon',
      parentId: 'g_backend',
      position: { x: 50, y: 60 },
      data: { name: 'Order service', icon: 'lucide:Server' },
    },
    {
      id: 'n_queue',
      type: 'icon',
      parentId: 'g_backend',
      position: { x: 220, y: 60 },
      data: { name: 'Order queue', icon: 'aws:sqs' },
    },
    {
      id: 'n_postgres',
      type: 'icon',
      parentId: 'g_backend',
      position: { x: 50, y: 250 },
      data: { name: 'Postgres', icon: 'lucide:Database' },
    },
    {
      id: 'n_worker',
      type: 'icon',
      parentId: 'g_backend',
      position: { x: 220, y: 250 },
      data: { name: 'Fulfilment worker', icon: 'k8s:pod' },
    },
    {
      id: 'n_orders_tbl',
      type: 'json',
      position: { x: 880, y: 80 },
      data: {
        name: 'orders',
        fields: [
          { id: 'f_ord_id', name: 'id', path: ['id'], type: 'string', example: 'ord_01' },
          { id: 'f_ord_cust', name: 'customer_id', path: ['customer_id'], type: 'string', example: 'cus_01' },
          { id: 'f_ord_total', name: 'total', path: ['total'], type: 'number', example: 42 },
        ],
      },
    },
    {
      id: 'n_customers_tbl',
      type: 'json',
      position: { x: 880, y: 330 },
      data: {
        name: 'customers',
        fields: [
          { id: 'f_cus_id', name: 'id', path: ['id'], type: 'string', example: 'cus_01' },
          { id: 'f_cus_email', name: 'email', path: ['email'], type: 'string', example: 'pat@example.com' },
        ],
      },
    },
    {
      id: 'n_note',
      type: 'note',
      position: { x: 40, y: 430 },
      style: { width: 300 },
      data: {
        name: 'How this diagram was made',
        content: 'Agents write this JSON without coordinates; the editor lays it out. Edit anything, then Copy prompt to regenerate.',
        collapsed: false,
      },
    },
  ],
  pipes: [
    { id: 'p_1', type: 'dataflow', source: 'n_internet', target: 'n_checkout', data: { name: '', description: 'HTTPS' } },
    { id: 'p_2', type: 'dataflow', source: 'n_checkout', target: 'n_orders_svc', data: { name: '', description: 'POST /orders' } },
    { id: 'p_3', type: 'dataflow', source: 'n_orders_svc', target: 'n_queue', data: { name: '', description: 'enqueue' } },
    { id: 'p_4', type: 'dataflow', source: 'n_queue', target: 'n_worker', data: { name: '', description: 'dequeue' } },
    { id: 'p_5', type: 'dataflow', source: 'n_orders_svc', target: 'n_postgres', data: { name: '', description: 'INSERT' } },
    { id: 'p_6', type: 'dataflow', source: 'n_worker', target: 'n_postgres', data: { name: '', description: 'UPDATE status' } },
    { id: 'p_7', type: 'dataflow', source: 'n_postgres', target: 'n_orders_tbl', data: { name: '', description: 'table' } },
    {
      id: 'p_8',
      type: 'dataflow',
      source: 'n_orders_tbl',
      target: 'n_customers_tbl',
      sourceHandle: 'output-customer_id',
      targetHandle: 'input-id',
      data: { name: '', description: 'FK', sourceField: 'customer_id', targetField: 'id' },
    },
  ],
}, null, 2)
