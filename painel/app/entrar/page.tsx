'use client';

// Entrar / criar conta — layout dividido, como no protótipo: formulário à
// esquerda e a proposta de valor à direita.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [empresa, setEmpresa] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setErro('Conta criada. Confirme o e-mail e entre para concluir o cadastro da clínica.');
          setCarregando(false);
          return;
        }
        const { error: erroRpc } = await supabase.rpc('criar_empresa_e_admin', {
          p_empresa: empresa.trim(),
          p_nome: nome.trim(),
        });
        if (erroRpc) throw erroRpc;
      }
      router.push('/painel');
    } catch (e: unknown) {
      setErro(traduzir(e instanceof Error ? e.message : String(e)));
      setCarregando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center border-r border-borda bg-white px-8 py-16 lg:px-20">
        <div className="mb-12 flex items-center gap-2 text-[18px] font-extrabold">
          <span className="text-[20px] text-marca">⚡</span>BuildChat
        </div>

        <form onSubmit={enviar} className="w-full max-w-[400px]">
          <h1 className="mb-2 text-[30px] font-extrabold">
            {modo === 'entrar' ? 'Entrar no painel' : 'Criar conta da clínica'}
          </h1>
          <p className="mb-8 leading-relaxed text-tinta-3">
            {modo === 'entrar'
              ? 'Gerencie usuários, mensagens padrão e a assinatura da sua clínica.'
              : '14 dias de teste grátis. Sem cartão de crédito.'}
          </p>

          <div className="flex flex-col gap-4">
            {modo === 'criar' && (
              <>
                <Campo rotulo="Nome da clínica" valor={empresa} onChange={setEmpresa} placeholder="Clínica Carvalho Odontologia" />
                <Campo rotulo="Nome do responsável" valor={nome} onChange={setNome} placeholder="Dra. Kelly Carvalho" />
              </>
            )}
            <Campo rotulo="E-mail de trabalho" tipo="email" valor={email} onChange={setEmail} placeholder="voce@clinica.com.br" />
            <Campo rotulo="Senha" tipo="password" valor={senha} onChange={setSenha} placeholder="Mínimo 6 caracteres" />

            {erro && (
              <p className="rounded-controle border border-alerta-borda bg-alerta-fundo px-3 py-2.5 text-[13px] leading-snug text-alerta">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="mt-1.5 rounded-controle bg-marca px-[18px] py-[13px] text-[14.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.6)] transition hover:bg-marca-hover disabled:opacity-50"
            >
              {carregando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Começar teste grátis'}
            </button>

            {modo === 'criar' && (
              <p className="text-[12.5px] leading-relaxed text-tinta-4">
                Ao criar a conta você concorda com os termos de uso. Suas conversas e arquivos do WhatsApp continuam
                apenas no computador de cada usuário.
              </p>
            )}
          </div>

          <div className="mt-7 border-t border-borda pt-5 text-tinta-3">
            {modo === 'entrar' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
            <button
              type="button"
              onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null); }}
              className="font-medium text-marca hover:underline"
            >
              {modo === 'entrar' ? 'Criar conta grátis' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>

      <div
        className="hidden flex-col justify-center gap-7 px-[72px] py-16 lg:flex"
        style={{ background: 'linear-gradient(160deg, #221E3D 0%, #302A5E 55%, #3B2F72 100%)' }}
      >
        <div className="text-[12px] font-medium tracking-[0.09em] text-lateral-claro">
          A EXTENSÃO PARA WHATSAPP WEB DA SUA EQUIPE
        </div>
        <div className="flex flex-col gap-[18px]">
          <CartaoValor titulo="Mensagens em sequência">
            Texto, áudio e PDF disparados em ordem, com intervalo entre cada ação.
          </CartaoValor>
          <CartaoValor titulo="Pastas coloridas">
            <div className="flex flex-wrap gap-1.5">
              {[['LEAD FACETA', '#ec4899'], ['CONSULTORIA AGENDADA', '#22c55e'], ['PACIENTE IMPLANTE', '#3b82f6']].map(
                ([nome, cor]) => (
                  <span key={nome} className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white" style={{ background: cor }}>
                    {nome}
                  </span>
                ),
              )}
            </div>
          </CartaoValor>
          <CartaoValor titulo="Privacidade por padrão">
            Conversas e arquivos recebidos nunca saem do computador. Só configurações, mensagens e pastas sincronizam.
          </CartaoValor>
        </div>
      </div>
    </div>
  );
}

function CartaoValor({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-cartao border border-white/15 bg-white/[0.07] px-[22px] py-5">
      <div className="mb-1.5 font-extrabold text-white">{titulo}</div>
      <div className="leading-relaxed text-[#C3C0DC]">{children}</div>
    </div>
  );
}

function Campo({
  rotulo, valor, onChange, tipo = 'text', placeholder,
}: { rotulo: string; valor: string; onChange: (v: string) => void; tipo?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {rotulo}
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="campo focus:campo-foco font-normal"
      />
    </label>
  );
}

function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('already registered')) return 'Este e-mail já tem conta.';
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (m.includes('já pertence')) return 'Este usuário já está em uma empresa.';
  if (m.includes('password')) return 'Senha muito curta (mínimo 6 caracteres).';
  return msg;
}
