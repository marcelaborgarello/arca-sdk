import type { LoginTicket } from '../types/wsaa';

/**
 * Interface for token persistence.
 * Allows the SDK to automatically handle TA (Ticket de Acceso) lifecycle
 * by delegating storage to an external system (DB, Cache, etc).
 */
export interface TokenStorage {
    /**
     * Retrieves a stored ticket for a specific CUIT and environment.
     * Should return null if not found or expired.
     */
    get(cuit: string, env: string): Promise<LoginTicket | null>;

    /**
     * Persists a new ticket.
     */
    save(cuit: string, env: string, ticket: LoginTicket): Promise<void>;
}
