/**
 * Ejemplo: Autenticación con ARCA (WSAA)
 * 
 * Este ejemplo muestra cómo obtener un ticket de acceso
 * para usar servicios de ARCA como WSFE (facturación).
 */

import { WsaaService } from '../src/auth/wsaa';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper para __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Configuración (lo único que el dev necesita)
// NOTA: Requiere archivos en /certs/ que no existen aún en la estructura base
const wsaa = new WsaaService({
    environment: 'homologacion',  // o 'produccion'
    cuit: '20123456789',          // Tu CUIT
    cert: fs.existsSync(path.join(__dirname, '../certs/cert.pem'))
        ? fs.readFileSync(path.join(__dirname, '../certs/cert.pem'), 'utf-8')
        : '-----BEGIN CERTIFICATE-----\nPLACEHOLDER\n-----END CERTIFICATE-----',
    key: fs.existsSync(path.join(__dirname, '../certs/key.pem'))
        ? fs.readFileSync(path.join(__dirname, '../certs/key.pem'), 'utf-8')
        : '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER\n-----END PRIVATE KEY-----',
    service: 'wsfe',              // Servicio a autenticar
});

// 2. Obtener ticket (automático, con cache)
async function main() {
    try {
        console.log('🔐 Autenticando con ARCA...\n');

        // Esto fallará con los placeholders de arriba, pero muestra el flujo
        const ticket = await wsaa.login();

        console.log('✅ Autenticación exitosa!\n');
        console.log('Token:', ticket.token.substring(0, 50) + '...');
        console.log('Generado:', ticket.generationTime.toISOString());
        console.log('Expira:', ticket.expirationTime.toISOString());

        // El ticket es válido por ~12 horas
        // La SDK lo cachea automáticamente

        console.log('\n💡 El ticket se renovará automáticamente cuando expire.');

    } catch (error) {
        console.error('❌ Error:', error);
        console.log('\n💡 Nota: Este ejemplo requiere certificados reales en la carpeta /certs.');
    }
}

main();
