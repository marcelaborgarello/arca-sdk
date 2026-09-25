import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/integration/**/*.test.ts'],
        // ARCA homologación es lento y se cae seguido; un comprobante puede tardar
        // varios segundos entre FECompUltimoAutorizado y FECAESolicitar.
        testTimeout: 60_000,
        hookTimeout: 60_000,
        // Correlatividad: dos requests simultáneos para el mismo punto de venta y tipo
        // de comprobante piden el mismo número y uno de los dos se rechaza.
        fileParallelism: false,
        sequence: { concurrent: false },
    },
});
