/**
 * Ejemplo completo: Facturación con ARCA
 * 
 * Muestra los 3 tipos principales de comprobantes:
 * - Ticket C (simple)
 * - Ticket C (con items)
 * - Factura B (con IVA discriminado)
 */

import { WsaaService, WsfeService, TipoDocumento } from '../src/index';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper para ESM con __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🇦🇷 ARCA SDK - Ejemplo de Facturación\n');

    // Ajustar rutas según tu entorno
    const certPath = path.join(__dirname, '../certs/cert.pem');
    const keyPath = path.join(__dirname, '../certs/key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.log('⚠️ No se encontraron certificados en /certs/');
        console.log('   Por favor, colocá cert.pem y key.pem en la carpeta /certs/ para correr este ejemplo.');
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

    // 2. Crear servicio WSFE
    const wsfe = new WsfeService({
        environment: 'homologacion',
        cuit: '20123456789',
        ticket,
        puntoVenta: 4,
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EJEMPLO 1: Ticket C Simple (como app móvil de ARCA)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('📱 Ejemplo 1: Ticket C Simple (solo total)\n');

    try {
        const ticketSimple = await wsfe.emitirTicketCSimple({
            total: 3500,
        });

        console.log('✅ Ticket emitido:');
        console.log('   CAE:', ticketSimple.cae);
        console.log('   Nro:', ticketSimple.nroComprobante);
        console.log('   Vencimiento CAE:', ticketSimple.vencimientoCae);
        console.log('');
    } catch (err: any) {
        console.log('❌ Error en Ejemplo 1:', err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EJEMPLO 2: Ticket C con detalle (para sistema interno)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('🧾 Ejemplo 2: Ticket C con items (detalle local)\n');

    try {
        const ticketDetalle = await wsfe.emitirTicketC({
            items: [
                { descripcion: 'Coca Cola 2L', cantidad: 2, precioUnitario: 500 },
                { descripcion: 'Pan lactal', cantidad: 3, precioUnitario: 850 },
            ],
        });

        console.log('✅ Ticket emitido:');
        console.log('   CAE:', ticketDetalle.cae);
        console.log('   Nro:', ticketDetalle.nroComprobante);
        console.log('   Items guardados localmente:', ticketDetalle.items?.length);
        console.log('');
    } catch (err: any) {
        console.log('❌ Error en Ejemplo 2:', err.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EJEMPLO 3: Factura B (con IVA discriminado)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    console.log('📋 Ejemplo 3: Factura B (IVA discriminado)\n');

    try {
        const facturaB = await wsfe.emitirFacturaB({
            items: [
                {
                    descripcion: 'Servicio de diseño',
                    cantidad: 10,
                    precioUnitario: 1000,
                    alicuotaIva: 21,  // ← OBLIGATORIO para Factura B
                },
                {
                    descripcion: 'Hosting mensual',
                    cantidad: 1,
                    precioUnitario: 5000,
                    alicuotaIva: 21,
                },
            ],
            comprador: {
                tipoDocumento: TipoDocumento.CUIT,
                nroDocumento: '20987654321',  // CUIT del cliente
            },
        });

        console.log('✅ Factura B emitida:');
        console.log('   CAE:', facturaB.cae);
        console.log('   Nro:', facturaB.nroComprobante);
        console.log('   IVA discriminado:');
        facturaB.iva?.forEach(i => {
            console.log(`     - ${i.alicuota}%: $${i.importe} (base: $${i.baseImponible})`);
        });

        if (facturaB.observaciones) {
            console.log('   ⚠️ Observaciones ARCA:', facturaB.observaciones);
        }
    } catch (err: any) {
        console.log('❌ Error en Ejemplo 3:', err.message);
    }

    console.log('\n✅ Todos los ejemplos completados!');
}

main().catch(console.error);
