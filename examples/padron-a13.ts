/**
 * Ejemplo: Consulta de Padrón A13 (ARCA SDK v1.0.0)
 *
 * Muestra cómo obtener datos de un contribuyente usando su CUIT.
 * Útil para autocompletar clientes en POS/CRM.
 */

import { PadronService } from '../src/index';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🇦🇷 ARCA SDK v1.0.0 - Ejemplo de Padrón A13\n');

    const certPath = path.join(__dirname, '../certs/cert.pem');
    const keyPath = path.join(__dirname, '../certs/key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.log('⚠️  No se encontraron certificados en /certs/');
        return;
    }

    // 1. Instanciar servicio de Padrón
    const padron = new PadronService({
        environment: 'homologacion',
        cuit: '20123456789',
        cert: fs.readFileSync(certPath, 'utf-8'),
        key: fs.readFileSync(keyPath, 'utf-8'),
    });

    try {
        const cuitToQuery = '20987654321';
        console.log(`🔍 Consultando datos para CUIT: ${cuitToQuery}...`);

        const res = await padron.getTaxpayer(cuitToQuery);

        if (res.error) {
            console.log('❌ Error:', res.error);
            return;
        }

        const t = res.taxpayer!;
        console.log('✅ Datos encontrados:');
        console.log('   Nombre/Razón Social:', t.companyName || `${t.firstName} ${t.lastName}`);
        console.log('   Tipo Persona:', t.personType);
        console.log('   Estado Clave:', t.status);

        if (t.addresses && t.addresses.length > 0) {
            console.log('   Dirección:', t.addresses[0].street);
            console.log('   Localidad:', t.addresses[0].city);
            console.log('   Provincia:', t.addresses[0].province);
        }

        console.log('   Condición IVA:');
        if (t.isVATRegistered) console.log('     - Responsable Inscripto');
        if (t.isMonotax) console.log('     - Monotributista');
        if (t.isVATExempt) console.log('     - Exento');

    } catch (err: any) {
        console.log('❌ Error inesperado:', err.message);
    }
}

main().catch(console.error);
