'use client';

// Agenda da clínica no painel — dia, semana (padrão) e mês.
//
// É a mesma tabela que a extensão usa: o retorno marcado durante a conversa
// aparece aqui no sync seguinte, e o que for marcado aqui desce para a
// extensão. Todo mundo da clínica vê a agenda; mexer é de quem criou, de quem
// responde pelo compromisso ou do admin (a RLS confere).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { carregarPerfil, supabase, ehAdmin, formatarTelefone, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao, Modal } from '@/componentes/ui';
import { useMarca } from '../../marca-cliente';
import {
  COR_STATUS, DIAS_CURTOS, MINUTOS_PADRAO, corDoCompromisso, estaAtrasada, type Agendamento, type Visao,
  diasDaSemana, diasDoMes, ehHoje, fimEfetivo, hhmm, inicioDoDia, mesmoDia,
  paraCampoLocal, periodo, rotuloDoPeriodo, somarDias, somarMeses,
} from '@/lib/agenda';

const HORA_INICIO = 6;
const HORA_FIM = 22;
const ALTURA_HORA = 46;

type Usuario = { id: string; nome: string };
type ContatoLeve = { remote_jid: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null };

export default function Agenda() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [todos, setTodos] = useState<Agendamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // Para vincular o compromisso a um cliente direto do calendário.
  const [contatos, setContatos] = useState<ContatoLeve[]>([]);
  const [visao, setVisao] = useState<Visao>('semana');
  // "Minha agenda" × "Equipe". O servidor já limita à equipe (RLS); aqui a
  // pessoa escolhe se quer ver só o que é dela.
  const [soMinha, setSoMinha] = useState(true);
  // Filtros: etiqueta, atrasadas e busca no texto da atividade.
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [busca, setBusca] = useState('');
  const marca = useMarca();
  const [foco, setFoco] = useState(new Date());
  const [editando, setEditando] = useState<Partial<Agendamento> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const { de, ate } = periodo(visao, foco);

  const carregar = useCallback(async () => {
    const [{ data }, { data: us }, { data: ct }] = await Promise.all([
      supabase
        .from('agendamentos')
        .select('id, remote_jid, contato_nome, titulo, descricao, inicio, fim, dia_inteiro, status, etiqueta, criado_por, responsavel_id')
        .is('deleted_at', null)
        .gte('inicio', de.toISOString())
        .lt('inicio', ate.toISOString())
        .order('inicio'),
      supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('contatos').select('remote_jid, nome, nome_whatsapp, telefone').is('deleted_at', null).limit(2000),
    ]);
    setTodos((data as Agendamento[]) ?? []);
    setUsuarios((us as Usuario[]) ?? []);
    // Um contato pode ter uma linha por WhatsApp da equipe: junta por remote_jid.
    const porJid = new Map<string, ContatoLeve>();
    for (const c of ((ct as ContatoLeve[]) ?? [])) {
      const atual = porJid.get(c.remote_jid);
      if (!atual) porJid.set(c.remote_jid, c);
      else porJid.set(c.remote_jid, { ...atual, nome: atual.nome ?? c.nome, nome_whatsapp: atual.nome_whatsapp ?? c.nome_whatsapp, telefone: atual.telefone ?? c.telefone });
    }
    setContatos([...porJid.values()]);
    setCarregando(false);
  }, [de.getTime(), ate.getTime()]);

  useEffect(() => {
    carregarPerfil().then(setPerfil);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const nomeDe = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? null;
  const meu = (a: Agendamento) =>
    !perfil || a.criado_por === perfil.id || a.responsavel_id === perfil.id || (!a.criado_por && !a.responsavel_id);
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const itens = useMemo(() => {
    const termo = semAcento(busca.trim());
    return todos.filter((a) => {
      if (soMinha && !meu(a)) return false;
      if (etiqueta && a.etiqueta !== etiqueta) return false;
      if (soAtrasadas && !estaAtrasada(a)) return false;
      if (termo && !semAcento(`${a.titulo} ${a.descricao ?? ''} ${a.contato_nome ?? ''}`).includes(termo)) return false;
      return true;
    });
  }, [todos, soMinha, perfil?.id, etiqueta, soAtrasadas, busca]);
  const deOutros = todos.length - todos.filter(meu).length;
  const atrasadas = todos.filter((a) => estaAtrasada(a) && (!soMinha || meu(a))).length;
  const cor = (a: Agendamento) => corDoCompromisso(a, marca.etiquetasAgenda);
  const podeMexer = (a: Partial<Agendamento>) =>
    !a.id || !perfil || a.criado_por === perfil.id || a.responsavel_id === perfil.id || ehAdmin(perfil);

  const andar = (passo: number) => {
    if (visao === 'dia') setFoco((f) => somarDias(f, passo));
    else if (visao === 'semana') setFoco((f) => somarDias(f, passo * 7));
    else setFoco((f) => somarMeses(f, passo));
  };

  const novo = (quando: Date) =>
    setEditando({ inicio: quando.toISOString(), titulo: '', status: 'pendente', responsavel_id: perfil?.id ?? null });

  return (
    <div>
      <Cabecalho
        titulo="Agenda"
        subtitulo="Retornos e compromissos da equipe — o que é marcado na extensão aparece aqui."
        acao={<Botao onClick={() => novo(proximaHoraCheia())}>Novo compromisso</Botao>}
      />

      {erro && <div className="mb-4 rounded-controle bg-alerta-fundo px-4 py-3 text-alerta">{erro}</div>}

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <button onClick={() => setFoco(new Date())} className="rounded-controle border border-borda bg-white px-3 py-1.5 text-[13px] font-medium hover:border-marca">
          Hoje
        </button>
        <button onClick={() => andar(-1)} aria-label="Anterior" className="h-8 w-8 rounded-controle border border-borda bg-white text-tinta-3 hover:border-marca">‹</button>
        <button onClick={() => andar(1)} aria-label="Próximo" className="h-8 w-8 rounded-controle border border-borda bg-white text-tinta-3 hover:border-marca">›</button>
        <span className="text-[15px] font-extrabold first-letter:uppercase">{rotuloDoPeriodo(visao, foco)}</span>
        <span className="ml-auto flex overflow-hidden rounded-controle border border-borda bg-white">
          <button
            onClick={() => setSoMinha(true)}
            title="Só o que eu marquei ou respondo"
            className={`px-3 py-1.5 text-[13px] font-medium transition ${soMinha ? 'bg-marca text-white' : 'text-tinta-3 hover:bg-fundo'}`}
          >
            Minha
          </button>
          <button
            onClick={() => setSoMinha(false)}
            title={perfil && ehAdmin(perfil) ? 'Toda a clínica' : 'Também os colegas da minha equipe'}
            className={`px-3 py-1.5 text-[13px] font-medium transition ${!soMinha ? 'bg-marca text-white' : 'text-tinta-3 hover:bg-fundo'}`}
          >
            {perfil && ehAdmin(perfil) ? 'Clínica' : 'Equipe'}
            {deOutros > 0 && <span className="ml-1 opacity-70">{deOutros}</span>}
          </button>
        </span>

        <span className="flex overflow-hidden rounded-controle border border-borda bg-white">
          {(['dia', 'semana', 'mes'] as Visao[]).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              className={`px-3 py-1.5 text-[13px] font-medium transition ${visao === v ? 'bg-marca text-white' : 'text-tinta-3 hover:bg-fundo'}`}
            >
              {v === 'mes' ? 'Mês' : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </span>
      </div>

      {/* Etiqueta, atrasadas e busca no texto da atividade. */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar na atividade…"
          className="h-9 w-[240px] rounded-controle border border-borda bg-white px-3 text-[13px] outline-none focus:border-marca"
        />
        <Pilula ativa={etiqueta === null} onClick={() => setEtiqueta(null)}>Todas</Pilula>
        {marca.etiquetasAgenda.map((e) => (
          <Pilula key={e.nome} cor={e.cor} ativa={etiqueta === e.nome} onClick={() => setEtiqueta(etiqueta === e.nome ? null : e.nome)}>
            {e.nome}
          </Pilula>
        ))}
        <button
          onClick={() => setSoAtrasadas((v) => !v)}
          title="Atividades pendentes cujo horário já passou"
          className={`rounded-controle border px-3 py-1.5 text-[13px] font-medium transition ${soAtrasadas ? 'border-perigo bg-perigo text-white' : 'border-borda bg-white text-tinta-3 hover:border-perigo hover:text-perigo'}`}
        >
          Atrasadas{atrasadas > 0 && <span className="ml-1.5 opacity-80">{atrasadas}</span>}
        </button>
        <span className="ml-auto text-[13px] text-tinta-4">{itens.length} no período</span>
      </div>

      <Cartao className="overflow-x-auto">
        {carregando ? (
          <div className="px-5 py-10 text-tinta-4">Carregando…</div>
        ) : visao === 'mes' ? (
          <GradeMes foco={foco} itens={itens} cor={cor} onDia={(d) => { setFoco(d); setVisao('dia'); }} onAbrir={setEditando} />
        ) : (
          <GradeHoras
            dias={visao === 'dia' ? [inicioDoDia(foco)] : diasDaSemana(foco)}
            itens={itens}
            cor={cor}
            onVago={novo}
            onAbrir={setEditando}
          />
        )}
      </Cartao>

      {editando && (
        <Editor
          valor={editando}
          usuarios={usuarios}
          contatos={contatos}
          etiquetas={marca.etiquetasAgenda}
          podeMexer={podeMexer(editando)}
          autor={nomeDe(editando.criado_por ?? null)}
          perfil={perfil}
          onFechar={() => setEditando(null)}
          onErro={setErro}
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

function GradeHoras({
  dias, itens, cor, onVago, onAbrir,
}: {
  dias: Date[];
  itens: Agendamento[];
  cor: (a: Agendamento) => string;
  onVago: (d: Date) => void;
  onAbrir: (a: Agendamento) => void;
}) {
  const horas = Array.from({ length: HORA_FIM - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);
  return (
    <div className="min-w-[720px]">
      <div className="flex border-b border-borda bg-fundo">
        <span className="w-14 flex-none" />
        {dias.map((d) => (
          <span key={+d} className="flex min-w-0 flex-1 flex-col items-center py-2">
            <span className="text-[11px] uppercase text-tinta-4">{DIAS_CURTOS[d.getDay()]}</span>
            <span className={`grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[15px] font-extrabold ${ehHoje(d) ? 'bg-marca text-white' : ''}`}>
              {d.getDate()}
            </span>
          </span>
        ))}
      </div>
      <div className="flex">
        <div className="w-14 flex-none">
          {horas.map((h) => (
            <div key={h} className="relative text-right" style={{ height: ALTURA_HORA }}>
              <span className="absolute -top-2 right-2 text-[11px] text-tinta-4">{String(h).padStart(2, '0')}h</span>
            </div>
          ))}
        </div>
        {dias.map((d) => {
          const doDia = itens.filter((a) => mesmoDia(new Date(a.inicio), d));
          return (
            <div key={+d} className="relative min-w-0 flex-1 border-l border-linha">
              {horas.map((h) => (
                <button
                  key={h}
                  title="Marcar neste horário"
                  onClick={() => {
                    const q = new Date(d);
                    q.setHours(h, 0, 0, 0);
                    onVago(q);
                  }}
                  className="block w-full border-b border-linha transition hover:bg-fundo"
                  style={{ height: ALTURA_HORA }}
                />
              ))}
              {doDia.map((a) => {
                const ini = new Date(a.inicio);
                const minutos = (ini.getHours() - HORA_INICIO) * 60 + ini.getMinutes();
                const dur = Math.max(20, (fimEfetivo(a.inicio, a.fim).getTime() - ini.getTime()) / 60000);
                const altura = (dur / 60) * ALTURA_HORA;
                return (
                  <button
                    key={a.id}
                    onClick={() => onAbrir(a)}
                    title={`${hhmm(a.inicio)} · ${a.titulo}`}
                    className="absolute left-1 right-1 overflow-hidden rounded-controle px-2 py-0.5 text-left text-white transition hover:opacity-90"
                    style={{
                      top: Math.max(0, (minutos / 60) * ALTURA_HORA),
                      height: altura,
                      background: cor(a),
                      opacity: a.status === 'concluido' ? 0.7 : 1,
                      textDecoration: a.status === 'cancelado' ? 'line-through' : undefined,
                    }}
                  >
                    {altura < 36 ? (
                      <span className="block truncate text-[11px] leading-[1.4]">
                        <strong>{hhmm(a.inicio)}</strong> {a.titulo}
                      </span>
                    ) : (
                      <>
                        <span className="block truncate text-[11px] font-bold leading-tight">{hhmm(a.inicio)}</span>
                        <span className="block truncate text-[12px] leading-tight">{a.titulo}</span>
                        {a.contato_nome && altura > 58 && (
                          <span className="block truncate text-[11px] opacity-80">{a.contato_nome}</span>
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

function GradeMes({
  foco, itens, cor, onDia, onAbrir,
}: {
  foco: Date;
  itens: Agendamento[];
  cor: (a: Agendamento) => string;
  onDia: (d: Date) => void;
  onAbrir: (a: Agendamento) => void;
}) {
  return (
    <div className="min-w-[720px] p-3">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {DIAS_CURTOS.map((d) => (
          <span key={d} className="text-center text-[11px] uppercase text-tinta-4">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {diasDoMes(foco).map((d) => {
          const doDia = itens.filter((a) => mesmoDia(new Date(a.inicio), d));
          const doMes = d.getMonth() === foco.getMonth();
          return (
            <div key={+d} className={`min-h-[92px] rounded-controle border border-borda p-1.5 ${doMes ? 'bg-white' : 'bg-fundo opacity-60'}`}>
              <button
                onClick={() => onDia(d)}
                title="Ver este dia"
                className={`mb-1 grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12.5px] font-bold ${ehHoje(d) ? 'bg-marca text-white' : 'text-tinta-2 hover:bg-fundo'}`}
              >
                {d.getDate()}
              </button>
              <div className="flex flex-col gap-1">
                {doDia.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onAbrir(a)}
                    title={`${hhmm(a.inicio)} · ${a.titulo}`}
                    className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                    style={{ background: cor(a), opacity: a.status === 'concluido' ? 0.65 : 1 }}
                  >
                    {hhmm(a.inicio)} {a.titulo}
                  </button>
                ))}
                {doDia.length > 3 && (
                  <button onClick={() => onDia(d)} className="px-1 text-left text-[11px] text-tinta-4 hover:text-marca">
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

function Editor({
  valor, usuarios, contatos, etiquetas, podeMexer, autor, perfil, onFechar, onSalvo, onErro,
}: {
  valor: Partial<Agendamento>;
  usuarios: Usuario[];
  contatos: ContatoLeve[];
  etiquetas: { nome: string; cor: string }[];
  podeMexer: boolean;
  autor: string | null;
  perfil: Perfil | null;
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const [titulo, setTitulo] = useState(valor.titulo ?? '');
  const [descricao, setDescricao] = useState(valor.descricao ?? '');
  const [inicio, setInicio] = useState(paraCampoLocal(new Date(valor.inicio ?? Date.now())));
  const [duracao, setDuracao] = useState(
    valor.inicio && valor.fim
      ? Math.round((new Date(valor.fim).getTime() - new Date(valor.inicio).getTime()) / 60000)
      : MINUTOS_PADRAO,
  );
  const [responsavel, setResponsavel] = useState(valor.responsavel_id ?? perfil?.id ?? '');
  const [etiqueta, setEtiqueta] = useState<string | null>(valor.etiqueta ?? null);
  const [jid, setJid] = useState<string | null>(valor.remote_jid ?? null);
  const [nomeContato, setNomeContato] = useState<string | null>(valor.contato_nome ?? null);
  const [buscaContato, setBuscaContato] = useState('');

  const rotuloContato = (c: ContatoLeve) =>
    c.nome?.trim() || c.nome_whatsapp?.trim() || (c.telefone ? formatarTelefone(c.telefone) : null) || c.remote_jid.split('@')[0];
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termo = semAcento(buscaContato.trim());
  const sugestoes = termo
    ? contatos.filter((c) => semAcento(rotuloContato(c)).includes(termo) || (c.telefone ?? '').includes(termo)).slice(0, 6)
    : [];
  const [salvando, setSalvando] = useState(false);
  const existente = !!valor.id;

  async function salvar() {
    if (!titulo.trim() || !perfil || salvando) return;
    setSalvando(true);
    onErro(null);
    const ini = new Date(inicio);
    const linha = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      inicio: ini.toISOString(),
      fim: new Date(ini.getTime() + duracao * 60000).toISOString(),
      status: valor.status ?? 'pendente',
      etiqueta,
      responsavel_id: responsavel || null,
      remote_jid: jid,
      contato_nome: nomeContato,
    };
    const { error } = existente
      ? await supabase.from('agendamentos').update(linha).eq('id', valor.id!)
      : await supabase.from('agendamentos').insert({
          ...linha,
          empresa_id: perfil.empresa.id,
          criado_por: perfil.id,
        });
    setSalvando(false);
    if (error) return onErro(error.message);
    onSalvo();
  }

  async function mudarStatus(status: Agendamento['status']) {
    const { error } = await supabase.from('agendamentos').update({ status }).eq('id', valor.id!);
    if (error) return onErro(error.message);
    onSalvo();
  }

  async function apagar() {
    if (!confirm('Apagar este compromisso da agenda?')) return;
    const { error } = await supabase.from('agendamentos')
      .update({ deleted_at: new Date().toISOString() }).eq('id', valor.id!);
    if (error) return onErro(error.message);
    onSalvo();
  }

  return (
    <Modal titulo={existente ? 'Compromisso' : 'Novo compromisso'} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        {/* Contato vinculado: mostra o escolhido, ou deixa procurar um. */}
        {jid ? (
          <div className="flex items-center gap-2 rounded-controle border border-borda bg-fundo px-3.5 py-2.5 text-[13px]">
            <span className="min-w-0 flex-1 truncate">
              <span className="text-tinta-3">Contato: </span>
              <span className="font-medium text-tinta">{nomeContato ?? jid.split('@')[0]}</span>
            </span>
            {podeMexer && (
              <button
                onClick={() => { setJid(null); setNomeContato(null); }}
                title="Desvincular o contato"
                className="flex-none text-tinta-4 hover:text-perigo"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          podeMexer && (
            <label className="flex flex-col gap-1.5 font-medium">
              Contato (opcional)
              <input
                value={buscaContato}
                onChange={(e) => setBuscaContato(e.target.value)}
                placeholder="Procure pelo nome ou telefone…"
                className="campo focus:campo-foco font-normal"
              />
              {sugestoes.length > 0 && (
                <ul className="max-h-40 overflow-y-auto rounded-controle border border-borda">
                  {sugestoes.map((c) => (
                    <li key={c.remote_jid}>
                      <button
                        onClick={() => { setJid(c.remote_jid); setNomeContato(rotuloContato(c)); setBuscaContato(''); }}
                        className="flex w-full items-center gap-2 px-3.5 py-2 text-left font-normal transition hover:bg-fundo"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px]">{rotuloContato(c)}</span>
                        {c.telefone && <span className="flex-none text-[12px] text-tinta-4">{formatarTelefone(c.telefone)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {termo && sugestoes.length === 0 && (
                <span className="text-[12.5px] font-normal text-tinta-4">
                  Nenhum contato com esse nome. O compromisso pode ficar sem contato.
                </span>
              )}
            </label>
          )
        )}

        <div className="flex flex-col gap-1.5 font-medium">
          Etiqueta
          <div className="flex flex-wrap gap-1.5">
            {etiquetas.map((e) => (
              <button
                key={e.nome}
                disabled={!podeMexer}
                onClick={() => setEtiqueta(etiqueta === e.nome ? null : e.nome)}
                className="rounded-chip border px-3 py-1 text-[12.5px] font-medium transition disabled:opacity-50"
                style={{
                  borderColor: e.cor,
                  color: etiqueta === e.nome ? '#fff' : e.cor,
                  background: etiqueta === e.nome ? e.cor : 'transparent',
                }}
              >
                {e.nome}
              </button>
            ))}
            {etiqueta && !etiquetas.some((e) => e.nome === etiqueta) && (
              <button
                disabled={!podeMexer}
                onClick={() => setEtiqueta(null)}
                className="rounded-chip border border-borda px-3 py-1 text-[12.5px] font-medium text-tinta-3"
              >
                {etiqueta} ✕
              </button>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 font-medium">
          Atividade
          <input
            autoFocus
            disabled={!podeMexer}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Retornar para a Dra. Ana"
            className="campo focus:campo-foco font-normal"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Quando
            <input type="datetime-local" disabled={!podeMexer} value={inicio} onChange={(e) => setInicio(e.target.value)} className="campo focus:campo-foco font-normal" />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Duração
            <select disabled={!podeMexer} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} className="campo focus:campo-foco font-normal">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 font-medium">
          Responsável
          <select disabled={!podeMexer} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="campo focus:campo-foco font-normal">
            <option value="">Ninguém em especial</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Observação
          <textarea disabled={!podeMexer} value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="campo focus:campo-foco resize-none font-normal" />
        </label>

        {!podeMexer && (
          <p className="rounded-controle bg-fundo px-3.5 py-3 text-[13px] text-tinta-3">
            Marcado por {autor ?? 'outra pessoa'}. Só quem criou, o responsável ou o administrador
            podem alterar.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {existente && podeMexer && (
            <>
              <button onClick={apagar} className="mr-auto text-[13px] font-medium text-perigo hover:underline">
                Apagar
              </button>
              {valor.status !== 'concluido' && (
                <Botao variante="secundario" onClick={() => mudarStatus('concluido')}>Marcar como feito</Botao>
              )}
            </>
          )}
          <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>
          {podeMexer && (
            <Botao onClick={salvar} desabilitado={!titulo.trim() || salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Pílula de etiqueta usada nos filtros da agenda. */
function Pilula({
  children, ativa, cor, onClick,
}: {
  children: React.ReactNode;
  ativa: boolean;
  cor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-controle border px-3 py-1.5 text-[13px] font-medium transition ${
        cor ? '' : ativa ? 'border-marca bg-marca text-white' : 'border-borda bg-white text-tinta-3 hover:border-marca'
      }`}
      style={cor ? { borderColor: cor, color: ativa ? '#fff' : cor, background: ativa ? cor : '#fff' } : undefined}
    >
      {children}
    </button>
  );
}
