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
     *
     * @param service - El id del servicio ARCA para el que se pide el ticket (ej.
     *   `"wsfe"`, `"ws_sr_padron_a13"`). Un TA es válido para un solo servicio, así que
     *   dos servicios distintos con el mismo `cuit` y `env` necesitan entradas separadas
     *   en el storage — mezclarlas produce el fault *"Token recibido es para el servicio
     *   [X], deberia ser para servicio [Y]"*. Parámetro opcional, agregado en v3.1.0: una
     *   implementación que todavía no lo use sigue siendo válida (JS ignora el argumento
     *   de más), pero no evita esa colisión por su cuenta.
     */
    get(cuit: string, env: string, service?: string): Promise<LoginTicket | null>;

    /**
     * Persists a new ticket.
     *
     * @param service - Ver {@link TokenStorage.get}.
     */
    save(cuit: string, env: string, ticket: LoginTicket, service?: string): Promise<void>;
}
