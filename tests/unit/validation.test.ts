import { describe, it, expect } from 'vitest';
import { WsaaService } from '../../src/auth/wsaa';
import { ArcaValidationError } from '../../src/types/common';

describe('WsaaService - Validaciones', () => {
    const validConfig = {
        environment: 'homologacion' as const,
        cuit: '20123456789',
        cert: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        service: 'wsfe',
    };

    it('debe aceptar configuración válida', () => {
        expect(() => new WsaaService(validConfig)).not.toThrow();
    });

    it('debe rechazar CUIT inválido', () => {
        const invalidConfig = { ...validConfig, cuit: '20-12345678-9' };

        expect(() => new WsaaService(invalidConfig))
            .toThrow(ArcaValidationError);

        try {
            new WsaaService(invalidConfig);
        } catch (error) {
            expect((error as ArcaValidationError).message).toContain('CUIT inválido');
        }
    });

    it('debe rechazar certificado inválido', () => {
        const invalidConfig = { ...validConfig, cert: 'invalid-cert' };

        expect(() => new WsaaService(invalidConfig))
            .toThrow(ArcaValidationError);

        try {
            new WsaaService(invalidConfig);
        } catch (error) {
            expect((error as ArcaValidationError).message).toContain('Certificado inválido');
        }
    });

    it('debe rechazar clave privada inválida', () => {
        const invalidConfig = { ...validConfig, key: 'invalid-key' };

        expect(() => new WsaaService(invalidConfig))
            .toThrow(ArcaValidationError);

        try {
            new WsaaService(invalidConfig);
        } catch (error) {
            expect((error as ArcaValidationError).message).toContain('Clave privada inválida');
        }
    });

    it('debe rechazar servicio vacío', () => {
        const invalidConfig = { ...validConfig, service: '' };

        expect(() => new WsaaService(invalidConfig))
            .toThrow(ArcaValidationError);

        try {
            new WsaaService(invalidConfig);
        } catch (error) {
            expect((error as ArcaValidationError).message).toContain('Servicio ARCA no especificado');
        }
    });

    it('debe aceptar clave privada con formato RSA', () => {
        const rsaConfig = {
            ...validConfig,
            key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
        };

        expect(() => new WsaaService(rsaConfig)).not.toThrow();
    });
});
