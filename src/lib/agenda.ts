// Contas de calendário para a agenda (dia / semana / mês).
//
// Tudo no fuso do computador — quem usa está no Brasil, e o compromisso é
// marcado e lido no mesmo lugar. O que vai para o servidor é ISO com fuso,
// então o horário continua certo em qualquer máquina da equipe.

export type Visao = 'dia' | 'semana' | 'mes';

export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Meia-noite do dia informado (o dia "cheio" começa aqui). */
export const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const somarDias = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const somarMeses = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Domingo da semana do dia informado (como no Google Agenda em português). */
export const inicioDaSemana = (d: Date) => somarDias(inicioDoDia(d), -d.getDay());

export const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const ehHoje = (d: Date) => mesmoDia(d, new Date());

/** Os 7 dias da semana de `d`. */
export const diasDaSemana = (d: Date) => {
  const ini = inicioDaSemana(d);
  return Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
};

/**
 * Grade do mês: 6 semanas completas (42 dias), começando no domingo — os dias
 * do mês vizinho entram apagados, como em qualquer calendário.
 */
export const diasDoMes = (d: Date) => {
  const ini = inicioDaSemana(new Date(d.getFullYear(), d.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => somarDias(ini, i));
};

/** Período que a visão cobre — é o que decide quais compromissos aparecem. */
export function periodo(visao: Visao, foco: Date): { de: Date; ate: Date } {
  if (visao === 'dia') return { de: inicioDoDia(foco), ate: somarDias(inicioDoDia(foco), 1) };
  if (visao === 'semana') return { de: inicioDaSemana(foco), ate: somarDias(inicioDaSemana(foco), 7) };
  const grade = diasDoMes(foco);
  return { de: grade[0], ate: somarDias(grade[41], 1) };
}

/** Título da barra: "10 de setembro", "7 a 13 de setembro", "setembro de 2026". */
export function rotuloDoPeriodo(visao: Visao, foco: Date): string {
  if (visao === 'dia') {
    return `${DIAS_CURTOS[foco.getDay()]}, ${foco.getDate()} de ${MESES[foco.getMonth()]}`;
  }
  if (visao === 'mes') return `${MESES[foco.getMonth()]} de ${foco.getFullYear()}`;
  const dias = diasDaSemana(foco);
  const a = dias[0];
  const b = dias[6];
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} a ${b.getDate()} de ${MESES[a.getMonth()]}`;
  }
  return `${a.getDate()} de ${MESES[a.getMonth()]} a ${b.getDate()} de ${MESES[b.getMonth()]}`;
}

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** ISO local (`2026-09-10T14:30`) para preencher `<input type="datetime-local">`. */
export function paraCampoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Duração padrão de um compromisso sem hora de fim. */
export const MINUTOS_PADRAO = 30;

export function fimEfetivo(inicio: string, fim: string | null): Date {
  return fim ? new Date(fim) : new Date(new Date(inicio).getTime() + MINUTOS_PADRAO * 60000);
}
