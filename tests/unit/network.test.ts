import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import tls from 'tls';
import { checkArcaServerIdentity } from '../../src/utils/network';

// Mockear el módulo 'tls' para controlar tls.checkServerIdentity
vi.mock('tls', () => {
    const checkServerIdentity = vi.fn();
    return {
        default: {
            checkServerIdentity,
        },
        checkServerIdentity,
    };
});

describe('checkArcaServerIdentity', () => {
    const mockCert = {} as tls.PeerCertificate;
    const mockCheck = tls.checkServerIdentity as unknown as Mock;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return undefined if the initial validation succeeds', () => {
        // Configurar mock para retornar undefined (éxito) en la primera validación
        mockCheck.mockReturnValueOnce(undefined);

        const result = checkArcaServerIdentity('servicios1.afip.gov.ar', mockCert);

        expect(result).toBeUndefined();
        expect(tls.checkServerIdentity).toHaveBeenCalledTimes(1);
        expect(tls.checkServerIdentity).toHaveBeenCalledWith('servicios1.afip.gov.ar', mockCert);
    });

    it('should return the original error if validation fails for non-ARCA domain', () => {
        const mockError = new Error("Hostname/IP does not match certificate's altnames");
        mockCheck.mockReturnValueOnce(mockError);

        const result = checkArcaServerIdentity('google.com', mockCert);

        expect(result).toBe(mockError);
        expect(tls.checkServerIdentity).toHaveBeenCalledTimes(1);
        expect(tls.checkServerIdentity).toHaveBeenCalledWith('google.com', mockCert);
    });

    it('should approve the connection if the ARCA validation fails but the AFIP fallback succeeds', () => {
        const mockError = new Error("Hostname/IP does not match certificate's altnames");
        
        // Primera llamada (arca) falla, segunda llamada (afip) tiene éxito (retorna undefined)
        mockCheck
            .mockReturnValueOnce(mockError)
            .mockReturnValueOnce(undefined);

        const result = checkArcaServerIdentity('servicios1.arca.gob.ar', mockCert);

        expect(result).toBeUndefined();
        expect(tls.checkServerIdentity).toHaveBeenCalledTimes(2);
        expect(tls.checkServerIdentity).toHaveBeenNthCalledWith(1, 'servicios1.arca.gob.ar', mockCert);
        expect(tls.checkServerIdentity).toHaveBeenNthCalledWith(2, 'servicios1.afip.gov.ar', mockCert);
    });

    it('should return the original error if both the ARCA validation and the AFIP fallback fail', () => {
        const mockErrorOriginal = new Error("Hostname/IP does not match certificate's altnames");
        const mockErrorFallback = new Error("Fallback validation failed");

        // Ambas llamadas fallan
        mockCheck
            .mockReturnValueOnce(mockErrorOriginal)
            .mockReturnValueOnce(mockErrorFallback);

        const result = checkArcaServerIdentity('servicios1.arca.gob.ar', mockCert);

        expect(result).toBe(mockErrorOriginal);
        expect(tls.checkServerIdentity).toHaveBeenCalledTimes(2);
        expect(tls.checkServerIdentity).toHaveBeenNthCalledWith(1, 'servicios1.arca.gob.ar', mockCert);
        expect(tls.checkServerIdentity).toHaveBeenNthCalledWith(2, 'servicios1.afip.gov.ar', mockCert);
    });
});
