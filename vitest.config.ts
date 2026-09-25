import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // Los tests de integración quedan fuera de la corrida por defecto: pegan contra
        // ARCA homologación, que es un servicio de terceros que se cae. Se corren con
        // `bun run test:integration`. Ver tests/integration/README.md.
        include: ['tests/unit/**/*.test.ts'],
    },
});
