/**
 * Ejemplo: Autenticación con ARCA (WSAA)
 *
 * Muestra cómo obtener un ticket de acceso para usar
 * servicios de ARCA como WSFE (facturación) o Padrón.
 */

import { WsaaService } from '../src/index';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración — lo único que necesitás proveer
// NOTA: Requiere archivos en /certs/ (no commiteados por seguridad)
const wsaa = new WsaaService({
    environment: 'homologacion',   // o 'produccion'
    cuit: '20123456789',           // Tu CUIT sin guiones
    cert: fs.existsSync(path.join(__dirname, '../certs/cert.pem'))
        ? fs.readFileSync(path.join(__dirname, '../certs/cert.pem'), 'utf-8')
        : '-----BEGIN CERTIFICATE-----\nPLACEHOLDER\n-----END CERTIFICATE-----',
    key: fs.existsSync(path.join(__dirname, '../certs/key.pem'))
        ? fs.readFileSync(path.join(__dirname, '../certs/key.pem'), 'utf-8')
        : '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER\n-----END PRIVATE KEY-----',
    service: 'wsfe',               // Servicio ARCA que vas a usar
});

async function main() {
    try {
        console.log('🔐 Autenticando con ARCA...\n');

        const ticket = await wsaa.login();

        console.log('✅ Autenticación exitosa!\n');
        console.log('Token:', ticket.token.substring(0, 50) + '...');
        console.log('Generado:', ticket.generationTime.toISOString());
        console.log('Expira:', ticket.expirationTime.toISOString());
        console.log('\n💡 El SDK cachea el ticket automáticamente y lo renueva al expirar.');

    } catch (error) {
        console.error('❌ Error:', error);
        console.log('\n💡 Este ejemplo requiere certificados reales en /certs/');
        console.log('   Obtenerlos en: https://auth.afip.gob.ar/contribuyente_/login.xhtml');
    }
}

main();
