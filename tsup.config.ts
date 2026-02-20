import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false, // Mejor dejarlo legible para debugging en esta fase
    outExtension({ format }) {
        return {
            js: format === 'cjs' ? '.cjs' : '.js',
        };
    },
    // Asegurar que node-forge y otros no causen problemas de bundling
    external: ['https', 'crypto'],
});
