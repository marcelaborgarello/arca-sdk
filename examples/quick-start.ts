/**
 * Quick Start — arca-sdk
 *
 * Lo mínimo para estar operativo en minutos.
 */

import { WsaaService, WsfeService, TaxIdType, VatCondition } from '../src/index';

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

        // Emitir Factura C a consumidor final. `total` es el atajo para una venta que no
        // se detalla; si querés detallarla, pasá `items` en vez de `total`.
        const cae = await wsfe.issueInvoiceC({
            total: 1500,
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
                // Obligatorio en la práctica: homologación ya rechaza sin esto (10246).
                vatCondition: VatCondition.CONSUMIDOR_FINAL,
            },
        });
        console.log('🧾 CAE:', cae.cae);
        console.log('🔗 QR:', cae.qrUrl);

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

run();
