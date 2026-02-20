/**
 * Quick Start - Lo mínimo para empezar
 */

import { WsaaService } from '../src';

// TODO: Reemplazar con tus certificados reales
const CERT = `-----BEGIN CERTIFICATE-----
... tu certificado aquí ...
-----END CERTIFICATE-----`;

const KEY = `-----BEGIN PRIVATE KEY-----
... tu clave privada aquí ...
-----END PRIVATE KEY-----`;

// ⚡ 3 líneas y ya estás autenticado
const wsaa = new WsaaService({
    environment: 'homologacion',
    cuit: '20123456789',
    cert: CERT,
    key: KEY,
    service: 'wsfe',
});

async function run() {
    try {
        const ticket = await wsaa.login();
        console.log('✅ Autenticado! Token:', ticket.token.substring(0, 30) + '...');
    } catch (error) {
        console.error('Error en el Quick Start:', error);
    }
}

run();
