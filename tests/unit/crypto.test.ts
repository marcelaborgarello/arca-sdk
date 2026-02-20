import { describe, it, expect } from 'vitest';
import { signCMS, validateCertificate, validatePrivateKey } from '../../src/utils/crypto';
import { ArcaAuthError } from '../../src/types/common';

describe('validateCertificate', () => {
    it('debe validar certificado PEM correcto', () => {
        const validCert = `-----BEGIN CERTIFICATE-----
CERTIFICADO_DE_PRUEBA_CONTENIDO_TOTALMENTE_FALSO_1234567890
-----END CERTIFICATE-----`;

        expect(validateCertificate(validCert)).toBe(true);
    });

    it('debe rechazar certificado inválido', () => {
        expect(validateCertificate('invalid')).toBe(false);
        expect(validateCertificate('')).toBe(false);
    });
});

describe('validatePrivateKey', () => {
    it('debe validar clave privada PKCS#8', () => {
        const validKey = `-----BEGIN PRIVATE KEY-----
CLAVE_PRIVADA_PKCS8_DE_PRUEBA_TOTALMENTE_FALSA_1234567890
-----END PRIVATE KEY-----`;

        expect(validatePrivateKey(validKey)).toBe(true);
    });

    it('debe validar clave privada RSA', () => {
        const validKey = `-----BEGIN RSA PRIVATE KEY-----
CLAVE_PRIVADA_RSA_DE_PRUEBA_TOTALMENTE_FALSA_1234567890
-----END RSA PRIVATE KEY-----`;

        expect(validatePrivateKey(validKey)).toBe(true);
    });

    it('debe rechazar clave inválida', () => {
        expect(validatePrivateKey('invalid')).toBe(false);
        expect(validatePrivateKey('')).toBe(false);
    });
});

describe('signCMS', () => {
    it('debe lanzar error con certificado/clave inválidos', () => {
        const xml = '<test>data</test>';
        const invalidCert = 'invalid-cert';
        const invalidKey = 'invalid-key';

        expect(() => signCMS(xml, invalidCert, invalidKey))
            .toThrow(ArcaAuthError);
    });

    // NOTA: Test completo con certificados reales requiere
    // certificados de prueba. Lo haremos en integration tests.

    it('debe tener la firma correcta y ser una función exportada', () => {
        // Verificamos que la función existe y espera los argumentos correctos
        expect(typeof signCMS).toBe('function');
        expect(signCMS.length).toBe(3);
    });
});
