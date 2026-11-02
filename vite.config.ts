import { defineConfig } from 'vite'

/**
 * The React wrapper's build.
 *
 * `react`, `react/jsx-runtime` and `@gingerdocs/embed` are **external**: they are
 * peer dependencies, and bundling them would give an integrator a second copy of
 * React inside a package whose entire job is to call `useEffect`.
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.tsx',
      name: 'GingerDocsReact',
      formats: ['es', 'umd'],
      fileName: format => `gingerdocs-react.${format === 'umd' ? 'umd.cjs' : 'js'}`,
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', '@gingerdocs/embed'],
      output: {
        globals: {
          react: 'React',
          'react/jsx-runtime': 'jsxRuntime',
          '@gingerdocs/embed': 'GingerDocsEmbed',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
  },
})
