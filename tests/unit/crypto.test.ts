import { describe, it, expect } from 'vitest';
import { signCMS, validateCertificate, validatePrivateKey } from '../../src/utils/crypto';
import { ArcaAuthError } from '../../src/types/common';

describe('validateCertificate', () => {
    it('debe validar certificado PEM correcto', () => {
        const validCert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRkSvMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
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
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
-----END PRIVATE KEY-----`;

        expect(validatePrivateKey(validKey)).toBe(true);
    });

    it('debe validar clave privada RSA', () => {
        const validKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAu1SU1LfVLPHCo3FmE/YJ3YRr2E+3JGy2xUVXyZ7J3iVqTCc
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
