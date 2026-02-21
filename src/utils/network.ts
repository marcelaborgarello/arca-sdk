import https from 'https';
import { ArcaNetworkError } from '../types/common';

/**
 * Entornos compatibles
 */
export type ArcaEnvironment = 'homologacion' | 'produccion';

/**
 * Opciones para la llamada API
 */
export interface CallApiOptions {
    method: string;
    headers: Record<string, string>;
    body: string;
    timeout?: number;
}

/**
 * Realiza una llamada a la API de ARCA (WSAA o WSFE)
 * Maneja la compatibilidad SSL con los servidores de AFIP (DH key size)
 * y añade robustez (timeouts, mejores errores).
 */
export async function callArcaApi(
    url: string,
    options: CallApiOptions
): Promise<Response> {
    const timeout = options.timeout || 15000;
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

    if (isNode) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);

            const agent = new https.Agent({
                // SECLEVEL=0 es el nivel más permisivo de OpenSSL.
                // !DH desactiva Diffie-Hellman para forzar RSA o ECDHE si están disponibles,
                // evitando el problema de "dh key too small" de raíz.
                ciphers: 'DEFAULT:!DH@SECLEVEL=0',
                // AFIP todavía tiene endpoints que podrían requerir TLS 1.0/1.1
                minVersion: 'TLSv1',
                // @ts-ignore - Propiedad específica para mitigar "dh key too small" en Node 18+
                minDHSize: 1024,
                rejectUnauthorized: true,
            });

            const reqOptions: https.RequestOptions = {
                method: options.method,
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                headers: options.headers,
                agent,
                timeout,
            };

            const req = https.request(reqOptions, (res) => {
                res.setEncoding('utf8');
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    // Simular objeto Response de fetch
                    const response = {
                        ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        text: async () => data,
                        json: async () => JSON.parse(data),
                    };
                    resolve(response as Response);
                });
            });

            req.on('error', (error: any) => {
                let message = error.message;
                if (message.includes('dh key too small')) {
                    message = 'Error SSL de ARCA (DH Key too small). Verifique su versión de OpenSSL/Node.';
                }
                reject(new ArcaNetworkError(`Error de red al comunicarse con ARCA (HTTPS): ${message}`, {
                    url,
                    originalError: error
                }));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new ArcaNetworkError(`Tiempo de espera agotado (${timeout}ms) al conectar con ARCA: ${url}`));
            });

            req.write(options.body);
            req.end();
        });
    }

    // Navegador o entorno no-Node (utiliza fetch nativo)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: controller.signal
        });
        return response;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new ArcaNetworkError(`Tiempo de espera agotado (${timeout}ms) al conectar con ARCA: ${url}`);
        }
        throw new ArcaNetworkError(`Error de red: ${error.message}`, { url, originalError: error });
    } finally {
        clearTimeout(timeoutId);
    }
}
