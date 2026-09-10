// Calendário da clínica dentro da extensão — dia, semana (padrão) e mês.
//
// A agenda é compartilhada: todo mundo da clínica vê o que a equipe marcou.
// Mexer é de quem criou, de quem responde pelo compromisso ou do admin
// (`db.podeMexerNoAgendamento`, e a RLS confere de novo no servidor).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, Trash2, X } from 'lucide-react';
import { cn, emPx, formatarTelefone } from '@/lib/utils';
import * as db from '@/lib/db';
import { modalAgenda, perfilAtual } from '@/lib/store';
import { MARCA, corDaEtiqueta } from '@/lib/marca';
import { ALTURA_TOPBAR } from './TopBar';
import {
  DIAS_CURTOS, MINUTOS_PADRAO, type Visao, diasDaSemana, diasDoMes, ehHoje, fimEfetivo, hhmm,
  inicioDoDia, mesmoDia, paraCampoLocal, periodo, rotuloDoPeriodo, somarDias, somarMeses,
} from '@/lib/agenda';
import type { Agendamento } from '@/lib/types';
import { toast } from './toast';

const HORA_INICIO = 6; // a grade começa às 6h — antes disso quase nunca há nada
const HORA_FIM = 22;
const ALTURA_HORA = 44; // px por hora na grade de dia/semana

/** Cor do compromisso: a etiqueta manda; sem etiqueta, vale a situação. */
const CORES: Record<Agendamento['status'], string> = {
  pendente: 'var(--brand)',
  concluido: 'var(--green)',
  cancelado: 'var(--muted)',
};
const corDo = (a: Agendamento) =>
  a.status === 'cancelado' ? CORES.cancelado : corDaEtiqueta(a.etiqueta) ?? CORES[a.status];

/** Atrasada = ainda pendente e o horário já passou. */
export const estaAtrasada = (a: Agendamento) =>
  a.status === 'pendente' && new Date(a.inicio).getTime() < Date.now();

export function AgendaModal() {
  const [visao, setVisao] = useState<Visao>('semana'); // padrão pedido: semana
  const [foco, setFoco] = useState(new Date());
  const [itens, setItens] = useState<Agendamento[] | null>(null);
  const [editando, setEditando] = useState<Partial<Agendamento> | null>(null);
  // "Minha agenda" × "Equipe". O que desce do servidor já vem limitado à
  // equipe (RLS); aqui a pessoa escolhe se quer ver só o que é dela.
  const [soMinha, setSoMinha] = useState(true);
  // Filtros do calendário: etiqueta, atrasadas e busca no texto da atividade.
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [busca, setBusca] = useState('');
  const [perfil, setPerfil] = useState(perfilAtual.get());
  useEffect(() => perfilAtual.subscribe(setPerfil), []);

  const fechar = () => modalAgenda.set(false);

  const carregar = useCallback(async () => setItens(await db.listarAgenda()), []);

  useEffect(() => {
    carregar();
    const onChange = (m: Record<string, unknown>) => {
      if ('bc2_agenda' in m) carregar();
    };
    chrome.storage.onChanged.addListener(onChange as any);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (editando) setEditando(null);
        else fechar();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      chrome.storage.onChanged.removeListener(onChange as any);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [carregar, editando]);

  const { de, ate } = periodo(visao, foco);
  // Sem autor nem responsável (compromisso local antigo) conta como meu — senão
  // ele sumiria tanto em "Minha" quanto em "Equipe".
  const meu = (a: Agendamento) =>
    !perfil || a.autorId === perfil.id || a.responsavelId === perfil.id || (!a.autorId && !a.responsavelId);
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const doPeriodo = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (itens ?? []).filter((a) => {
      const i = new Date(a.inicio);
      if (i < de || i >= ate) return false;
      if (soMinha && !meu(a)) return false;
      if (etiqueta && a.etiqueta !== etiqueta) return false;
      if (soAtrasadas && !estaAtrasada(a)) return false;
      if (termo && !semAcento(`${a.titulo} ${a.descricao ?? ''} ${a.contatoNome ?? ''}`).includes(termo)) return false;
      return true;
    });
  }, [itens, de.getTime(), ate.getTime(), soMinha, perfil?.id, etiqueta, soAtrasadas, busca]);
  const atrasadas = (itens ?? []).filter((a) => estaAtrasada(a) && (!soMinha || meu(a))).length;
  const deOutros = (itens ?? []).filter((a) => {
    const i = new Date(a.inicio);
    return i >= de && i < ate && !meu(a);
  }).length;

  const andar = (passo: number) => {
    if (visao === 'dia') setFoco((f) => somarDias(f, passo));
    else if (visao === 'semana') setFoco((f) => somarDias(f, passo * 7));
    else setFoco((f) => somarMeses(f, passo));
  };

  const novo = (quando: Date) =>
    setEditando({
      inicio: quando.toISOString(),
      fim: null,
      titulo: '',
      descricao: null,
      remoteJid: null,
      contatoNome: null,
      diaInteiro: false,
      status: 'pendente',
    });

  return (
    <div
      className="bc-anim-fade pointer-events-auto fixed inset-x-0 bottom-0 z-[62] flex flex-col bg-bg"
      style={{ top: emPx(ALTURA_TOPBAR) }}
    >
      {/* Barra da agenda */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-text">
          <CalendarDays size={16} className="text-brand" /> Agenda
        </span>

        <button
          type="button"
          onClick={() => setFoco(new Date())}
          className="rounded-md border border-border-strong px-2.5 py-1 text-[11.5px] font-semibold text-text-2 transition hover:bg-surface-2"
        >
          Hoje
        </button>
        <span className="flex items-center gap-0.5">
          <button type="button" onClick={() => andar(-1)} title="Anterior" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => andar(1)} title="Próximo" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <ChevronRight size={16} />
          </button>
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text first-letter:uppercase">
          {rotuloDoPeriodo(visao, foco)}
        </span>

        {/* De quem: só meus compromissos ou também os da minha equipe. */}
        <span className="bc-seg flex flex-shrink-0 items-center">
          <button type="button" data-ativo={soMinha ? 1 : 0} onClick={() => setSoMinha(true)} title="Só o que eu marquei ou respondo">
            Minha
          </button>
          <button
            type="button"
            data-ativo={!soMinha ? 1 : 0}
            onClick={() => setSoMinha(false)}
            title={perfil?.papel === 'admin' ? 'Toda a clínica' : 'Também os colegas da minha equipe'}
          >
            {perfil?.papel === 'admin' ? 'Clínica' : 'Equipe'}
            {deOutros > 0 && <span className="ml-1 opacity-70">{deOutros}</span>}
          </button>
        </span>

        <span className="bc-seg flex flex-shrink-0 items-center">
          {(['dia', 'semana', 'mes'] as Visao[]).map((v) => (
            <button key={v} type="button" data-ativo={visao === v ? 1 : 0} onClick={() => setVisao(v)}>
              {v === 'mes' ? 'Mês' : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={() => novo(proximaHoraCheia())}
          className="flex-shrink-0 rounded-md bg-brand px-3 py-1 text-[12px] font-semibold text-white transition hover:opacity-90"
        >
          Novo
        </button>
        <button type="button" onClick={fechar} title="Fechar agenda" className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2">
          <X size={16} />
        </button>
      </div>

      {/* Filtros: etiqueta, atrasadas e busca no texto da atividade. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-1.5">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar na atividade…"
          className="h-7 w-44 rounded-md border border-border-strong bg-surface px-2.5 text-[11.5px] outline-none focus:border-brand"
        />
        <Etiqueta ativa={etiqueta === null} onClick={() => setEtiqueta(null)}>Todas</Etiqueta>
        {MARCA.etiquetasAgenda.map((e) => (
          <Etiqueta key={e.nome} cor={e.cor} ativa={etiqueta === e.nome} onClick={() => setEtiqueta(etiqueta === e.nome ? null : e.nome)}>
            {e.nome}
          </Etiqueta>
        ))}
        <button
          type="button"
          onClick={() => setSoAtrasadas((v) => !v)}
          title="Atividades pendentes cujo horário já passou"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold transition',
            soAtrasadas ? 'border-danger bg-danger text-white' : 'border-border-strong text-text-2 hover:border-danger hover:text-danger',
          )}
        >
          Atrasadas{atrasadas > 0 && <span className={cn('rounded-full px-1 text-[9.5px]', soAtrasadas ? 'bg-black/25' : 'bg-danger text-white')}>{atrasadas}</span>}
        </button>
        <span className="ml-auto text-[11px] text-muted">{doPeriodo.length} no período</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {itens === null ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-muted">
            <Loader2 size={14} className="animate-spin" /> Carregando…
          </div>
        ) : visao === 'mes' ? (
          <GradeMes foco={foco} itens={doPeriodo} onDia={(d) => { setFoco(d); setVisao('dia'); }} onAbrir={setEditando} />
        ) : (
          <GradeHoras
            dias={visao === 'dia' ? [inicioDoDia(foco)] : diasDaSemana(foco)}
            itens={doPeriodo}
            onVago={novo}
            onAbrir={setEditando}
          />
        )}
      </div>

      {editando && (
        <EditorAgendamento
          valor={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function proximaHoraCheia(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

// ── Grade de horas (dia e semana) ───────────────────────────────────────────
function GradeHoras({
  dias, itens, onVago, onAbrir,
}: {
  dias: Date[];
  itens: Agendamento[];
  onVago: (d: Date) => void;
  onAbrir: (a: Agendamento) => void;
}) {
  const horas = Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);

  return (
    <div className="min-w-[560px]">
      {/* Cabeçalho dos dias */}
      <div className="sticky top-0 z-[2] flex border-b border-border bg-surface">
        <span className="w-12 flex-shrink-0" />
        {dias.map((d) => (
          <span key={+d} className="flex min-w-0 flex-1 flex-col items-center py-1.5">
            <span className="text-[10.5px] uppercase text-muted">{DIAS_CURTOS[d.getDay()]}</span>
            <span
              className={cn(
                'grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13px] font-bold',
                ehHoje(d) ? 'bg-brand text-white' : 'text-text',
              )}
            >
              {d.getDate()}
            </span>
          </span>
        ))}
      </div>

      <div className="flex">
        {/* Régua das horas */}
        <div className="w-12 flex-shrink-0">
          {horas.map((h) => (
            <div key={h} className="relative text-right" style={{ height: ALTURA_HORA }}>
              <span className="absolute -top-1.5 right-1.5 text-[10px] text-muted">{String(h).padStart(2, '0')}h</span>
            </div>
          ))}
        </div>

        {dias.map((d) => {
          const doDia = itens.filter((a) => mesmoDia(new Date(a.inicio), d));
          return (
            <div key={+d} className="relative min-w-0 flex-1 border-l border-border">
              {horas.map((h) => (
                <button
                  key={h}
                  type="button"
                  title="Marcar neste horário"
                  onClick={() => {
                    const q = new Date(d);
                    q.setHours(h, 0, 0, 0);
                    onVago(q);
                  }}
                  className="block w-full border-b border-border/60 transition hover:bg-surface-2"
                  style={{ height: ALTURA_HORA }}
                />
              ))}

              {doDia.map((a) => {
                const ini = new Date(a.inicio);
                const minutos = (ini.getHours() - HORA_INICIO) * 60 + ini.getMinutes();
                const dur = Math.max(
                  20,
                  (fimEfetivo(a.inicio, a.fim).getTime() - ini.getTime()) / 60000,
                );
                const cor = corDo(a);
                const altura = (dur / 60) * ALTURA_HORA;
                const apertado = altura < 34; // 30 min ou menos: tudo numa linha
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onAbrir(a)}
                    title={`${hhmm(a.inicio)} · ${a.titulo}`}
                    className="absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-white transition hover:opacity-90"
                    style={{
                      top: Math.max(0, (minutos / 60) * ALTURA_HORA),
                      height: altura,
                      background: cor,
                      opacity: a.status === 'concluido' ? 0.7 : 1,
                      textDecoration: a.status === 'cancelado' ? 'line-through' : undefined,
                    }}
                  >
                    {apertado ? (
                      <span className="block truncate text-[10.5px] leading-[1.35]">
                        <span className="font-bold">{hhmm(a.inicio)}</span> {a.titulo}
                      </span>
                    ) : (
                      <>
                        <span className="block truncate text-[10.5px] font-bold leading-tight">{hhmm(a.inicio)}</span>
                        <span className="block truncate text-[11px] leading-tight">{a.titulo}</span>
                        {altura > 56 && (a.contatoNome || a.autorNome) && (
                          <span className="block truncate text-[10px] opacity-80">
                            {a.contatoNome ?? `por ${a.autorNome}`}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Grade do mês ────────────────────────────────────────────────────────────
function GradeMes({
  foco, itens, onDia, onAbrir,
}: {
  foco: Date;
  itens: Agendamento[];
  onDia: (d: Date) => void;
  onAbrir: (a: Agendamento) => void;
}) {
  const dias = diasDoMes(foco);
  return (
    <div className="min-w-[560px] p-2">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DIAS_CURTOS.map((d) => (
          <span key={d} className="text-center text-[10.5px] uppercase text-muted">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map((d) => {
          const doDia = itens.filter((a) => mesmoDia(new Date(a.inicio), d));
          const doMes = d.getMonth() === foco.getMonth();
          return (
            <div
              key={+d}
              className={cn(
                'min-h-[76px] rounded-md border border-border p-1',
                doMes ? 'bg-surface' : 'bg-surface-2/40 opacity-60',
              )}
            >
              <button
                type="button"
                onClick={() => onDia(d)}
                title="Ver este dia"
                className={cn(
                  'mb-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11.5px] font-bold',
                  ehHoje(d) ? 'bg-brand text-white' : 'text-text-2 hover:bg-surface-2',
                )}
              >
                {d.getDate()}
              </button>
              <div className="flex flex-col gap-0.5">
                {doDia.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onAbrir(a)}
                    title={`${hhmm(a.inicio)} · ${a.titulo}`}
                    className="truncate rounded px-1 text-left text-[10px] font-semibold text-white"
                    style={{ background: corDo(a), opacity: a.status === 'concluido' ? 0.65 : 1 }}
                  >
                    {hhmm(a.inicio)} {a.titulo}
                  </button>
                ))}
                {doDia.length > 3 && (
                  <button type="button" onClick={() => onDia(d)} className="px-1 text-left text-[10px] text-muted hover:text-brand">
                    + {doDia.length - 3}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Editor de um compromisso ────────────────────────────────────────────────
export function EditorAgendamento({
  valor, onFechar, onSalvo,
}: {
  valor: Partial<Agendamento>;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState(valor.titulo ?? '');
  const [descricao, setDescricao] = useState(valor.descricao ?? '');
  // Contato vinculado. Vem preenchido quando o compromisso nasce na guia
  // Contato; marcado pelo calendário, dá para escolher aqui.
  const [jid, setJid] = useState<string | null>(valor.remoteJid ?? null);
  const [nomeContato, setNomeContato] = useState<string | null>(valor.contatoNome ?? null);
  const [etiqueta, setEtiqueta] = useState<string | null>(valor.etiqueta ?? null);
  const [buscaContato, setBuscaContato] = useState('');
  const [conhecidos, setConhecidos] = useState<{ jid: string; nome: string; telefone: string | null }[]>([]);
  const [inicio, setInicio] = useState(paraCampoLocal(new Date(valor.inicio ?? Date.now())));
  const [duracao, setDuracao] = useState(() => {
    if (!valor.inicio || !valor.fim) return MINUTOS_PADRAO;
    return Math.round((new Date(valor.fim).getTime() - new Date(valor.inicio).getTime()) / 60000);
  });
  const [salvando, setSalvando] = useState(false);
  const existente = !!valor.id;

  // Contatos que já conversaram com a clínica (as fichas locais).
  useEffect(() => {
    let vivo = true;
    db.mapaFichas().then((mapa) => {
      if (!vivo) return;
      const lista = Object.entries(mapa)
        .filter(([chatId]) => chatId.includes('@') && !chatId.endsWith('@g.us'))
        .map(([chatId, f]) => ({
          jid: chatId,
          nome: (f.nome?.trim() || f.nomeWhatsapp?.trim() || formatarTelefone(f.telefone) || chatId.split('@')[0])!,
          telefone: formatarTelefone(f.telefone),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setConhecidos(lista);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termo = semAcento(buscaContato.trim());
  const sugestoes = termo
    ? conhecidos.filter((c) => semAcento(c.nome).includes(termo) || (c.telefone ?? '').includes(termo)).slice(0, 6)
    : [];
  const meu = !existente || db.podeMexerNoAgendamento(valor as Agendamento);

  async function salvar() {
    const t = titulo.trim();
    if (!t || salvando) return;
    setSalvando(true);
    const ini = new Date(inicio);
    try {
      await db.salvarAgendamento({
        id: valor.id,
        remoteJid: jid,
        contatoNome: nomeContato,
        titulo: t,
        descricao: descricao.trim() || null,
        inicio: ini.toISOString(),
        fim: new Date(ini.getTime() + duracao * 60000).toISOString(),
        diaInteiro: false,
        status: valor.status ?? 'pendente',
        etiqueta,
        responsavelId: valor.responsavelId ?? perfilAtual.get()?.id ?? null,
      });
      toast.success(existente ? 'Compromisso atualizado.' : 'Compromisso marcado.');
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(status: Agendamento['status']) {
    if (!valor.id) return;
    await db.salvarAgendamento({ ...(valor as Agendamento), status });
    toast.success(status === 'concluido' ? 'Marcado como feito.' : 'Compromisso cancelado.');
    onSalvo();
  }

  async function apagar() {
    if (!valor.id || !window.confirm('Apagar este compromisso da agenda?')) return;
    await db.removerAgendamento(valor.id);
    toast.success('Compromisso apagado.');
    onSalvo();
  }

  const campo = 'w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand';

  return (
    <div className="pointer-events-auto fixed inset-0 z-[68] flex items-center justify-center bg-text/40 p-4" onClick={onFechar}>
      <div className="bc-anim-pop w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-bold">{existente ? 'Compromisso' : 'Novo compromisso'}</h3>
          <button type="button" onClick={onFechar} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <X size={15} />
          </button>
        </div>

        {/* Contato vinculado: mostra o escolhido, ou deixa procurar um. */}
        {jid ? (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px]">
              <span className="text-muted">Contato: </span>
              <span className="font-semibold text-text">{nomeContato ?? jid.split('@')[0]}</span>
            </span>
            {meu && (
              <button
                type="button"
                onClick={() => {
                  setJid(null);
                  setNomeContato(null);
                }}
                title="Desvincular o contato"
                className="flex-shrink-0 text-[11px] text-muted transition hover:text-danger"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          meu && (
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Contato (opcional)
              <input
                value={buscaContato}
                onChange={(e) => setBuscaContato(e.target.value)}
                placeholder="Procure pelo nome ou telefone…"
                className={cn(campo, 'mt-1 font-normal normal-case tracking-normal')}
              />
              {sugestoes.length > 0 && (
                <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-surface">
                  {sugestoes.map((c) => (
                    <li key={c.jid}>
                      <button
                        type="button"
                        onClick={() => {
                          setJid(c.jid);
                          setNomeContato(c.nome);
                          setBuscaContato('');
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[12px] font-normal normal-case tracking-normal text-text">{c.nome}</span>
                        {c.telefone && <span className="flex-shrink-0 text-[10.5px] font-normal text-muted">{c.telefone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {termo && sugestoes.length === 0 && (
                <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-muted">
                  Nenhum contato com esse nome. O compromisso pode ficar sem contato.
                </span>
              )}
            </label>
          )
        )}

        <div className="mb-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Etiqueta</span>
          <div className="flex flex-wrap gap-1.5">
            {MARCA.etiquetasAgenda.map((e) => (
              <button
                key={e.nome}
                type="button"
                disabled={!meu}
                onClick={() => setEtiqueta(etiqueta === e.nome ? null : e.nome)}
                className={cn(
                  'rounded-md border px-2.5 py-0.5 text-[11.5px] font-bold transition disabled:opacity-50',
                  etiqueta === e.nome ? 'text-white' : 'bg-surface',
                )}
                style={{
                  borderColor: e.cor,
                  color: etiqueta === e.nome ? '#fff' : e.cor,
                  background: etiqueta === e.nome ? e.cor : undefined,
                }}
              >
                {e.nome}
              </button>
            ))}
            {/* Etiqueta que não está mais na lista (ou veio da outra marca). */}
            {etiqueta && !MARCA.etiquetasAgenda.some((e) => e.nome === etiqueta) && (
              <button
                type="button"
                disabled={!meu}
                onClick={() => setEtiqueta(null)}
                className="rounded-md border border-border-strong bg-surface px-2.5 py-0.5 text-[11.5px] font-bold text-text-2"
              >
                {etiqueta} ✕
              </button>
            )}
          </div>
        </div>

        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
          Atividade
          <input autoFocus disabled={!meu} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Retornar para a Dra. Ana" className={cn(campo, 'mt-1 font-normal normal-case tracking-normal')} />
        </label>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Quando
            <input type="datetime-local" disabled={!meu} value={inicio} onChange={(e) => setInicio(e.target.value)} className={cn(campo, 'mt-1 font-normal normal-case tracking-normal')} />
          </label>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Duração
            <select disabled={!meu} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} className={cn(campo, 'mt-1 font-normal normal-case tracking-normal')}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-muted">
          Observação
          <textarea disabled={!meu} value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={cn(campo, 'mt-1 resize-none font-normal normal-case tracking-normal')} />
        </label>

        {!meu && (
          <p className="mb-3 rounded-md bg-surface-2 px-2.5 py-2 text-[11.5px] text-muted">
            Marcado por {valor.autorNome ?? 'outra pessoa'}. Só quem criou, o responsável ou o
            administrador podem alterar.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {existente && meu && (
            <>
              <button type="button" onClick={apagar} className="mr-auto inline-flex items-center gap-1 rounded-md border border-danger/50 px-2.5 py-1 text-[11.5px] font-semibold text-danger transition hover:bg-red-bg">
                <Trash2 size={12} /> Apagar
              </button>
              {valor.status !== 'concluido' && (
                <button type="button" onClick={() => mudarStatus('concluido')} className="inline-flex items-center gap-1 rounded-md border border-success/60 px-2.5 py-1 text-[11.5px] font-semibold text-success transition hover:opacity-80">
                  <Check size={12} /> Feito
                </button>
              )}
            </>
          )}
          <button type="button" onClick={onFechar} className="rounded-md border border-border-strong px-3 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-surface-2">
            Fechar
          </button>
          {meu && (
            <button type="button" onClick={salvar} disabled={!titulo.trim() || salvando} className="rounded-md bg-brand px-3 py-1 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pílula de etiqueta usada nos filtros do calendário. */
function Etiqueta({
  children, ativa, cor, onClick,
}: {
  children: React.ReactNode;
  ativa: boolean;
  cor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-0.5 text-[11px] font-bold transition',
        !cor && (ativa ? 'border-brand bg-brand text-white' : 'border-border-strong text-text-2 hover:border-brand'),
      )}
      style={cor ? { borderColor: cor, color: ativa ? '#fff' : cor, background: ativa ? cor : undefined } : undefined}
    >
      {children}
    </button>
  );
}
