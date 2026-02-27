// Función auxiliar para formatear la fecha como quiere AFIP: YYYY-MM-DDTHH:mm:ss-03:00
export function formatArcaDate (date: Date)  {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const offset = "-03:00";

    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());

    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${offset}`;
};
