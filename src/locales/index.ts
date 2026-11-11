/**
 * The `@oatnil/ud-dataflow-diagram/locales` subpath: the package's i18n strings and nothing
 * else. A host registers them at startup, before any diagram is on screen; importing them
 * from the package root instead drags the whole editor (xyflow, every node type, the root's
 * `import './index.css'` side effect) into the host's startup bundle, because a CSS
 * side-effect import is something no bundler may tree-shake away. ud's entry chunk carried
 * the editor for exactly this reason (ud card 0c0ab2b9, item F2).
 */
export { registerDataflowMessages } from './register'
