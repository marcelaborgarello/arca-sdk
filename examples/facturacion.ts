/**
 * Ejemplo completo: Facturación con arca-sdk
 *
 * Muestra los tipos principales de comprobantes:
 * - Factura C (a consumidor final, con uno o varios items)
 * - Factura B (con IVA discriminado)
 */

import { WsaaService, WsfeService, TaxIdType, VatCondition } from '../src/index';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper para ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🇦🇷 ARCA SDK v1.0.0 - Ejemplo de Facturación\n');

    const certPath = path.join(__dirname, '../certs/cert.pem');
    const keyPath = path.join(__dirname, '../certs/key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.log('⚠️  No se encontraron certificados en /certs/');
        console.log('   Colocá cert.pem y key.pem en la carpeta /certs/ para correr este ejemplo.');
        return;
    }

    // 1. Autenticar con WSAA
    console.log('🔐 Autenticando con ARCA...');
    const wsaa = new WsaaService({
        environment: 'homologacion',
        cuit: '20123456789',
        cert: fs.readFileSync(certPath, 'utf-8'),
        key: fs.readFileSync(keyPath, 'utf-8'),
        service: 'wsfe',
    });

    const ticket = await wsaa.login();
    console.log('✅ Autenticado\n');

    // 2. Crear servicio de facturación
    const wsfe = new WsfeService({
        environment: 'homologacion',
        cuit: '20123456789',
        ticket,
        pointOfSale: 4,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EJEMPLO 1: Factura C a consumidor final (sin identificar)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Hasta la v3.0.0 este ejemplo usaba issueSimpleReceipt(), que emitía Tique C (83) —
    // un comprobante que ARCA no lista en FEParamGetTiposCbte y rechaza con el 11001.

    console.log('📱 Ejemplo 1: Factura C a consumidor final\n');

    try {
        const result = await wsfe.issueInvoiceC({
            items: [{ description: 'Producto', quantity: 1, unitPrice: 3500 }],
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
                vatCondition: VatCondition.CONSUMIDOR_FINAL,
            },
        });

        console.log('✅ Factura emitida:');
        console.log('   CAE:', result.cae);
        console.log('   Nro:', result.invoiceNumber);
        console.log('   Vencimiento CAE:', result.caeExpiry);
        console.log('   QR URL:', result.qrUrl);
        console.log('');
    } catch (err: any) {
        console.log('❌ Error en Ejemplo 1:', err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EJEMPLO 2: Factura C con detalle de items
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('🧾 Ejemplo 2: Factura C con varios items\n');

    try {
        const result = await wsfe.issueInvoiceC({
            items: [
                { description: 'Coca Cola 2L', quantity: 2, unitPrice: 500 },
                { description: 'Pan lactal', quantity: 3, unitPrice: 850 },
            ],
            buyer: {
                docType: TaxIdType.FINAL_CONSUMER,
                docNumber: '0',
                vatCondition: VatCondition.CONSUMIDOR_FINAL,
            },
        });

        console.log('✅ Factura emitida:');
        console.log('   CAE:', result.cae);
        console.log('   Nro:', result.invoiceNumber);
        console.log('   Items:', result.items?.length);
        console.log('');
    } catch (err: any) {
        console.log('❌ Error en Ejemplo 2:', err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EJEMPLO 3: Factura B (con IVA discriminado)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('📋 Ejemplo 3: Factura B (IVA discriminado)\n');

    try {
        const result = await wsfe.issueInvoiceB({
            items: [
                {
                    description: 'Servicio de diseño',
                    quantity: 10,
                    unitPrice: 1000,
                    vatRate: 21,  // ← OBLIGATORIO para Factura B
                },
                {
                    description: 'Hosting mensual',
                    quantity: 1,
                    unitPrice: 5000,
                    vatRate: 21,
                },
            ],
            buyer: {
                docType: TaxIdType.CUIT,
                docNumber: '20987654321',
            },
        });

        console.log('✅ Factura B emitida:');
        console.log('   CAE:', result.cae);
        console.log('   Nro:', result.invoiceNumber);
        console.log('   IVA discriminado:');
        result.vat?.forEach(v => {
            console.log(`     - ${v.rate}%: $${v.amount} (base: $${v.taxBase})`);
        });

        if (result.observations) {
            console.log('   ⚠️ Observaciones ARCA:', result.observations);
        }
    } catch (err: any) {
        console.log('❌ Error en Ejemplo 3:', err.message);
    }

    console.log('\n✅ Todos los ejemplos completados!');
}

main().catch(console.error);
