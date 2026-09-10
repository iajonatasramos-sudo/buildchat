// Contas de calendário do painel — as mesmas da extensão (dia/semana/mês),
// para as duas telas mostrarem exatamente o mesmo período.

export type Visao = 'dia' | 'semana' | 'mes';

export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const somarMeses = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
/** Domingo da semana (como no Google Agenda em português). */
export const inicioDaSemana = (d: Date) => somarDias(inicioDoDia(d), -d.getDay());
export const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const ehHoje = (d: Date) => mesmoDia(d, new Date());
export const diasDaSemana = (d: Date) => {
  const ini = inicioDaSemana(d);
  return Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
};
export const diasDoMes = (d: Date) => {
  const ini = inicioDaSemana(new Date(d.getFullYear(), d.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => somarDias(ini, i));
};

export function periodo(visao: Visao, foco: Date): { de: Date; ate: Date } {
  if (visao === 'dia') return { de: inicioDoDia(foco), ate: somarDias(inicioDoDia(foco), 1) };
  if (visao === 'semana') return { de: inicioDaSemana(foco), ate: somarDias(inicioDaSemana(foco), 7) };
  const grade = diasDoMes(foco);
  return { de: grade[0], ate: somarDias(grade[41], 1) };
}

export function rotuloDoPeriodo(visao: Visao, foco: Date): string {
  if (visao === 'dia') return `${DIAS_CURTOS[foco.getDay()]}, ${foco.getDate()} de ${MESES[foco.getMonth()]}`;
  if (visao === 'mes') return `${MESES[foco.getMonth()]} de ${foco.getFullYear()}`;
  const [a, , , , , , b] = diasDaSemana(foco);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} a ${b.getDate()} de ${MESES[a.getMonth()]}`
    : `${a.getDate()} de ${MESES[a.getMonth()]} a ${b.getDate()} de ${MESES[b.getMonth()]}`;
}

export const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function paraCampoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const MINUTOS_PADRAO = 30;
export const fimEfetivo = (inicio: string, fim: string | null) =>
  fim ? new Date(fim) : new Date(new Date(inicio).getTime() + MINUTOS_PADRAO * 60000);

export type Agendamento = {
  id: string;
  remote_jid: string | null;
  contato_nome: string | null;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  dia_inteiro: boolean;
  status: 'pendente' | 'concluido' | 'cancelado';
  criado_por: string | null;
  responsavel_id: string | null;
};

export const COR_STATUS: Record<Agendamento['status'], string> = {
  pendente: 'var(--color-marca)',
  concluido: '#15803D',
  cancelado: '#8A8B9C',
};
