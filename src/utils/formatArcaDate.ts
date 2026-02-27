// Función auxiliar para formatear la fecha como quiere AFIP: YYYY-MM-DDTHH:mm:ss-03:00
export function formatArcaDate(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');

    // Obtenemos el tiempo en milisegundos y le restamos 3 horas para forzar UTC-3
    const tzOffset = 3 * 60 * 60 * 1000;
    const baTime = new Date(date.getTime() - tzOffset);

    const yyyy = baTime.getUTCFullYear();
    const mm = pad(baTime.getUTCMonth() + 1);
    const dd = pad(baTime.getUTCDate());
    const hh = pad(baTime.getUTCHours());
    const min = pad(baTime.getUTCMinutes());
    const ss = pad(baTime.getUTCSeconds());

    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`;
};
