// Guia "Automações" da gaveta — Bots | Campanhas | Notificações | Webhook.
// Espelha o builder do Sales BuildClinic: lista compacta na gaveta e um
// editor largo (modal) para regra e campanha, com "Quando / Faça / Então…".

import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Megaphone, Plus, Trash2, Webhook as WebhookIcon, BellRing, Play, Ban, X, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as db from '@/lib/db';
import type { RespostaDC, TagOpt } from '@/lib/types';
import * as motor from '@/lib/automacoes/motor';
import {
  CAMPOS_CONDICAO, CAMPOS_NOTIF, CAMPOS_SEGMENTO, EVENTOS_WEBHOOK, GATILHOS, LABEL_ACAO, LABEL_CAMPO,
  LABEL_CAMPO_NOTIF, LABEL_CAMPO_SEGMENTO, LABEL_EVENTO_NOTIF, LABEL_EVENTO_WEBHOOK, LABEL_GATILHO, LABEL_OPERADOR,
  LABEL_REEXECUCAO, LABEL_UNIDADE_ESPERA, OPERADORES_POR_CAMPO, REEXECUCOES, TIPOS_ACAO, UNIDADES_ESPERA,
  novaAutomacao, novaCampanha,
  type Acao, type Automacao, type Campanha, type Condicao, type NotificacaoConfig, type WebhookConfig,
} from '@/lib/automacoes/tipos';
import { toast } from './toast';

import { CABECALHO_SEGREDO } from '@/lib/marca';
type SubAba = 'bots' | 'campanhas' | 'notificacoes' | 'webhook';
const SUBABAS: { id: SubAba; rotulo: string; Icone: typeof Bot }[] = [
  { id: 'bots', rotulo: 'Bots', Icone: Bot },
  { id: 'campanhas', rotulo: 'Campanhas', Icone: Megaphone },
  { id: 'notificacoes', rotulo: 'Notificações', Icone: BellRing },
  { id: 'webhook', rotulo: 'Webhook', Icone: WebhookIcon },
];

const campo = 'h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-[12px] outline-none focus:border-brand';
const rotulo = 'mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted';

export function AutomacoesView() {
  const [sub, setSub] = useState<SubAba>('bots');
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [respostas, setRespostas] = useState<RespostaDC[]>([]);
  useEffect(() => {
    db.listarTags().then(setTags);
    db.listarRespostas().then(setRespostas);
  }, [sub]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bc-seg m-2 grid grid-cols-4">
        {SUBABAS.map((s) => (
          <button key={s.id} type="button" data-ativo={sub === s.id ? 1 : 0} onClick={() => setSub(s.id)} title={s.rotulo}>
            <s.Icone size={13} className="mx-auto" />
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sub === 'bots' && <Bots tags={tags} respostas={respostas} />}
        {sub === 'campanhas' && <Campanhas tags={tags} respostas={respostas} />}
        {sub === 'notificacoes' && <Notificacoes />}
        {sub === 'webhook' && <Webhook />}
      </div>
    </div>
  );
}

// ═══════════════════════════════ BOTS ═══════════════════════════════

function resumoCondicoes(a: Automacao): string {
  const f1 = a.condicoes.filter((c) => (c.fase ?? 1) === 1);
  if (f1.length === 0) return 'qualquer mensagem';
  return f1.map((c) => `${LABEL_CAMPO[c.campo]} ${LABEL_OPERADOR[c.operador]} “${c.valor}”`).join(a.condicaoCombinacao === 'OU' ? ' ou ' : ' e ');
}

function Bots({ tags, respostas }: { tags: TagOpt[]; respostas: RespostaDC[] }) {
  const [lista, setLista] = useState<Automacao[]>([]);
  const [editando, setEditando] = useState<Automacao | null>(null);
  const [execucoes, setExecucoes] = useState<{ agendadas: number; erros: number }>({ agendadas: 0, erros: 0 });

  const carregar = async () => {
    setLista(await motor.listarAutomacoes());
    const ex = await motor.listarExecucoes();
    setExecucoes({ agendadas: ex.filter((e) => e.status === 'agendado').length, erros: ex.filter((e) => e.status === 'erro').length });
  };
  useEffect(() => {
    carregar();
  }, []);

  async function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    const ids = lista.map((a) => a.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await motor.reordenarAutomacoes(ids);
    carregar();
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] leading-snug text-muted">
        Quando chega uma mensagem que casa as condições, a sequência de ações roda — com as esperas mesmo se o navegador fechar.
        {execucoes.agendadas > 0 && <> · <b>{execucoes.agendadas}</b> em andamento</>}
        {execucoes.erros > 0 && <> · <b className="text-danger">{execucoes.erros}</b> com erro</>}
      </p>
      <button
        type="button"
        onClick={() => setEditando(novaAutomacao(lista.length))}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-2 text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
      >
        <Plus size={13} /> Nova regra
      </button>
      {lista.length === 0 && <p className="px-1 py-4 text-center text-[12px] text-muted">Nenhuma regra ainda.</p>}
      {lista.map((a, i) => (
        <div key={a.id} className={cn('rounded-md border border-border bg-surface p-2.5', !a.ativo && 'opacity-60')}>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={async () => {
                await motor.salvarAutomacao({ ...a, ativo: !a.ativo });
                carregar();
              }}
              title={a.ativo ? 'Desligar' : 'Ligar'}
              className={cn('mt-0.5 h-4 w-7 flex-shrink-0 rounded-full transition', a.ativo ? 'bg-success' : 'bg-border-strong')}
            >
              <span className={cn('block h-3 w-3 rounded-full bg-white transition', a.ativo ? 'ml-3.5' : 'ml-0.5')} />
            </button>
            <button type="button" onClick={() => setEditando(a)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-[12.5px] font-bold">{a.nome || 'Sem nome'}</div>
              <div className="truncate text-[11px] text-muted">{resumoCondicoes(a)}</div>
              <div className="text-[10.5px] text-muted">
                {a.acoes.length} ação(ões) · {a.execucoes ?? 0} execução(ões) · {LABEL_REEXECUCAO[a.reexecucao]}
                {a.pararNoMatch && ' · para ao casar'}
              </div>
            </button>
            <span className="flex flex-col text-muted">
              <button type="button" onClick={() => mover(i, -1)} className="hover:text-brand"><ArrowUp size={12} /></button>
              <button type="button" onClick={() => mover(i, 1)} className="hover:text-brand"><ArrowDown size={12} /></button>
            </span>
          </div>
        </div>
      ))}
      {editando && (
        <EditorRegra
          inicial={editando}
          tags={tags}
          respostas={respostas}
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

// ── Editor de regra: "Quando" / "Faça" / "+ Então…" ──
function EditorRegra({
  inicial, tags, respostas, onFechar, onSalvo,
}: { inicial: Automacao; tags: TagOpt[]; respostas: RespostaDC[]; onFechar: () => void; onSalvo: () => void }) {
  const [a, setA] = useState<Automacao>(inicial);
  const [salvando, setSalvando] = useState(false);
  const fases = useMemo(() => {
    const n = Math.max(1, ...a.condicoes.map((c) => c.fase ?? 1), ...a.acoes.map((x) => x.fase ?? 1));
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [a]);
  const existente = (inicial.nome || inicial.condicoes.length > 0) && inicial.atualizadoEm !== inicial.atualizadoEm; // sempre false: só para clareza

  const setCond = (fase: number, idx: number, patch: Partial<Condicao>) =>
    setA((x) => {
      const lista = [...x.condicoes];
      const globais = lista.map((c, i) => ({ c, i })).filter(({ c }) => (c.fase ?? 1) === fase);
      const alvo = globais[idx]?.i;
      if (alvo === undefined) return x;
      lista[alvo] = { ...lista[alvo], ...patch };
      return { ...x, condicoes: lista };
    });
  const setAcao = (fase: number, idx: number, patch: Partial<Acao>) =>
    setA((x) => {
      const lista = [...x.acoes];
      const globais = lista.map((c, i) => ({ c, i })).filter(({ c }) => (c.fase ?? 1) === fase);
      const alvo = globais[idx]?.i;
      if (alvo === undefined) return x;
      lista[alvo] = { ...lista[alvo], ...patch };
      return { ...x, acoes: lista };
    });

  async function salvar() {
    if (!a.nome.trim()) return toast.error('Dê um nome à regra.');
    setSalvando(true);
    await motor.salvarAutomacao({ ...a, nome: a.nome.trim() });
    setSalvando(false);
    toast.success('Regra salva.');
    onSalvo();
  }
  async function remover() {
    if (!window.confirm('Apagar esta regra? As execuções em andamento dela são canceladas.')) return;
    await motor.removerAutomacao(a.id);
    onSalvo();
  }

  return (
    <ModalLargo titulo={inicial.nome ? 'Editar regra' : 'Nova regra'} onFechar={onFechar}>
      <div className="space-y-4">
        {/* Cabeçalho da regra */}
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2">
            <span className={rotulo}>Nome</span>
            <input value={a.nome} onChange={(e) => setA({ ...a, nome: e.target.value })} className={campo} placeholder="Ex.: Boas-vindas para quem pede orçamento" />
          </label>
          <label>
            <span className={rotulo}>Disparar quando</span>
            <select value={a.gatilho} onChange={(e) => setA({ ...a, gatilho: e.target.value as Automacao['gatilho'] })} className={campo}>
              {GATILHOS.map((g) => <option key={g} value={g} disabled={g === 'lead_webhook'}>{LABEL_GATILHO[g]}</option>)}
            </select>
          </label>
          <label>
            <span className={rotulo}>Reexecução</span>
            <select value={a.reexecucao} onChange={(e) => setA({ ...a, reexecucao: e.target.value as Automacao['reexecucao'] })} className={campo}>
              {REEXECUCOES.map((r) => <option key={r} value={r}>{LABEL_REEXECUCAO[r]}</option>)}
            </select>
          </label>
          <label>
            <span className={rotulo}>Combinar condições</span>
            <select value={a.condicaoCombinacao} onChange={(e) => setA({ ...a, condicaoCombinacao: e.target.value as 'E' | 'OU' })} className={campo}>
              <option value="E">Todas (E)</option>
              <option value="OU">Qualquer (OU)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[12px] font-semibold">
            <input type="checkbox" checked={a.pararNoMatch} onChange={(e) => setA({ ...a, pararNoMatch: e.target.checked })} />
            Parar ao casar (não avalia as próximas regras)
          </label>
        </div>

        {fases.map((fase) => {
          const conds = a.condicoes.filter((c) => (c.fase ?? 1) === fase);
          const acoes = a.acoes.filter((x) => (x.fase ?? 1) === fase);
          return (
            <div key={fase} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-brand">
                  {fase === 1 ? 'Quando (mensagem recebida)' : `Então… (bloco ${fase}, após concluir o anterior)`}
                </span>
                {fase > 1 && (
                  <button type="button" className="text-[11px] text-muted hover:text-danger" onClick={() => setA({ ...a, condicoes: a.condicoes.filter((c) => (c.fase ?? 1) !== fase), acoes: a.acoes.filter((x) => (x.fase ?? 1) !== fase) })}>
                    remover bloco
                  </button>
                )}
              </div>

              {/* Condições */}
              {conds.length === 0 && <p className="mb-2 text-[11px] text-muted">Sem condições: {fase === 1 ? 'qualquer mensagem casa.' : 'o bloco roda sempre.'}</p>}
              {conds.map((c, i) => (
                <div key={i} className="mb-1.5 grid grid-cols-[1fr_1.2fr_2fr_auto] gap-1.5">
                  <select value={c.campo} onChange={(e) => { const cp = e.target.value as Condicao['campo']; setCond(fase, i, { campo: cp, operador: OPERADORES_POR_CAMPO[cp][0] }); }} className={campo}>
                    {CAMPOS_CONDICAO.map((x) => <option key={x} value={x}>{LABEL_CAMPO[x]}</option>)}
                  </select>
                  <select value={c.operador} onChange={(e) => setCond(fase, i, { operador: e.target.value as Condicao['operador'] })} className={campo}>
                    {OPERADORES_POR_CAMPO[c.campo].map((o) => <option key={o} value={o}>{LABEL_OPERADOR[o]}</option>)}
                  </select>
                  <input value={c.valor} onChange={(e) => setCond(fase, i, { valor: e.target.value })} className={campo} placeholder={c.operador === 'em' ? 'lista: 11, 21, 31' : 'valor'} />
                  <button type="button" className="text-muted hover:text-danger" onClick={() => setA({ ...a, condicoes: a.condicoes.filter((x) => x !== c) })}><X size={13} /></button>
                </div>
              ))}
              <button type="button" className="mb-3 text-[11.5px] font-semibold text-brand" onClick={() => setA({ ...a, condicoes: [...a.condicoes, { campo: 'mensagem', operador: 'contem', valor: '', fase }] })}>
                + Condição
              </button>

              {/* Ações */}
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Faça (em sequência)</div>
              {acoes.map((x, i) => (
                <LinhaAcao key={i} acao={x} tags={tags} respostas={respostas} onChange={(patch) => setAcao(fase, i, patch)} onRemover={() => setA({ ...a, acoes: a.acoes.filter((y) => y !== x) })} />
              ))}
              <button type="button" className="text-[11.5px] font-semibold text-brand" onClick={() => setA({ ...a, acoes: [...a.acoes, { tipo: 'enviar_mensagem', texto: '', esperaValor: 0, esperaUnidade: 'seg', fase }] })}>
                + Ação
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-[12px] font-semibold text-muted transition hover:border-brand hover:text-brand"
          onClick={() => {
            const f = fases.length + 1;
            setA({ ...a, acoes: [...a.acoes, { tipo: 'enviar_mensagem', texto: '', esperaValor: 1, esperaUnidade: 'min', fase: f }] });
          }}
        >
          + Então… (novo bloco após concluir o anterior)
        </button>

        <p className="text-[10.5px] text-muted">
          Variáveis: {'{{nome}}'}, {'{{primeiro_nome}}'}, {'{{telefone}}'}, {'{{saudacao}}'}, {'{{data}}'}.
        </p>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          {inicial.nome ? (
            <button type="button" onClick={remover} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-danger"><Trash2 size={13} /> Apagar regra</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className="rounded-md border border-border-strong px-3 py-1.5 text-[12.5px] font-medium">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60">
              {salvando ? 'Salvando…' : 'Salvar regra'}
            </button>
          </div>
        </div>
        {existente && null}
      </div>
    </ModalLargo>
  );
}

function LinhaAcao({ acao, tags, respostas, onChange, onRemover, semEspera }: {
  acao: Acao; tags: TagOpt[]; respostas: RespostaDC[]; onChange: (p: Partial<Acao>) => void; onRemover: () => void; semEspera?: boolean;
}) {
  return (
    <div className="mb-1.5 rounded-md border border-border bg-surface p-2">
      <div className="flex items-center gap-1.5">
        <select value={acao.tipo} onChange={(e) => onChange({ tipo: e.target.value as Acao['tipo'] })} className={cn(campo, 'flex-1')}>
          {TIPOS_ACAO.filter((t) => !(semEspera && t === 'espera')).map((t) => <option key={t} value={t}>{LABEL_ACAO[t]}</option>)}
        </select>
        {!semEspera && (
          <>
            <span className="whitespace-nowrap text-[10.5px] text-muted">esperar antes</span>
            <input type="number" min={0} value={acao.esperaValor ?? 0} onChange={(e) => onChange({ esperaValor: Number(e.target.value) })} className={cn(campo, 'w-14')} />
            <select value={acao.esperaUnidade ?? 'seg'} onChange={(e) => onChange({ esperaUnidade: e.target.value as Acao['esperaUnidade'] })} className={cn(campo, 'w-20')}>
              {UNIDADES_ESPERA.map((u) => <option key={u} value={u}>{LABEL_UNIDADE_ESPERA[u]}</option>)}
            </select>
          </>
        )}
        <button type="button" onClick={onRemover} className="text-muted hover:text-danger"><X size={13} /></button>
      </div>
      {acao.tipo === 'enviar_mensagem' && (
        <textarea value={acao.texto ?? ''} onChange={(e) => onChange({ texto: e.target.value })} rows={2} className={cn(campo, 'mt-1.5 h-auto resize-none py-1.5')} placeholder="{{saudacao}}, {{primeiro_nome}}! Recebi sua mensagem…" />
      )}
      {acao.tipo === 'enviar_resposta_rapida' && (
        <select value={acao.respostaId ?? ''} onChange={(e) => onChange({ respostaId: e.target.value || null })} className={cn(campo, 'mt-1.5')}>
          <option value="">Escolha a mensagem rápida…</option>
          {respostas.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}
        </select>
      )}
      {(acao.tipo === 'mover_pasta' || acao.tipo === 'remover_pasta') && (
        <select value={acao.pastaId ?? ''} onChange={(e) => onChange({ pastaId: e.target.value || null })} className={cn(campo, 'mt-1.5')}>
          <option value="">Escolha a pasta…</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      )}
      {acao.tipo === 'espera' && <p className="mt-1 text-[10.5px] text-muted">Use o "esperar antes" da próxima ação — é ele que espaça.</p>}
    </div>
  );
}

// ═══════════════════════════════ CAMPANHAS ═══════════════════════════════

function Campanhas({ tags, respostas }: { tags: TagOpt[]; respostas: RespostaDC[] }) {
  const [lista, setLista] = useState<Campanha[]>([]);
  const [editando, setEditando] = useState<Campanha | null>(null);
  const carregar = async () => setLista((await motor.listarCampanhas()).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
  useEffect(() => {
    carregar();
    const t = window.setInterval(carregar, 5000);
    return () => window.clearInterval(t);
  }, []);
  const STATUS: Record<Campanha['status'], string> = { rascunho: 'rascunho', rodando: 'rodando', concluida: 'concluída', cancelada: 'cancelada' };

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] leading-snug text-muted">Envio em massa para um segmento, com intervalo aleatório entre contatos (anti-bloqueio). A aba do WhatsApp precisa ficar aberta.</p>
      <button type="button" onClick={() => setEditando(novaCampanha())} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-2 text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
        <Plus size={13} /> Nova campanha
      </button>
      {lista.length === 0 && <p className="px-1 py-4 text-center text-[12px] text-muted">Nenhuma campanha ainda.</p>}
      {lista.map((c) => (
        <div key={c.id} className="rounded-md border border-border bg-surface p-2.5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => c.status === 'rascunho' && setEditando(c)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-[12.5px] font-bold">{c.nome || 'Sem nome'}</div>
              <div className="text-[10.5px] text-muted">
                {STATUS[c.status]} · {c.totalEnviados}/{c.totalAlvos} enviados{c.totalErros > 0 && ` · ${c.totalErros} erro(s)`}
              </div>
            </button>
            {c.status === 'rascunho' && (
              <button type="button" title="Iniciar" className="grid h-7 w-7 place-items-center rounded-md text-success hover:bg-surface-2" onClick={async () => {
                if (!c.acoes.length) return toast.error('A campanha não tem ações.');
                const r = await motor.iniciarCampanha(c);
                toast.success(r.totalAlvos ? `Campanha iniciada para ${r.totalAlvos} contato(s).` : 'Nenhum contato casa o segmento.');
                carregar();
              }}><Play size={14} /></button>
            )}
            {c.status === 'rodando' && (
              <button type="button" title="Cancelar" className="grid h-7 w-7 place-items-center rounded-md text-danger hover:bg-surface-2" onClick={async () => { await motor.cancelarCampanha(c.id); carregar(); }}><Ban size={14} /></button>
            )}
            {c.status !== 'rodando' && (
              <button type="button" title="Apagar" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-danger" onClick={async () => { if (window.confirm('Apagar esta campanha?')) { await motor.removerCampanha(c.id); carregar(); } }}><Trash2 size={13} /></button>
            )}
          </div>
          {c.status === 'rodando' && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-brand transition-all" style={{ width: `${c.totalAlvos ? ((c.totalEnviados + c.totalErros) / c.totalAlvos) * 100 : 0}%` }} />
            </div>
          )}
        </div>
      ))}
      {editando && (
        <EditorCampanha inicial={editando} tags={tags} respostas={respostas} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />
      )}
    </div>
  );
}

function EditorCampanha({ inicial, tags, respostas, onFechar, onSalvo }: { inicial: Campanha; tags: TagOpt[]; respostas: RespostaDC[]; onFechar: () => void; onSalvo: () => void }) {
  const [c, setC] = useState<Campanha>(inicial);
  const [previa, setPrevia] = useState<number | null>(null);
  useEffect(() => {
    motor.alvosDoSegmento(c.segmento).then((l) => setPrevia(l.length));
  }, [c.segmento]);

  const setRegra = (i: number, patch: Partial<Campanha['segmento'][number]>) =>
    setC((x) => ({ ...x, segmento: x.segmento.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));

  async function salvar() {
    if (!c.nome.trim()) return toast.error('Dê um nome à campanha.');
    await motor.salvarCampanha({ ...c, nome: c.nome.trim() });
    onSalvo();
  }

  return (
    <ModalLargo titulo={inicial.nome ? 'Editar campanha' : 'Nova campanha'} onFechar={onFechar}>
      <div className="space-y-4">
        <label className="block"><span className={rotulo}>Nome</span><input value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} className={campo} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={rotulo}>Intervalo mínimo (seg)</span><input type="number" min={1} value={c.intervaloMinSeg} onChange={(e) => setC({ ...c, intervaloMinSeg: Number(e.target.value) })} className={campo} /></label>
          <label><span className={rotulo}>Intervalo máximo (seg)</span><input type="number" min={1} value={c.intervaloMaxSeg} onChange={(e) => setC({ ...c, intervaloMaxSeg: Number(e.target.value) })} className={campo} /></label>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand">Segmento (quem recebe)</div>
          {c.segmento.map((r, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[1.2fr_2fr_auto] gap-1.5">
              <select value={r.campo} onChange={(e) => setRegra(i, { campo: e.target.value as Campanha['segmento'][number]['campo'], valores: [] })} className={campo}>
                {CAMPOS_SEGMENTO.map((x) => <option key={x} value={x}>{LABEL_CAMPO_SEGMENTO[x]}</option>)}
              </select>
              {r.campo === 'pasta' ? (
                <select multiple value={r.valores} onChange={(e) => setRegra(i, { valores: [...e.target.selectedOptions].map((o) => o.value) })} className={cn(campo, 'h-20')}>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              ) : (
                <input value={r.valores.join(', ')} onChange={(e) => setRegra(i, { valores: e.target.value.split(/[,\s;]+/).filter(Boolean) })} className={campo} placeholder={r.campo === 'ddd' ? '11, 21' : 'dias'} />
              )}
              <button type="button" className="text-muted hover:text-danger" onClick={() => setC({ ...c, segmento: c.segmento.filter((_, k) => k !== i) })}><X size={13} /></button>
            </div>
          ))}
          <button type="button" className="text-[11.5px] font-semibold text-brand" onClick={() => setC({ ...c, segmento: [...c.segmento, { campo: 'ddd', valores: [] }] })}>+ Regra</button>
          <p className="mt-2 text-[11px] text-muted">{previa === null ? 'Calculando…' : `${previa} contato(s) casam hoje.`}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand">Ações (para cada contato)</div>
          {c.acoes.map((x, i) => (
            <LinhaAcao key={i} acao={x} tags={tags} respostas={respostas} semEspera onChange={(patch) => setC({ ...c, acoes: c.acoes.map((y, k) => (k === i ? { ...y, ...patch } : y)) })} onRemover={() => setC({ ...c, acoes: c.acoes.filter((_, k) => k !== i) })} />
          ))}
          <button type="button" className="text-[11.5px] font-semibold text-brand" onClick={() => setC({ ...c, acoes: [...c.acoes, { tipo: 'enviar_mensagem', texto: '', fase: 1 }] })}>+ Ação</button>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onFechar} className="rounded-md border border-border-strong px-3 py-1.5 text-[12.5px] font-medium">Cancelar</button>
          <button type="button" onClick={salvar} className="rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white">Salvar rascunho</button>
        </div>
      </div>
    </ModalLargo>
  );
}

// ═══════════════════════════════ NOTIFICAÇÕES ═══════════════════════════════

function Notificacoes() {
  const [lista, setLista] = useState<NotificacaoConfig[]>([]);
  useEffect(() => {
    motor.listarNotificacoes().then(setLista);
  }, []);
  const atualizar = (evento: NotificacaoConfig['evento'], patch: Partial<NotificacaoConfig>) =>
    setLista((l) => l.map((n) => (n.evento === evento ? { ...n, ...patch } : n)));

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] leading-snug text-muted">Avisa alguém no WhatsApp quando um evento acontece na extensão. Destinatários: números com DDI (5511999998888), um por linha.</p>
      {lista.map((n) => (
        <div key={n.evento} className="rounded-md border border-border bg-surface p-2.5">
          <label className="flex items-center gap-2 text-[12.5px] font-bold">
            <input type="checkbox" checked={n.ativo} onChange={(e) => atualizar(n.evento, { ativo: e.target.checked })} />
            {LABEL_EVENTO_NOTIF[n.evento]}
          </label>
          {n.ativo && (
            <div className="mt-2 space-y-2">
              <textarea value={n.destinatarios.join('\n')} onChange={(e) => atualizar(n.evento, { destinatarios: e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean) })} rows={2} className={cn(campo, 'h-auto resize-none py-1.5')} placeholder="5511999998888" />
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {CAMPOS_NOTIF.map((cmp) => (
                  <label key={cmp} className="flex items-center gap-1 text-[11px]">
                    <input type="checkbox" checked={n.campos.includes(cmp)} onChange={(e) => atualizar(n.evento, { campos: e.target.checked ? [...n.campos, cmp] : n.campos.filter((x) => x !== cmp) })} />
                    {LABEL_CAMPO_NOTIF[cmp]}
                  </label>
                ))}
              </div>
              <input value={n.textoExtra} onChange={(e) => atualizar(n.evento, { textoExtra: e.target.value })} className={campo} placeholder="Texto extra (opcional)" />
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={async () => { await motor.salvarNotificacoes(lista); toast.success('Notificações salvas.'); }} className="w-full rounded-md bg-brand px-3 py-2 text-[12.5px] font-semibold text-white">
        Salvar notificações
      </button>
    </div>
  );
}

// ═══════════════════════════════ WEBHOOK ═══════════════════════════════

function Webhook() {
  const [w, setW] = useState<WebhookConfig | null>(null);
  const [testando, setTestando] = useState(false);
  useEffect(() => {
    motor.obterWebhook().then(setW);
  }, []);
  if (!w) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface p-2.5">
        <div className="mb-1 text-[12.5px] font-bold">Saída (a extensão envia)</div>
        <p className="mb-2 text-[11px] leading-snug text-muted">POST com JSON <code>{'{ source, event, payload }'}</code> para a URL abaixo quando um evento marcado acontece.</p>
        <label className="flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" checked={w.ativo} onChange={(e) => setW({ ...w, ativo: e.target.checked })} /> Ativo</label>
        <label className="mt-2 block"><span className={rotulo}>URL</span><input value={w.url} onChange={(e) => setW({ ...w, url: e.target.value })} className={campo} placeholder="https://…" /></label>
        <label className="mt-2 block"><span className={rotulo}>Segredo (cabeçalho {CABECALHO_SEGREDO})</span><input value={w.segredo} onChange={(e) => setW({ ...w, segredo: e.target.value })} className={campo} placeholder="opcional" /></label>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {EVENTOS_WEBHOOK.map((ev) => (
            <label key={ev} className="flex items-center gap-1 text-[11px]">
              <input type="checkbox" checked={w.eventos.includes(ev)} onChange={(e) => setW({ ...w, eventos: e.target.checked ? [...w.eventos, ev] : w.eventos.filter((x) => x !== ev) })} />
              {LABEL_EVENTO_WEBHOOK[ev]}
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={testando || !w.url} onClick={async () => { setTestando(true); const r = await motor.testarWebhook(w); setTestando(false); r.ok ? toast.success(`Webhook respondeu ${r.status}.`) : toast.error(r.erro ?? `Falhou (${r.status}).`); }} className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60">
            {testando ? <Loader2 size={12} className="animate-spin" /> : null} Testar
          </button>
          <button type="button" onClick={async () => { await motor.salvarWebhook(w); toast.success('Webhook salvo.'); }} className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-white">Salvar</button>
        </div>
      </div>
      <div className="rounded-md border border-dashed border-border-strong p-2.5 text-[11px] leading-snug text-muted">
        <b>Entrada (lead via webhook)</b> — receber um POST externo exige um servidor. A UI está preparada (gatilho “Lead recebido via webhook”), mas fica desligada até o backend expor o endpoint.
      </div>
    </div>
  );
}

// ── Modal largo (o editor não cabe na gaveta) ──
function ModalLargo({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-[75] flex items-center justify-center bg-text/50 p-4" onClick={onFechar}>
      <div className="bc-anim-pop flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
          <h3 className="inline-flex items-center gap-1.5 text-[14px] font-bold"><Bot size={15} className="text-brand" /> {titulo}</h3>
          <button type="button" onClick={onFechar} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
