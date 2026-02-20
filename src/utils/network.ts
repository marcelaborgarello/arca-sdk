import https from 'https';

/**
 * Entornos compatibles
 */
export type ArcaEnvironment = 'homologacion' | 'produccion';

/**
 * Realiza una llamada a la API de ARCA (WSAA o WSFE)
 * Maneja la compatibilidad SSL con los servidores de AFIP (DH key size)
 */
export async function callArcaApi(
    url: string,
    options: {
        method: string;
        headers: Record<string, string>;
        body: string;
    }
): Promise<Response> {
    // Si estamos en Node.js, necesitamos usar un agente HTTPS que permita SECLEVEL=1
    // para evitar el error "dh key too small" de AFIP (OpenSSL 3.0+)
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

    if (isNode) {
        const agent = new https.Agent({
            // Permitir llaves DH de 1024 bits (AFIP) bajando a Security Level 1
            // solo para esta conexión específica.
            ciphers: 'DEFAULT@SECLEVEL=1',
            rejectUnauthorized: true, // Seguimos validando el certificado
        });

        // @ts-ignore - node-fetch o fetch nativo en Node 18+ aceptan el agente
        return fetch(url, {
            ...options,
            agent,
        } as any);
    }

    // En navegador (raro para este SDK pero posible), fetch estándar
    return fetch(url, options);
}
