// Shell da extensão dentro do WhatsApp Web: FAB, gaveta lateral com o painel
// do Saleschat, picker "/" e configurações (webhook / caractere de atalho).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookUser, Loader2, Settings as SettingsIcon, Smartphone, User, X, Zap } from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import * as db from '@/lib/db';
import type { Perfil } from '@/lib/auth';
import { servidorConfigurado } from '@/lib/config';
import { urlDoPainel } from '@/lib/auth';
import { DOM, executarResposta, getContatoAtivo, observarConversa } from '@/lib/wa';
import { inserirTextoNoCompose, reconciliarTagsContatos } from '@/lib/wa';
import type { ContatoAtivo, RespostaDC, Settings } from '@/lib/types';
import { MensagensRapidasPanel } from './MensagensRapidas';
import { QuickPicker } from './QuickPicker';
import { PastaPanel } from './PastaPanel';
import { ALTURA_TOPBAR } from './TopBar';
import { HeaderMenuOverlay } from './HeaderMenus';
import { AnotacoesModal } from './Anotacoes';
import { ContaModal } from './Conta';
import { PropostaModal } from './Proposta';
import { gavetaAberta, menuHeader, modalAnotacoes, modalConta, modalProposta, perfilAtual, pastaAtiva, type MenuHeader, abaGaveta, pedirContaWhatsapp, LARGURA_TRILHO } from '@/lib/store';
import { carregarPerfil, observarSessao } from '@/lib/auth';
import { iniciarSyncPeriodico, sincronizar } from '@/lib/sync';
import { toast, Toaster } from './toast';

export function App() {
  const [pronto, setPronto] = useState(false);
  // O estado da gaveta vive no store — o botão ⚡ (inserido no compose pelo
  // content script) e o painel compartilham o mesmo sinal.
  const [aberto, setAbertoLocal] = useState(gavetaAberta.get());
  useEffect(() => gavetaAberta.subscribe(setAbertoLocal), []);
  const [contato, setContato] = useState<ContatoAtivo | null>(null);
  const [settings, setSettings] = useState<Settings>({ webhookUrl: '', triggerChar: '/', tema: 'auto' });
  const [dlgSettings, setDlgSettings] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pasta, setPasta] = useState<string | null>(pastaAtiva.get());
  const [menu, setMenu] = useState<MenuHeader>(menuHeader.get());

  const [anotacoes, setAnotacoes] = useState(modalAnotacoes.get());
  const [conta, setConta] = useState(modalConta.get());
  const [proposta, setProposta] = useState(modalProposta.get());

  useEffect(() => pastaAtiva.subscribe(setPasta), []);
  useEffect(() => menuHeader.subscribe(setMenu), []);
  useEffect(() => modalAnotacoes.subscribe(setAnotacoes), []);
  useEffect(() => modalConta.subscribe(setConta), []);
  useEffect(() => modalProposta.subscribe(setProposta), []);

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
    modalConta.set(true);
  }, [perfil, perfilResolvido, aberto, menu, anotacoes, proposta]);
  const logado = !servidorConfigurado() || !!perfil;

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
      setContato(await getContatoAtivo());
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
      const res = await executarResposta(r);
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
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-1.5 shadow-sm">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Zap size={12} className="text-brand" /> BuildChat
              {enviando && <Loader2 size={11} className="animate-spin" />}
            </span>
            <button
              type="button"
              onClick={() => setDlgSettings(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-2 transition hover:bg-surface-2"
            >
              <SettingsIcon size={12} /> Configurações
            </button>
          </div>
        </div>
      )}

      {/* Pasta/filtro de conversas por etiqueta */}
      {pasta && <PastaPanel tagId={pasta} />}

      {/* Menus da barra do cabeçalho (pastas / filtros / apagadas) */}
      {menu && <HeaderMenuOverlay menu={menu} contato={contato} />}

      {/* Anotações da conversa */}
      {anotacoes && <AnotacoesModal contato={contato} />}

      {/* Entrar / criar conta */}
      {conta && <ContaModal />}

      {/* Gerar proposta (PDF vem da API do BuildClinic) */}
      {proposta && <PropostaModal contato={contato} />}

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
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
  const [triggerChar, setTriggerChar] = useState(settings.triggerChar);
  const [temaSel, setTemaSel] = useState(settings.tema ?? 'auto');

  async function salvar() {
    const s: Settings = {
      webhookUrl: webhookUrl.trim(),
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
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
              Webhook (integração com o seu sistema)
            </span>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://seusistema.com/api/webhook"
              className="h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-brand"
            />
            <span className="mt-1 block text-[10px] text-muted">
              Cada envio dispara um POST JSON (evento quick_reply_sent).
            </span>
          </label>
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
          <button
            type="button"
            onClick={exportarBackup}
            disabled={exportando}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] font-semibold transition hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {exportando ? 'Exportando…' : 'Exportar backup (JSON)'}
          </button>
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

// ── Barra lateral (como no BuildSales): visível com a gaveta fechada, abre-a na guia ──
function TrilhoLateral() {
  const [aba, setAba] = useState(abaGaveta.get());
  useEffect(() => abaGaveta.subscribe(setAba), []);

  const ir = (destino: 'cliente' | 'rapidas') => {
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

  return (
    <div
      className="pointer-events-auto fixed bottom-0 right-0 z-[56] flex flex-col items-center gap-2 border-l border-border bg-surface pt-3"
      style={{ top: emPx(ALTURA_TOPBAR), width: emPx(LARGURA_TRILHO) }}
    >
      <button type="button" title="Contato" className={botao(aba === 'cliente')} onClick={() => ir('cliente')}>
        <User size={17} />
      </button>
      <button type="button" title="Mensagens rápidas" className={botao(aba === 'rapidas')} onClick={() => ir('rapidas')}>
        <Zap size={17} />
      </button>
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
      <span className="my-1 h-px w-6 bg-border" />
      {/* Meus contatos no painel web, já logado com a sessão da extensão. A aba
          nasce ANTES do await (o clique ainda vale como gesto) e recebe o endereço depois. */}
      <button
        type="button"
        title="Meus contatos no painel BuildChat"
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
    </div>
  );
}
