import * as forgeXd from 'node-forge';
const forge = (forgeXd as any).default || forgeXd;
import type { GenerateCSRParams, GenerateCSRResult } from '../types/common';
import { ArcaAuthError } from '../types/common';

/**
 * Firma un XML en formato CMS (PKCS#7) usando certificado y clave privada
 *
 * @param xml - Contenido XML a firmar (TRA)
 * @param certPem - Certificado en formato PEM
 * @param keyPem - Clave privada en formato PEM
 * @returns CMS firmado en base64
 */
export function signCMS(xml: string, certPem: string, keyPem: string): string {
    try {
        // 1. Parsear certificado
        const cert = forge.pki.certificateFromPem(certPem);

        // 2. Parsear clave privada
        const privateKey = forge.pki.privateKeyFromPem(keyPem);

        // 3. Crear contenedor PKCS#7
        const p7 = forge.pkcs7.createSignedData();

        // 4. Agregar contenido a firmar
        p7.content = forge.util.createBuffer(xml, 'utf8');

        // 5. Agregar certificado
        p7.addCertificate(cert);

        // 6. Firmar con SHA256
        p7.addSigner({
            key: privateKey,
            certificate: cert,
            digestAlgorithm: forge.pki.oids.sha256,
            authenticatedAttributes: [
                {
                    type: forge.pki.oids.contentType,
                    value: forge.pki.oids.data,
                },
                {
                    type: forge.pki.oids.messageDigest,
                    // El valor será calculado automáticamente
                },
                {
                    type: forge.pki.oids.signingTime,
                    // node-forge expects a Date object, but its typings might be missing or expect string/any
                    value: new Date() as any,
                },
            ],
        });

        // 7. Firmar
        p7.sign();

        // 8. Convertir a DER y luego a base64
        const derBytes = forge.asn1.toDer(p7.toAsn1()).getBytes();
        const base64 = forge.util.encode64(derBytes);

        return base64;
    } catch (error) {
        if (error instanceof ArcaAuthError) throw error;
        throw new ArcaAuthError('Error al firmar XML con certificado usando PKCS#7', {
            originalError: error,
            hint: 'Verificar que el certificado y la clave privada sean válidos y correspondan entre sí',
        });
    }
}

/**
 * Valida formato de certificado PEM
 */
export function validateCertificate(cert: string): boolean {
    return (
        cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----')
    );
}

/**
 * Valida formato de clave privada PEM
 */
export function validatePrivateKey(key: string): boolean {
    return (
        (key.includes('-----BEGIN PRIVATE KEY-----') &&
            key.includes('-----END PRIVATE KEY-----')) ||
        (key.includes('-----BEGIN RSA PRIVATE KEY-----') &&
            key.includes('-----END RSA PRIVATE KEY-----'))
    );
}

/**
 * Genera un CSR (Certificate Signing Request) y su clave privada RSA.
 * Equivalente a:
 * openssl req -new -newkey rsa:2048 -nodes -keyout privada.key -subj "/C=AR/O={org}/CN={cn}/serialNumber=CUIT {cuit}" -out pedido.csr
 */
export function generateCSR(params: GenerateCSRParams): GenerateCSRResult {
    const { organization, commonName, cuit } = params;

    const keyPair = forge.pki.rsa.generateKeyPair(2048);

    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keyPair.publicKey;
    csr.setSubject([
        { name: 'countryName', value: 'AR' },
        { name: 'organizationName', value: organization },
        { name: 'commonName', value: commonName },
        { name: 'serialNumber', value: `CUIT ${cuit}` },
    ]);
    csr.sign(keyPair.privateKey, forge.md.sha256.create());

    return {
        csr: forge.pki.certificationRequestToPem(csr),
        privateKey: forge.pki.privateKeyToPem(keyPair.privateKey),
    };
}
