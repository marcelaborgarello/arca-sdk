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
    const timeout = options.timeout || 15000; // 15 segundos por defecto

    // Si estamos en Node.js, necesitamos usar un agente HTTPS que permita SECLEVEL=1
    // para evitar el error "dh key too small" de AFIP (OpenSSL 3.0+)
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        if (isNode) {
            const agent = new https.Agent({
                // Permitir llaves DH de 1024 bits (AFIP) bajando a Security Level 1
                // solo para esta conexión específica.
                ciphers: 'DEFAULT@SECLEVEL=1',
                rejectUnauthorized: true,
            });

            // @ts-ignore - node-fetch o fetch nativo en Node 18+ aceptan el agente
            return await fetch(url, {
                method: options.method,
                headers: options.headers,
                body: options.body,
                agent,
                signal: controller.signal
            } as any);
        }

        return await fetch(url, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: controller.signal
        });
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new ArcaNetworkError(`Tiempo de espera agotado (${timeout}ms) al conectar con ARCA: ${url}`);
        }

        // Mapear errores de SSL comunes para dar pistas claras al desarrollador
        let message = error.message;
        if (message.includes('dh key too small')) {
            message = 'Error SSL de ARCA (DH Key too small). El SDK intentó mitigarlo pero falló. Verifique su versión de Node.js.';
        }

        throw new ArcaNetworkError(`Error de red al comunicarse con ARCA: ${message}`, {
            url,
            originalError: error
        });
    } finally {
        clearTimeout(timeoutId);
    }
}
