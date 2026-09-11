// "WebHooks": manda os dados do contato para outro sistema quando a mensagem
// chega. Abre pela barra lateral.
//
// Quem dispara e o que vai no corpo estão em `src/lib/webhook.ts`; aqui é só
// a tela — endereço, liga/desliga, o que enviar e o histórico dos últimos
// envios (útil para descobrir por que o outro lado não recebeu).

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, Webhook as IconeWebhook, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { modalWebhook } from '@/lib/store';
import {
  CAMPOS, CONFIG_PADRAO, type CampoWebhook, type ConfigWebhook, type EnvioWebhook,
  dispararWebhook, limparEnvios, listarEnvios, obterConfig, pedirPermissao, salvarConfig, temPermissao,
} from '@/lib/webhook';
import { toast } from './toast';

export function WebhookModal() {
  const [cfg, setCfg] = useState<ConfigWebhook | null>(null);
  const [envios, setEnvios] = useState<EnvioWebhook[]>([]);
  const [verEnvios, setVerEnvios] = useState(false);
  const [testando, setTestando] = useState(false);
  // Sem permissão para o domínio, o Chrome barra a resposta e o envio vira
  // "às cegas" — o corpo chega, mas não dá para saber o que o destino disse.
  const [liberado, setLiberado] = useState<boolean | null>(null);

  const fechar = () => modalWebhook.set(false);

  const recarregarEnvios = useCallback(() => listarEnvios().then(setEnvios), []);

  useEffect(() => {
    obterConfig().then((c) => {
      setCfg(c);
      if (c.url.trim()) temPermissao(c.url).then(setLiberado);
    });
    recarregarEnvios();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [recarregarEnvios]);

  // Salva sozinho: a tela não tem botão "Salvar" (é uma configuração só).
  const mudar = (patch: Partial<ConfigWebhook>) => {
    setCfg((atual) => {
      const novo = { ...(atual ?? CONFIG_PADRAO), ...patch };
      salvarConfig(novo);
      return novo;
    });
  };
  const alternarCampo = (c: CampoWebhook) =>
    mudar({ campos: { ...(cfg ?? CONFIG_PADRAO).campos, [c]: !(cfg ?? CONFIG_PADRAO).campos[c] } });

  /** O Chrome só concede a permissão dentro de um clique — daí ser aqui. */
  async function liberarDominio() {
    if (!cfg?.url.trim()) return false;
    if (await temPermissao(cfg.url)) {
      setLiberado(true);
      return true;
    }
    const ok = await pedirPermissao(cfg.url);
    setLiberado(ok);
    if (!ok) toast.error('Sem a permissão, o envio vai às cegas: o destino recebe, mas não dá para confirmar.');
    return ok;
  }

  async function testar() {
    if (!cfg?.url.trim() || testando) return;
    await liberarDominio();
    setTestando(true);
    try {
      const r = await dispararWebhook(
        {
          id: 'teste',
          chatId: '5511999999999@c.us',
          texto: 'Mensagem de teste do WebHook',
          tipo: 'chat',
          autor: '5511999999999@c.us',
          ts: Math.floor(Date.now() / 1000),
        },
        cfg,
      );
      recarregarEnvios();
      if (r.ok && r.semConfirmacao) toast.success('Enviado (sem confirmação do destino). Confira no seu sistema.');
      else if (r.ok) toast.success('Enviado. Confira no seu sistema.');
      else toast.error(r.erro ? `Não consegui enviar: ${r.erro}` : `O destino respondeu ${r.status}.`);
    } finally {
      setTestando(false);
    }
  }

  if (!cfg) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[67] flex items-center justify-center bg-text/50 p-4" onClick={fechar}>
      <div
        className="bc-anim-pop flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="inline-flex items-center gap-2 text-[16px] font-bold">
              <IconeWebhook size={17} className="text-brand" /> WebHooks
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Envie os dados do contato para outro sistema assim que a mensagem chegar.
            </p>
          </div>
          <button type="button" onClick={fechar} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
            URL do WebHook
            <input
              autoFocus
              value={cfg.url}
              onChange={(e) => mudar({ url: e.target.value })}
              placeholder="https://seusistema.com/api/whatsapp"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[13px] font-normal normal-case tracking-normal outline-none focus:border-brand"
            />
          </label>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                const ligando = !cfg.ativo;
                if (ligando) await liberarDominio();
                mudar({ ativo: ligando });
              }}
              title={cfg.ativo ? 'Desligar o envio' : 'Ligar o envio'}
              className={cn(
                'relative h-6 w-11 flex-shrink-0 rounded-full transition',
                cfg.ativo ? 'bg-brand' : 'bg-surface-3',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  cfg.ativo ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </button>
            <span className="text-[13px] font-semibold text-text">Ativo</span>
            <button
              type="button"
              onClick={testar}
              disabled={!cfg.url.trim() || testando}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-surface-2 disabled:opacity-50"
            >
              {testando ? <Loader2 size={12} className="animate-spin" /> : null}
              Enviar teste
            </button>
          </div>

          {!cfg.ativo ? (
            <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-[11.5px] text-muted">
              Desligado, nada é enviado — nem quando a mensagem chega.
            </p>
          ) : liberado === false ? (
            <p className="mt-2 rounded-md border border-warning/40 bg-surface-2 px-2.5 py-2 text-[11.5px] text-text-2">
              O Chrome ainda não liberou este domínio, então o envio vai <strong>às cegas</strong>: o
              seu sistema recebe os dados, mas a extensão não consegue ler a resposta.{' '}
              <button type="button" onClick={liberarDominio} className="font-semibold text-brand underline">
                Liberar agora
              </button>
            </p>
          ) : null}

          <section className="mt-4 overflow-hidden rounded-lg border border-border">
            <header className="border-b border-border bg-surface-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-text-2">
              Dados a enviar
            </header>
            <ul className="divide-y divide-border">
              {CAMPOS.map((c) => (
                <li key={c.chave}>
                  <button
                    type="button"
                    onClick={() => alternarCampo(c.chave)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        'grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border transition',
                        cfg.campos[c.chave] ? 'border-brand bg-brand text-white' : 'border-border-strong',
                      )}
                    >
                      {cfg.campos[c.chave] && <Check size={11} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-text">{c.rotulo}</span>
                      <span className="block text-[11px] text-muted">{c.ajuda}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-3 overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setVerEnvios((v) => !v)}
              className="flex w-full items-center gap-2 bg-surface-2 px-3 py-2 text-left"
            >
              <span className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-wide text-text-2">
                Últimos {envios.length} envios (máximo 30)
              </span>
              <ChevronDown size={14} className={cn('flex-shrink-0 text-muted transition', verEnvios && 'rotate-180')} />
            </button>
            {verEnvios && (
              <div className="max-h-52 overflow-y-auto">
                {envios.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-muted">Nada enviado ainda.</p>
                ) : (
                  <>
                    <ul className="divide-y divide-border">
                      {envios.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 px-3 py-2">
                          <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', e.ok ? 'bg-success' : 'bg-danger')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] text-text-2">{e.resumo}</span>
                            <span className="block text-[10.5px] text-muted">
                              {new Date(e.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              {e.status ? ` · resposta ${e.status}` : ''}
                              {e.erro ? ` · ${e.erro}` : ''}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-border px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => limparEnvios().then(recarregarEnvios)}
                        className="text-[11.5px] font-semibold text-muted transition hover:text-danger"
                      >
                        Limpar histórico
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            O envio é um POST com JSON, disparado a cada mensagem recebida de um contato (grupos
            ficam de fora). Só o que estiver marcado acima vai no corpo.
          </p>
        </div>
      </div>
    </div>
  );
}
