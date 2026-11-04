const TIME = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false });
const DAY_AND_TIME = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Hora de una ejecución: solo la hora si es de hoy; con el día si no. */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = date.toDateString() === now.toDateString();
  return (today ? TIME : DAY_AND_TIME).format(date);
}

/** Lo que se ve de una URL en la lista: sin el esquema, que casi siempre es https. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}
