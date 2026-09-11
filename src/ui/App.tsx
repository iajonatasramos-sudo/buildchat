// Shell da extensão dentro do WhatsApp Web: FAB, gaveta lateral com o painel
// do Saleschat, picker "/" e configurações (webhook / caractere de atalho).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookUser, Bot, Loader2, Smartphone, User, Webhook, X, Zap } from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import * as db from '@/lib/db';
import { iniciarMotor } from '@/lib/automacoes/motor';
import type { Perfil } from '@/lib/auth';
import { servidorConfigurado } from '@/lib/config';
import { MARCA, temRecurso } from '@/lib/marca';
import { meusRecursos, type ChaveRecurso } from '@/lib/acessos';
import { urlDoPainel } from '@/lib/auth';
import { DOM, executarResposta, getContatoAtivo, observarConversa } from '@/lib/wa';
import { inserirTextoNoCompose, reconciliarTagsContatos } from '@/lib/wa';
import type { ContatoAtivo, RespostaDC, Settings } from '@/lib/types';
import { MensagensRapidasPanel } from './MensagensRapidas';
import { QuickPicker } from './QuickPicker';
import { PastaPanel } from './PastaPanel';
import { ALTURA_TOPBAR, IndicadoresEstado } from './TopBar';
import { HeaderMenuOverlay } from './HeaderMenus';
import { AnotacoesModal } from './Anotacoes';
import { ContaModal } from './Conta';
import { PropostaModal } from './Proposta';
import { PastasModal } from './Pastas';
import { AgendaModal } from './Agenda';
import { WebhookModal } from './Webhook';
import { modalAgenda, modalWebhook, progressoExecucao, type ProgressoExecucao, gavetaAberta, menuHeader, modalAnotacoes, modalConfiguracoes, modalConta, modalPastas, modalProposta, perfilAtual, pastasAtivas, type MenuHeader, abaGaveta, pedirContaWhatsapp, LARGURA_TRILHO } from '@/lib/store';
import { carregarPerfil, observarSessao, trocarSenha } from '@/lib/auth';
import { agendar, iniciarSyncPeriodico, nomesDasMinhasEquipes, sincronizar } from '@/lib/sync';
import { toast, Toaster } from './toast';

export function App() {
  const [pronto, setPronto] = useState(false);
  // O estado da gaveta vive no store — o botão ⚡ (inserido no compose pelo
  // content script) e o painel compartilham o mesmo sinal.
  const [aberto, setAbertoLocal] = useState(gavetaAberta.get());
  useEffect(() => gavetaAberta.subscribe(setAbertoLocal), []);
  const [contato, setContato] = useState<ContatoAtivo | null>(null);
  // Regra do CRM: toda conversa aberta com conta logada vira contato no servidor
  // (nome do WhatsApp e telefone). Não cria nada para grupos nem sem jid confiável.
  const definirContato = (c: ContatoAtivo | null) => {
    setContato(c);
    if (c && !c.ehGrupo && c.chatId.includes('@')) db.registrarContato(c.chatId, c.nome, c.telefone).catch(() => {});
  };
  const [settings, setSettings] = useState<Settings>({ webhookUrl: '', triggerChar: '/', tema: 'auto' });
  // A engrenagem da barra do topo abre as configurações (sinal no store).
  const [dlgSettings, setDlgSettingsLocal] = useState(modalConfiguracoes.get());
  useEffect(() => modalConfiguracoes.subscribe(setDlgSettingsLocal), []);
  const setDlgSettings = (v: boolean) => modalConfiguracoes.set(v);
  const [enviando, setEnviando] = useState(false);
  const [pastas, setPastas] = useState<string[]>(pastasAtivas.get());
  const [menu, setMenu] = useState<MenuHeader>(menuHeader.get());

  const [anotacoes, setAnotacoes] = useState(modalAnotacoes.get());
  const [conta, setConta] = useState(modalConta.get());
  const [proposta, setProposta] = useState(modalProposta.get());
  const [pastasModal, setPastasModal] = useState(modalPastas.get());
  const [agenda, setAgenda] = useState(modalAgenda.get());
  const [webhook, setWebhook] = useState(modalWebhook.get());

  useEffect(() => pastasAtivas.subscribe(setPastas), []);
  useEffect(() => menuHeader.subscribe(setMenu), []);
  useEffect(() => modalAnotacoes.subscribe(setAnotacoes), []);
  useEffect(() => modalConta.subscribe(setConta), []);
  useEffect(() => modalProposta.subscribe(setProposta), []);
  useEffect(() => modalPastas.subscribe(setPastasModal), []);
  useEffect(() => modalAgenda.subscribe(setAgenda), []);
  useEffect(() => modalWebhook.subscribe(setWebhook), []);

  // Sessão: carrega o perfil ao abrir e acompanha login/logout/refresh.
  useEffect(() => {
    carregarPerfil().then((p) => {
      perfilAtual.set(p);
      if (p) sincronizar();
    });
    return observarSessao(async (sessao) => {
      const p = sessao ? await carregarPerfil() : null;
      perfilAtual.set(p);
      if (p) sincronizar();
    });
  }, []);

  // Ciclo periódico enquanto o WhatsApp Web estiver aberto.
  useEffect(() => iniciarSyncPeriodico(), []);
  // Motor das automações (fila durável): processa o que venceu enquanto a aba vive.
  useEffect(() => {
    iniciarMotor();
  }, []);

  // Login obrigatório: sem conta, os recursos da extensão ficam fechados e
  // qualquer tentativa de usá-los abre o login. O WhatsApp em si segue livre.
  const [perfil, setPerfilLocal] = useState<Perfil | null>(perfilAtual.get());
  useEffect(() => perfilAtual.subscribe(setPerfilLocal), []);
  const [perfilResolvido, setPerfilResolvido] = useState(false);
  useEffect(() => {
    carregarPerfil().then(() => setPerfilResolvido(true));
  }, []);
  useEffect(() => {
    if (!servidorConfigurado() || !perfilResolvido || perfil) return;
    if (aberto) gavetaAberta.set(false);
    if (menu !== null) menuHeader.set(null);
    if (anotacoes) modalAnotacoes.set(false);
    if (proposta) modalProposta.set(false);
    if (pastasModal) modalPastas.set(false);
    if (agenda) modalAgenda.set(false);
    if (webhook) modalWebhook.set(false);
    if (dlgSettings) modalConfiguracoes.set(false);
    if (pastas.length) pastasAtivas.set([]);
    modalConta.set(true);
  }, [perfil, perfilResolvido, aberto, menu, anotacoes, proposta, pastasModal, dlgSettings, pastas, agenda, webhook]);
  const logado = !servidorConfigurado() || !!perfil;
  // O picker "/" lê isto de dentro de um listener antigo — ref, não estado.
  const logadoRef = useRef(logado);
  logadoRef.current = logado;

  // Migra vínculos antigos de pastas (chaves "wa:") para os ids reais assim
  // que o WPP conecta — os contadores e o filtro passam a bater.
  useEffect(() => {
    const i = window.setInterval(async () => {
      const r = await reconciliarTagsContatos();
      if (r !== null) window.clearInterval(i);
    }, 4000);
    return () => window.clearInterval(i);
  }, []);
  // Trocou de conversa? Fecha o menu do cabeçalho.
  useEffect(() => {
    menuHeader.set(null);
  }, [contato?.chatId]);

  // Abrir a gaveta pede uma sincronização: o que o admin mudou no painel
  // (visibilidade de pasta ou mensagem) aparece sem esperar o ciclo de 5 min.
  useEffect(() => {
    if (aberto) agendar(300);
  }, [aberto]);

  // Com a gaveta aberta, o corpo do WhatsApp encolhe (classe no <html> ativa a
  // regra injetada no <head>) — o painel ocupa a faixa liberada, sem sobrepor.
  useEffect(() => {
    document.documentElement.classList.toggle('bc-gaveta', aberto);
    return () => document.documentElement.classList.remove('bc-gaveta');
  }, [aberto]);

  // picker "/"
  const [respostas, setRespostas] = useState<RespostaDC[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(0);
  const [posPicker, setPosPicker] = useState({ left: 0, bottom: 0, width: 420 });
  const pickerAbertoRef = useRef(false);

  useEffect(() => {
    (async () => {
      await db.autoSeed();
      await db.autoSeedVinculos();
      setSettings(await db.getSettings());
      const d = await db.carregarMensagensRapidas();
      setRespostas(d.respostas);
      setPronto(true);
      definirContato(await getContatoAtivo());
    })();
    const parar = observarConversa(setContato);
    const recarregar = (changes: Record<string, unknown>) => {
      if ('bc2_respostas' in changes) db.carregarMensagensRapidas().then((d) => setRespostas(d.respostas));
    };
    chrome.storage.onChanged.addListener(recarregar as any);
    return () => {
      parar();
      chrome.storage.onChanged.removeListener(recarregar as any);
    };
  }, []);

  const filtradas = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return respostas
      .filter((r) => !q || r.atalho.toLowerCase().includes(q) || r.titulo.toLowerCase().includes(q))
      .slice(0, 30);
  }, [respostas, query]);
  pickerAbertoRef.current = query !== null;

  const executar = useCallback(
    async (r: RespostaDC) => {
      if (enviando) return;
      setEnviando(true);
      // Faixa "Executando atividade 2/3" no topo da conversa enquanto a sequência roda.
      const res = await executarResposta(r, (p) => progressoExecucao.set({ titulo: r.titulo, ...p }));
      progressoExecucao.set(null);
      setEnviando(false);
      if (res.ok) toast.success(`"${r.titulo}" enviada.`);
      else toast.error(res.erro);
    },
    [enviando],
  );

  // ── Gatilho "/" no compose ──────────────────────────────────────────────
  useEffect(() => {
    function posicionar() {
      const box = DOM.getComposeBox();
      if (!box) return;
      const r = box.getBoundingClientRect();
      // getBoundingClientRect devolve px reais; converte p/ o espaço ampliado.
      setPosPicker({
        left: emPx(r.left),
        bottom: emPx(window.innerHeight - r.top + 8),
        width: emPx(r.width),
      });
    }

    function onInput(e: Event) {
      const box = DOM.getComposeBox();
      if (!box || !(e.target instanceof Node) || !(e.target === box || box.contains(e.target))) return;
      const texto = (box.textContent ?? '').trim();
      // Sem login, o picker não abre (nada da extensão funciona deslogado).
      if (!logadoRef.current) {
        setQuery(null);
        return;
      }
      if (texto.startsWith(settings.triggerChar)) {
        setQuery(texto.slice(settings.triggerChar.length).trim());
        setAtivo(0);
        posicionar();
      } else {
        setQuery(null);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!pickerAbertoRef.current) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setAtivo((i) => {
          const n = filtradas.length || 1;
          return (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        });
      } else if (e.key === 'Enter') {
        if (filtradas.length) {
          e.preventDefault();
          e.stopPropagation();
          const r = filtradas[Math.min(ativo, filtradas.length - 1)];
          setQuery(null);
          DOM.limparCompose();
          executar(r);
        }
      } else if (e.key === 'Tab') {
        if (filtradas.length) {
          e.preventDefault();
          e.stopPropagation();
          const r = filtradas[Math.min(ativo, filtradas.length - 1)];
          setQuery(null);
          void inserirTextoNoCompose(r, contato);
        }
      } else if (e.key === 'Escape') {
        setQuery(null);
      }
    }

    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', posicionar);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', posicionar);
    };
  }, [settings.triggerChar, filtradas, ativo, contato, executar]);

  if (!pronto) return null;

  return (
    <>
      {/* A barra só aparece com a gaveta fechada; aberta, a gaveta toma o lugar dela.
          Sem login não há barra: o ⚡ do compose e a barra do topo levam ao login. */}
      {logado && !aberto && <TrilhoLateral />}

      {/* Gaveta lateral (o ⚡ do compose também a abre) */}
      {aberto && (
        <div
          className="bc-anim-slide pointer-events-auto fixed bottom-0 right-0 z-[55] flex w-[282px] flex-col gap-2 bg-transparent p-2"
          style={{ top: emPx(ALTURA_TOPBAR) }}
        >
          <div className="min-h-0 flex-1">
            <MensagensRapidasPanel
              contato={contato}
              onExecutar={executar}
              onFechar={() => gavetaAberta.set(false)}
            />
          </div>
          {/* Rodapé: com a gaveta aberta a barra lateral some, então o estado
              do WPP e da nuvem aparece aqui. */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-1.5 shadow-sm">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Zap size={12} className="text-brand" /> {MARCA.nome}
              {enviando && <Loader2 size={11} className="animate-spin" />}
            </span>
            <IndicadoresEstado />
          </div>
        </div>
      )}

      {/* Andamento da mensagem rápida (faixa sobre a conversa) */}
      <BannerExecucao />

      {/* Filtro de conversas por pasta(s) — com várias, só quem está em todas */}
      {logado && pastas.length > 0 && <PastaPanel tagIds={pastas} />}

      {/* Minhas pastas: criar/apagar na própria extensão */}
      {pastasModal && <PastasModal />}

      {/* Agenda: calendário da clínica (dia / semana / mês) */}
      {agenda && <AgendaModal />}

      {/* WebHooks: manda os dados do contato para outro sistema */}
      {webhook && <WebhookModal />}

      {/* Menus da barra do cabeçalho (pastas / filtros / apagadas) */}
      {menu && <HeaderMenuOverlay menu={menu} contato={contato} />}

      {/* Anotações da conversa */}
      {anotacoes && <AnotacoesModal contato={contato} />}

      {/* Entrar / criar conta */}
      {conta && <ContaModal />}

      {/* Gerar proposta (PDF vem da API do BuildClinic) — só na marca que tem o recurso */}
      {proposta && temRecurso('propostas') && <PropostaModal contato={contato} />}

      {/* Picker "/" */}
      {query !== null && (
        <QuickPicker itens={filtradas} ativo={ativo} pos={posPicker} onHover={setAtivo} onEscolher={(r) => {
          setQuery(null);
          DOM.limparCompose();
          executar(r);
        }} />
      )}

      {dlgSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setDlgSettings(false)}
          onSalvo={(s) => {
            setSettings(s);
            setDlgSettings(false);
            toast.success('Configurações salvas.');
          }}
        />
      )}

      <Toaster />
    </>
  );
}

function SettingsModal({
  settings,
  onClose,
  onSalvo,
}: {
  settings: Settings;
  onClose: () => void;
  onSalvo: (s: Settings) => void;
}) {
  const [triggerChar, setTriggerChar] = useState(settings.triggerChar);
  const [temaSel, setTemaSel] = useState(settings.tema ?? 'auto');

  async function salvar() {
    const s: Settings = {
      // O webhook saiu daqui: quem integra usa a guia Automações → Webhook.
      webhookUrl: settings.webhookUrl,
      triggerChar: triggerChar.trim() || '/',
      tema: temaSel,
    };
    await db.saveSettings(s);
    onSalvo(s);
  }

  const [exportando, setExportando] = useState(false);
  async function exportarBackup() {
    setExportando(true);
    try {
      const dados = await db.exportarBackup();
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buildchat-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success('Backup exportado.');
    } catch (e) {
      toast.error('Não consegui exportar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  const TEMAS: { valor: Settings['tema']; rotulo: string }[] = [
    { valor: 'auto', rotulo: 'Automático' },
    { valor: 'claro', rotulo: 'Claro' },
    { valor: 'gray', rotulo: 'Gray' },
    { valor: 'escuro', rotulo: 'Escuro' },
  ];

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-text/40 p-4" onClick={onClose}>
      <div
        className="bc-anim-pop flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[14px] font-bold">Configurações</h3>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <MinhaConta />
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Tema</span>
            <div className="flex flex-wrap gap-1.5">
              {TEMAS.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  onClick={() => setTemaSel(t.valor)}
                  className={cn(
                    'rounded-md border px-3 py-1 text-[12px] font-semibold transition',
                    temaSel === t.valor
                      ? 'border-brand bg-brand text-white'
                      : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
                  )}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-[10px] text-muted">
              Automático segue o tema do WhatsApp; Gray é o grafite.
            </span>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Atalho das mensagens rápidas
            </span>
            <input
              value={triggerChar}
              onChange={(e) => setTriggerChar(e.target.value.slice(0, 1))}
              className="h-9 w-16 rounded-md border border-border-strong bg-surface px-2.5 text-center text-[13px] outline-none focus:border-brand"
            />
            <span className="mt-1 block text-[10px] leading-relaxed text-muted">
              Digite este caractere no início da caixa de mensagem do WhatsApp para abrir a lista de
              mensagens rápidas: filtra enquanto você escreve, <b>Enter</b> envia e <b>Tab</b> só insere
              o texto. Troque se o “/” atrapalhar sua digitação.
            </span>
          </label>
          <div className="mt-1 rounded-md border border-border bg-surface-2 p-2.5">
          <div className="mb-1 text-[12px] font-bold">Backup</div>
          <p className="mb-2 text-[11px] leading-snug text-muted">
            Pastas, mensagens rápidas (com a mídia), anotações, fichas e propostas num arquivo JSON.
            Conversas e arquivos recebidos não entram — nunca saem do computador.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportarBackup}
              disabled={exportando}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] font-semibold transition hover:border-brand hover:text-brand disabled:opacity-60"
            >
              {exportando ? 'Exportando…' : 'Exportar backup (JSON)'}
            </button>
            <button
              type="button"
              title="Coloca na fila de novo todas as anotações, fichas e etiquetas deste computador (não duplica)"
              onClick={async () => {
                const { reenviarTudoLocal } = await import('@/lib/sync');
                const n = await reenviarTudoLocal();
                toast.success(`${n} item(ns) na fila para o servidor.`);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] font-semibold transition hover:border-brand hover:text-brand"
            >
              Reenviar dados locais
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text-2 hover:bg-surface-2">
              Cancelar
            </button>
            <button type="button" onClick={salvar} className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Minha conta: equipes de que faço parte e troca de senha (pede a atual). */
function MinhaConta() {
  const [perfil, setPerfil] = useState<Perfil | null>(perfilAtual.get());
  useEffect(() => perfilAtual.subscribe(setPerfil), []);
  const [equipes, setEquipes] = useState<string[]>([]);
  const [abrirSenha, setAbrirSenha] = useState(false);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    nomesDasMinhasEquipes().then(setEquipes);
  }, [perfil?.id]);

  if (!perfil) return null;

  async function trocar() {
    if (nova !== repetida) {
      toast.error('A confirmação não confere com a nova senha.');
      return;
    }
    setSalvando(true);
    const r = await trocarSenha(atual, nova);
    setSalvando(false);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    setAtual('');
    setNova('');
    setRepetida('');
    setAbrirSenha(false);
    toast.success('Senha alterada.');
  }

  const campo = 'h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-brand';

  return (
    <div className="rounded-md border border-border bg-surface-2 p-2.5">
      <div className="mb-1 text-[12px] font-bold">Minha conta</div>
      <div className="text-[11.5px] text-text-2">
        {perfil.nome} · <span className="text-muted">{perfil.email}</span>
      </div>
      <div className="mt-1.5 text-[11px] text-muted">
        {perfil.papel === 'admin' ? 'Administrador' : 'Usuário'} em {perfil.empresa.nome}
      </div>
      {/* Equipes: quem define é o admin, no painel — aqui é só informativo. */}
      <div className="mt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {equipes.length > 1 ? 'Minhas departamentos' : 'Minho departamento'}
        </span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {equipes.length === 0 ? (
            <span className="text-[11.5px] text-muted">
              Você não está em nenhuma equipe. Quem inclui é o administrador da clínica, pelo painel.
            </span>
          ) : (
            equipes.map((nome) => (
              <span key={nome} className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11.5px] font-semibold text-brand">
                {nome}
              </span>
            ))
          )}
        </div>
      </div>

      {!abrirSenha ? (
        <button
          type="button"
          onClick={() => setAbrirSenha(true)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] font-semibold transition hover:border-brand hover:text-brand"
        >
          Alterar senha
        </button>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          <input type="password" autoFocus value={atual} onChange={(e) => setAtual(e.target.value)} placeholder="Senha atual" className={campo} />
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova senha (mínimo 6 caracteres)" className={campo} />
          <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} placeholder="Repita a nova senha" className={campo} onKeyDown={(e) => e.key === 'Enter' && trocar()} />
          <div className="flex justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => { setAbrirSenha(false); setAtual(''); setNova(''); setRepetida(''); }}
              className="rounded-md border border-border-strong px-2.5 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={trocar}
              disabled={salvando || !atual || nova.length < 6 || !repetida}
              className="rounded-md bg-brand px-3 py-1 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar senha'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Faixa "Executando atividade 1/3" logo abaixo do cabeçalho da conversa ──
function BannerExecucao() {
  const [p, setP] = useState<ProgressoExecucao | null>(progressoExecucao.get());
  useEffect(() => progressoExecucao.subscribe(setP), []);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // Mede o #main (a conversa) enquanto a faixa está visível — o layout muda sem evento.
  useEffect(() => {
    if (!p) return;
    const medir = () => {
      const main = document.querySelector('#main');
      const header = document.querySelector('#main header');
      if (!main) return setPos(null);
      const r = main.getBoundingClientRect();
      const topo = header ? header.getBoundingClientRect().bottom : r.top;
      setPos({ left: emPx(r.left), top: emPx(topo + 8), width: emPx(r.width) });
    };
    medir();
    const i = window.setInterval(medir, 500);
    window.addEventListener('resize', medir);
    return () => {
      window.clearInterval(i);
      window.removeEventListener('resize', medir);
    };
  }, [!!p]);

  if (!p || !pos) return null;
  return (
    <div className="pointer-events-none fixed z-[58] flex justify-center" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      <div className="bc-anim-pop pointer-events-auto flex items-center gap-2.5 rounded-lg border border-brand/40 bg-surface px-3.5 py-2 text-[12.5px] shadow-lg">
        <Loader2 size={14} className="animate-spin text-brand" />
        <span className="font-bold text-text">
          Executando atividade {p.atual}/{p.total}
        </span>
        <span className="text-muted">
          · {p.rotulo}
          <span className="ml-1.5 text-[11px]">({p.titulo})</span>
        </span>
      </div>
    </div>
  );
}

// ── Barra lateral (como no BuildSales): visível com a gaveta fechada, abre-a na guia ──
function TrilhoLateral() {
  const [aba, setAba] = useState(abaGaveta.get());
  useEffect(() => abaGaveta.subscribe(setAba), []);
  // O admin pode limitar funções por pessoa ou equipe (painel → Acessos).
  // Enquanto não sabemos, mostramos tudo — nada pisca fora do lugar.
  const [pode, setPode] = useState<Record<ChaveRecurso, boolean> | null>(null);
  useEffect(() => {
    const carregar = () => meusRecursos().then(setPode);
    carregar();
    const onChange = (m: Record<string, unknown>) => {
      if ('bc2_acessos' in m || 'bc2_minhas_equipes' in m) carregar();
    };
    chrome.storage.onChanged.addListener(onChange as any);
    return () => chrome.storage.onChanged.removeListener(onChange as any);
  }, []);
  const liberado = (c: ChaveRecurso) => !pode || pode[c];

  const ir = (destino: 'cliente' | 'rapidas' | 'automacoes') => {
    abaGaveta.set(destino);
    gavetaAberta.set(true);
  };

  // A última guia usada fica marcada, para a pessoa saber onde vai cair.
  const botao = (ativo: boolean) =>
    cn(
      'grid h-10 w-10 place-items-center rounded-lg border transition',
      ativo
        ? 'border-brand bg-brand text-white shadow-sm'
        : 'border-transparent bg-surface-2 text-muted hover:border-border-strong hover:text-text',
    );

  // Clique em qualquer ponto livre da barra (fora dos botões) abre as
  // mensagens rápidas — mesma regra da barra do topo.
  const cliqueLivre = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    ir('rapidas');
  };

  return (
    <div
      className="pointer-events-auto fixed bottom-0 right-0 z-[56] flex cursor-pointer flex-col items-center gap-2 border-l border-border bg-surface pt-3"
      style={{ top: emPx(ALTURA_TOPBAR), width: emPx(LARGURA_TRILHO) }}
      onClick={cliqueLivre}
      title="Abrir mensagens rápidas"
    >
      {liberado('contato') && (
        <button type="button" title="Contato" className={botao(aba === 'cliente')} onClick={() => ir('cliente')}>
          <User size={17} />
        </button>
      )}
      {liberado('rapidas') && (
        <button type="button" title="Mensagens rápidas" className={botao(aba === 'rapidas')} onClick={() => ir('rapidas')}>
          <Zap size={17} />
        </button>
      )}
      {temRecurso('automacoes') && liberado('automacoes') && (
        <button type="button" title="Automações" className={botao(aba === 'automacoes')} onClick={() => ir('automacoes')}>
          <Bot size={17} />
        </button>
      )}
      {liberado('webhooks') && (
        <button
          type="button"
          title="WebHooks — enviar dados para outro sistema"
          className={botao(false)}
          onClick={() => modalWebhook.set(true)}
        >
          <Webhook size={17} />
        </button>
      )}
      {liberado('conta_whatsapp') && (
      <button
        type="button"
        title="Conta de WhatsApp em uso"
        className={botao(false)}
        onClick={() => {
          gavetaAberta.set(true); // o diálogo mora no painel
          pedirContaWhatsapp.set(pedirContaWhatsapp.get() + 1);
        }}
      >
        <Smartphone size={17} />
      </button>
      )}
      <span className="my-1 h-px w-6 bg-border" />
      {/* Meus contatos no painel web, já logado com a sessão da extensão. A aba
          nasce ANTES do await (o clique ainda vale como gesto) e recebe o endereço depois. */}
      {liberado('meus_contatos') && (
      <button
        type="button"
        title={`Meus contatos no painel ${MARCA.nome}`}
        className={botao(false)}
        onClick={() => {
          const aba = window.open('', '_blank');
          urlDoPainel('/painel/contatos').then((url) => {
            if (aba) aba.location.href = url;
            else window.open(url, '_blank');
          });
        }}
      >
        <BookUser size={17} />
      </button>
      )}

      {/* Estado do WPP e da nuvem, no pé da barra (saíram da barra do topo). */}
      <div className="mt-auto pb-3">
        <IndicadoresEstado vertical />
      </div>
    </div>
  );
}
