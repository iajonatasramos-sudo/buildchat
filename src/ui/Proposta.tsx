// "Gerar proposta": replica a tela do BuildClinic dentro da extensão.
// O PDF vem pronto da API — aqui só montamos os dados, calculamos as parcelas
// e tratamos o arquivo (abrir para revisão e/ou anexar na conversa).

import { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { modalProposta } from '@/lib/store';
import { enviarArquivo } from '@/lib/wa';
import * as db from '@/lib/db';
import {
  TIPOS,
  brl,
  calcular,
  dataPorExtenso,
  ehInteriores,
  ehVigilancia,
  gerarProposta,
  parseValor,
  type DadosProposta,
  type TipoProposta,
} from '@/lib/propostas';
import type { ContatoAtivo } from '@/lib/types';
import { toast } from './toast';

/** Campos que o cálculo preenche — e para de mexer assim que o usuário edita. */
type CampoDerivado = 'avista' | 'cartao' | 'entrada' | 'saldo' | 'saldo2';

export function PropostaModal({ contato }: { contato: ContatoAtivo | null }) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoProposta>('EXEC_SP');
  const [medida, setMedida] = useState('');
  const [qambientes, setQambientes] = useState('');
  const [ambientes, setAmbientes] = useState('');
  const [prazo, setPrazo] = useState('45');
  const [valor, setValor] = useState('');
  const [desconto, setDesconto] = useState('10');
  const [parcelas, setParcelas] = useState('4');
  const [entradaPct, setEntradaPct] = useState('70');
  const [derivados, setDerivados] = useState<Record<CampoDerivado, string>>({
    avista: '', cartao: '', entrada: '', saldo: '', saldo2: '',
  });
  const [tocados, setTocados] = useState<Set<CampoDerivado>>(new Set());
  const [mostrar, setMostrar] = useState({ avista: true, cartao: true, parcelado: true });
  const [notas, setNotas] = useState<string[]>([]);
  const [data, setData] = useState(dataPorExtenso());
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null);
  const [anexando, setAnexando] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);

  const fechar = () => modalProposta.set(false);
  const vigilancia = ehVigilancia(tipo);
  const interiores = ehInteriores(tipo);

  // Nome sugerido: o da ficha tem prioridade sobre o do WhatsApp.
  useEffect(() => {
    if (!contato) return;
    db.obterFicha(contato.chatId).then((f) => setNome(f.nome?.trim() || contato.nome));
  }, [contato?.chatId]);

  // Libera a URL do PDF ao fechar, para não vazar memória.
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const total = useMemo(() => parseValor(valor), [valor]);

  // Recalcula o que o usuário ainda não editou à mão.
  useEffect(() => {
    if (total === null || total === 0) return;
    const novos = calcular(total, {
      desconto: Number(desconto) || 0,
      parcelas: Number(parcelas) || 1,
      entradaPct: Number(entradaPct) || 0,
      tipo,
    });
    setDerivados((atual) => {
      const saida = { ...atual };
      (Object.keys(novos) as CampoDerivado[]).forEach((k) => {
        if (!tocados.has(k)) saida[k] = novos[k];
      });
      return saida;
    });
  }, [total, desconto, parcelas, entradaPct, tipo, tocados]);

  function editarDerivado(campo: CampoDerivado, texto: string) {
    setTocados((t) => new Set(t).add(campo));
    setDerivados((d) => ({ ...d, [campo]: texto }));
  }

  async function gerar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome como aparece na proposta.');
    if (total === null || total === 0) return setErro('Informe o valor total.');

    const dados: DadosProposta = {
      nome: nome.trim(),
      valor: brl(total),
      avista: derivados.avista,
      cartao: derivados.cartao,
      parcelas: String(Number(parcelas) || 1),
      entrada: derivados.entrada,
      saldo: derivados.saldo,
      prazo: prazo.trim(),
      data: data.trim(),
      notasExtras: notas.map((n) => n.trim()).filter(Boolean),
      ...(interiores
        ? { qambientes: qambientes.trim(), ambientes: ambientes.trim() }
        : { medida: medida.trim() }),
      ...(vigilancia
        ? {
            saldo2: derivados.saldo2,
            mostrarAvista: mostrar.avista,
            mostrarCartao: mostrar.cartao,
            mostrarParcelado: mostrar.parcelado,
          }
        : {}),
    };

    setGerando(true);
    try {
      const blob = await gerarProposta(dados, tipo);
      if (pdf) URL.revokeObjectURL(pdf.url);
      const url = URL.createObjectURL(blob);
      setPdf({ blob, url });
      // Depois do await o clique já não conta como gesto do usuário, então o
      // navegador pode bloquear a aba. Se bloquear, o botão abaixo resolve.
      const aba = window.open(url, '_blank');
      setBloqueada(!aba);
      toast.success(aba ? 'Proposta gerada.' : 'Proposta gerada — clique em “Abrir para revisão”.');
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao gerar a proposta.');
    } finally {
      setGerando(false);
    }
  }

  async function anexar() {
    if (!pdf) return;
    setAnexando(true);
    const arquivo = `proposta-${nome.trim().split(/\s+/)[0]?.toLowerCase() || 'cliente'}.pdf`;
    const res = await enviarArquivo(pdf.blob, arquivo);
    setAnexando(false);
    if (res.ok) {
      toast.success('Proposta enviada na conversa.');
      fechar();
    } else {
      setErro(res.erro);
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-text/50 p-4" onClick={fechar}>
      <div
        className="bc-anim-pop flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
          <h3 className="inline-flex items-center gap-1.5 text-[14px] font-bold">
            <FileText size={15} className="text-brand" /> Gerar proposta
          </h3>
          <button type="button" onClick={fechar} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <Campo label="Nome (como aparece na proposta)">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={ent} />
          </Campo>

          <Campo label="Tipo de proposta">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoProposta)} className={ent}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.rotulo}</option>
              ))}
            </select>
          </Campo>

          {interiores ? (
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Nº de ambientes">
                <input value={qambientes} onChange={(e) => setQambientes(e.target.value)} placeholder="03" className={ent} />
              </Campo>
              <Campo label="Prazo (dias úteis)">
                <input value={prazo} onChange={(e) => setPrazo(e.target.value)} className={ent} />
              </Campo>
              <div className="col-span-2">
                <Campo label="Quais ambientes">
                  <input
                    value={ambientes}
                    onChange={(e) => setAmbientes(e.target.value)}
                    placeholder="recepção, consultório"
                    className={ent}
                  />
                </Campo>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Metragem (m²)">
                <input value={medida} onChange={(e) => setMedida(e.target.value)} placeholder="120" className={ent} />
              </Campo>
              <Campo label="Prazo (dias úteis)">
                <input value={prazo} onChange={(e) => setPrazo(e.target.value)} className={ent} />
              </Campo>
            </div>
          )}

          <Campo label="Valor total">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => total !== null && total > 0 && setValor(brl(total))}
              placeholder="12.000,00"
              className={ent}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-2.5">
            <ValorComAjuste
              label={`À vista (–${Number(desconto) || 0}%)`}
              valor={derivados.avista}
              onValor={(v) => editarDerivado('avista', v)}
              ajuste={desconto}
              onAjuste={setDesconto}
              sufixo="%"
              titulo="Desconto à vista"
            />
            <ValorComAjuste
              label={`Cartão (${Number(parcelas) || 1}x)`}
              valor={derivados.cartao}
              onValor={(v) => editarDerivado('cartao', v)}
              ajuste={parcelas}
              onAjuste={setParcelas}
              sufixo="x"
              titulo="Número de parcelas"
            />
          </div>

          {vigilancia ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Campo label="Entrada (50%)">
                  <input value={derivados.entrada} onChange={(e) => editarDerivado('entrada', e.target.value)} className={ent} />
                </Campo>
                <Campo label="Na entrega (30%)">
                  <input value={derivados.saldo} onChange={(e) => editarDerivado('saldo', e.target.value)} className={ent} />
                </Campo>
              </div>
              <Campo label="Após Vigilância (20%)">
                <input value={derivados.saldo2} onChange={(e) => editarDerivado('saldo2', e.target.value)} className={ent} />
              </Campo>

              <div className="rounded-md border border-border bg-surface-2 p-2.5">
                <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
                  Formas de pagamento a exibir
                </div>
                {([
                  ['avista', 'À vista (com desconto)'],
                  ['cartao', 'Cartão de crédito'],
                  ['parcelado', 'Transferência bancária (50/30/20)'],
                ] as const).map(([chave, rotulo]) => (
                  <label key={chave} className="flex cursor-pointer items-center gap-2 py-0.5 text-[12px]">
                    <input
                      type="checkbox"
                      checked={mostrar[chave]}
                      onChange={(e) => setMostrar((m) => ({ ...m, [chave]: e.target.checked }))}
                    />
                    {rotulo}
                  </label>
                ))}
                <p className="mt-1 text-[10.5px] text-muted">Desmarque para suprimir a forma no PDF.</p>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <ValorComAjuste
                label={`Entrada (${Number(entradaPct) || 0}%)`}
                valor={derivados.entrada}
                onValor={(v) => editarDerivado('entrada', v)}
                ajuste={entradaPct}
                onAjuste={setEntradaPct}
                sufixo="%"
                titulo="Porcentagem de entrada"
              />
              <Campo label={`Saldo final (${Math.max(0, 100 - (Number(entradaPct) || 0))}%)`}>
                <input value={derivados.saldo} onChange={(e) => editarDerivado('saldo', e.target.value)} className={ent} />
              </Campo>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Notas adicionais</span>
              <button
                type="button"
                onClick={() => setNotas((n) => [...n, ''])}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
              >
                <Plus size={12} /> Adicionar nota
              </button>
            </div>
            <p className="mb-1.5 text-[10.5px] text-muted">
              N1 e N2 já entram sempre. Adicione N3, N4… se precisar.
            </p>
            {notas.map((n, i) => (
              <div key={i} className="mb-1.5 flex gap-1.5">
                <input
                  value={n}
                  autoFocus={i === notas.length - 1}
                  onChange={(e) => setNotas((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Nota ${i + 3}`}
                  className={ent}
                />
                <button
                  type="button"
                  onClick={() => setNotas((arr) => arr.filter((_, j) => j !== i))}
                  className="grid h-9 w-8 flex-shrink-0 place-items-center rounded-md text-muted hover:text-danger"
                  title="Remover nota"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <Campo label="Data">
            <input value={data} onChange={(e) => setData(e.target.value)} className={ent} />
          </Campo>

          {erro && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[12px] text-danger">{erro}</p>
          )}
        </div>

        <div className="flex-shrink-0 space-y-2 border-t border-border bg-surface-2 p-3">
          <button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2.5 text-[13.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            {pdf ? 'Gerar novamente' : 'Gerar PDF da proposta'}
          </button>

          {pdf ? (
            <div className="flex gap-2">
              <a
                href={pdf.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-semibold transition',
                  bloqueada
                    ? 'border-brand bg-brand text-white'
                    : 'border-border-strong text-text-2 hover:bg-surface',
                )}
              >
                <FileText size={13} /> Abrir para revisão
              </a>
              <button
                type="button"
                onClick={anexar}
                disabled={anexando}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-brand px-3 py-2 text-[12.5px] font-bold text-brand transition hover:bg-brand hover:text-white disabled:opacity-50"
              >
                {anexando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Anexar na conversa
              </button>
            </div>
          ) : (
            <p className="text-center text-[10.5px] leading-relaxed text-muted">
              O PDF abre para revisão — o envio ao lead é feito depois, por aqui mesmo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const ent =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-brand';

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Valor com o ajuste colado à direita (desconto %, parcelas, entrada %). */
function ValorComAjuste({
  label, valor, onValor, ajuste, onAjuste, sufixo, titulo,
}: {
  label: string;
  valor: string;
  onValor: (v: string) => void;
  ajuste: string;
  onAjuste: (v: string) => void;
  sufixo: string;
  titulo: string;
}) {
  return (
    <Campo label={label}>
      <div className="flex overflow-hidden rounded-md border border-border-strong bg-surface focus-within:border-brand">
        <input
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none"
        />
        <label title={titulo} className="flex flex-shrink-0 items-center gap-0.5 bg-brand px-2 text-[12px] font-bold text-white">
          <input
            value={ajuste}
            onChange={(e) => onAjuste(e.target.value.replace(/\D/g, ''))}
            className="w-5 bg-transparent text-right text-white outline-none"
          />
          {sufixo}
        </label>
      </div>
    </Campo>
  );
}
