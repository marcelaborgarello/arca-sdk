import { describe, it, expect, beforeEach } from 'vitest';
import { TicketManager } from '../../src/auth/ticket';
import type { LoginTicket } from '../../src/types/wsaa';

describe('TicketManager', () => {
    let manager: TicketManager;

    beforeEach(() => {
        manager = new TicketManager();
    });

    it('debe retornar null si no hay ticket', () => {
        expect(manager.getTicket()).toBeNull();
        expect(manager.hasValidTicket()).toBe(false);
    });

    it('debe guardar y recuperar un ticket válido', () => {
        const ticket: LoginTicket = {
            token: 'test-token',
            sign: 'test-sign',
            generationTime: new Date(),
            expirationTime: new Date(Date.now() + 60 * 60 * 1000), // +1 hora
        };

        manager.setTicket(ticket);

        expect(manager.hasValidTicket()).toBe(true);
        expect(manager.getTicket()).toEqual(ticket);
    });

    it('debe considerar inválido un ticket que expira en menos de 5 min', () => {
        const ticket: LoginTicket = {
            token: 'test-token',
            sign: 'test-sign',
            generationTime: new Date(),
            expirationTime: new Date(Date.now() + 4 * 60 * 1000), // +4 minutos
        };

        manager.setTicket(ticket);

        expect(manager.hasValidTicket()).toBe(false);
        expect(manager.getTicket()).toBeNull();
    });

    it('debe considerar válido un ticket que expira en más de 5 min', () => {
        const ticket: LoginTicket = {
            token: 'test-token',
            sign: 'test-sign',
            generationTime: new Date(),
            expirationTime: new Date(Date.now() + 6 * 60 * 1000), // +6 minutos
        };

        manager.setTicket(ticket);

        expect(manager.hasValidTicket()).toBe(true);
        expect(manager.getTicket()).toEqual(ticket);
    });

    it('debe limpiar el ticket al llamar clearTicket()', () => {
        const ticket: LoginTicket = {
            token: 'test-token',
            sign: 'test-sign',
            generationTime: new Date(),
            expirationTime: new Date(Date.now() + 60 * 60 * 1000),
        };

        manager.setTicket(ticket);
        expect(manager.hasValidTicket()).toBe(true);

        manager.clearTicket();

        expect(manager.hasValidTicket()).toBe(false);
        expect(manager.getTicket()).toBeNull();
    });
});
