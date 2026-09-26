import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // Los tests de integración quedan fuera de la corrida por defecto: pegan contra
        // ARCA homologación, que es un servicio de terceros que se cae. Se corren con
        // `bun run test:integration`. Ver tests/integration/README.md.
        include: ['tests/unit/**/*.test.ts'],
        coverage: {
            // Medir sólo la librería. Sin esto el reporte cuenta `examples/` y los
            // archivos de configuración de la raíz, y el porcentaje global termina
            // describiendo el repo en vez del SDK.
            include: ['src/**/*.ts'],
            // `index.ts` sólo re-exporta y `types/` son definiciones: no hay código
            // que ejecutar, así que ensucian el número sin aportar información.
            exclude: ['src/index.ts', 'src/types/**'],
        },
    },
});
