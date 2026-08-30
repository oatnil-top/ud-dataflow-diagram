import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The playground is a second consumer of src/, wired the same way ud is (source alias, no
// build of the package). One node_modules, so no resolve.dedupe is needed here.
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@oatnil/ud-dataflow-diagram': path.resolve(__dirname, '../src') } },
  build: { outDir: 'dist', emptyOutDir: true },   // playground/dist — gitignored (.gitignore:13)
})
