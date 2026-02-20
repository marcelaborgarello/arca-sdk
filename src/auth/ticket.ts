import type { LoginTicket } from '../types/wsaa';

/**
 * Gestor de tickets de autenticación
 * Maneja cache en memoria del ticket WSAA
 */
export class TicketManager {
    private ticket: LoginTicket | null = null;

    /**
     * Guarda un ticket en cache
     */
    setTicket(ticket: LoginTicket): void {
        this.ticket = ticket;
    }

    /**
     * Obtiene el ticket actual si es válido
     * @returns Ticket válido o null si expiró
     */
    getTicket(): LoginTicket | null {
        if (!this.ticket) return null;

        const now = new Date();
        const expiresIn = this.ticket.expirationTime.getTime() - now.getTime();

        // Si expira en menos de 5 minutos, considerarlo inválido
        const BUFFER_MS = 5 * 60 * 1000;

        if (expiresIn < BUFFER_MS) {
            this.ticket = null;
            return null;
        }

        return this.ticket;
    }

    /**
     * Verifica si hay un ticket válido
     */
    hasValidTicket(): boolean {
        return this.getTicket() !== null;
    }

    /**
     * Limpia el ticket en cache
     */
    clearTicket(): void {
        this.ticket = null;
    }
}
