import { defineConfig } from 'tsup'

/**
 * Builds the npm-consumer artifact. ⛔ This is NOT how ud consumes the package.
 *
 * TWO CONSUMPTION PATHS, and they must both keep working:
 *
 *   1. ud-vite-app — aliases '@oatnil/ud-dataflow-diagram' straight at ../ud-dataflow-diagram/src
 *      (see ud-vite-app/vite.config.ts). That alias rewrites the specifier to an absolute path
 *      BEFORE node resolution, so it never reads main/types/exports below. Changing those fields
 *      cannot affect ud. What WOULD break ud is deleting or restructuring src/ — so `files` still
 *      ships src/, and this build only ADDS dist/.
 *
 *   2. npm consumers — get dist/. They need this because shipping raw .ts breaks them two ways,
 *      both measured on a clean project (see the task note): webpack-family builders (Next, CRA)
 *      fail with `Module parse failed` on TS-only syntax in node_modules unless the consumer adds
 *      `transpilePackages`, and the consumer's own tsc typechecks our .tsx — where `skipLibCheck`
 *      does NOT help, because it only skips .d.ts. dist/ solves both: plain JS to parse, and a
 *      .d.ts that skipLibCheck does cover.
 *
 * ⚠️ CSS: src/index.ts ends with `import './index.css'`. esbuild extracts that to dist/index.css
 * and strips the import from the JS, so npm consumers must import the stylesheet themselves.
 * That asymmetry is why the export map below exposes './styles'. The source path (ud) is
 * unaffected — Vite still resolves the import inside src/.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // peerDependencies and dependencies stay external — a component library must not bundle
  // React (two copies = a runtime hooks error) nor duplicate its own deps into every consumer.
  external: [/^react($|\/)/, /^react-dom($|\/)/],
})
