/**
 * Ejemplo: Consulta de Padrón A13
 * 
 * Muestra cómo obtener datos de un contribuyente (Persona/Empresa)
 * usando su CUIT. Útil para autocompletar clientes en POS/CRM.
 */

import { PadronService } from '../src/index';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🇦🇷 ARCA SDK - Ejemplo de Padrón A13\n');

    const certPath = path.join(__dirname, '../certs/cert.pem');
    const keyPath = path.join(__dirname, '../certs/key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.log('⚠️ No se encontraron certificados en /certs/');
        return;
    }

    // 1. Instanciar servicio de Padrón
    const padron = new PadronService({
        environment: 'homologacion',
        cuit: '20123456789', // Tu CUIT
        cert: fs.readFileSync(certPath, 'utf-8'),
        key: fs.readFileSync(keyPath, 'utf-8'),
    });

    try {
        const cuitAConsultar = '20987654321'; // CUIT de un cliente
        console.log(`🔍 Consultando datos para CUIT: ${cuitAConsultar}...`);

        const res = await padron.getPersona(cuitAConsultar);

        if (res.error) {
            console.log('❌ Error:', res.error);
            return;
        }

        const p = res.persona!;
        console.log('✅ Datos encontrados:');
        console.log('   Nombre/Razón Social:', p.razonSocial || `${p.nombre} ${p.apellido}`);
        console.log('   Tipo Persona:', p.tipoPersona);
        console.log('   Estado Clave:', p.estadoClave);

        if (p.domicilio && p.domicilio.length > 0) {
            console.log('   Dirección:', p.domicilio[0].direccion);
            console.log('   Localidad:', p.domicilio[0].localidad);
        }

        console.log('   Condición IVA:');
        if (p.esInscriptoIVA) console.log('     - Responsable Inscripto');
        if (p.esMonotributista) console.log('     - Monotributista');
        if (p.esExento) console.log('     - Exento');

    } catch (err: any) {
        console.log('❌ Error inesperado:', err.message);
    }
}

main().catch(console.error);
