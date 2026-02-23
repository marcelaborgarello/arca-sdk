/**
 * Quick Start — ARCA SDK v1.0.0
 *
 * Lo mínimo para estar operativo en minutos.
 */

import { WsaaService, WsfeService } from '../src/index';

// TODO: Reemplazá con tus certificados reales (del portal de ARCA)
const CERT = `-----BEGIN CERTIFICATE-----
... tu certificado aquí ...
-----END CERTIFICATE-----`;

const KEY = `-----BEGIN PRIVATE KEY-----
... tu clave privada aquí ...
-----END PRIVATE KEY-----`;

// ⚡ Paso 1: Autenticar con WSAA
const wsaa = new WsaaService({
    environment: 'homologacion',
    cuit: '20123456789',   // Tu CUIT sin guiones
    cert: CERT,
    key: KEY,
    service: 'wsfe',
});

// ⚡ Paso 2: Crear servicio de facturación y emitir
async function run() {
    try {
        const ticket = await wsaa.login();
        console.log('✅ Autenticado! Token:', ticket.token.substring(0, 30) + '...');

        const wsfe = new WsfeService({
            environment: 'homologacion',
            cuit: '20123456789',
            ticket,
            pointOfSale: 4,  // Tu punto de venta dado de alta en ARCA
        });

        // Emitir Ticket C con un monto total
        const cae = await wsfe.issueSimpleReceipt({ total: 1500 });
        console.log('🧾 CAE:', cae.cae);
        console.log('🔗 QR:', cae.qrUrl);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

run();
