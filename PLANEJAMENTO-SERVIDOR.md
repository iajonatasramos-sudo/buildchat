# BuildChat — Planejamento da evolução para produto (SaaS)

> Documento de avaliação. Descreve como transformar a extensão local de hoje em um
> produto vendável, com login por usuário/empresa e sincronização em servidor próprio,
> **independente do BuildClinic**.
>
> Status: proposta para aprovação · Autor: Claude + Jonatas · Data: 03/09/2026

---

## 1. Visão

Uma extensão de Chrome para WhatsApp Web, vendida por assinatura a clínicas e equipes
comerciais, que entrega mensagens rápidas com sequência de ações, organização de conversas
em pastas e anotações por contato — com os dados do usuário sincronizados entre todas as
suas máquinas, mas **sem que as conversas saiam do computador**.

**Promessa central (e diferencial comercial):**
*"Suas mensagens rápidas e sua organização acompanham você em qualquer computador.
Suas conversas com pacientes nunca saem do seu."*

---

## 2. Fronteira de dados — o que vai e o que não vai para o servidor

Esta é a decisão estruturante do produto. Ela define arquitetura, custo, discurso de venda
e exposição jurídica.

### Fica no dispositivo (nunca sobe)

| Dado | Onde está hoje | Por quê fica local |
|---|---|---|
| Conversas e mensagens do WhatsApp | memória / WPP | Privacidade do paciente; volume; é dado do WhatsApp, não nosso |
| Mídia recebida nas conversas | cache do WhatsApp | Idem — pode ser gigabytes |
| Cache de mensagens apagadas | `bc2_msg_cache`, `bc2_apagadas` | Conteúdo de conversa; sensível |
| Sessão do WhatsApp (WPP) | navegador | Credencial do usuário |

### Sincroniza no servidor

| Dado | Onde está hoje | Escopo |
|---|---|---|
| Mensagens rápidas (categorias, respostas, ações, atalhos) | `bc2_categorias`, `bc2_respostas` | Empresa (padrão) **+** pessoal |
| Pastas / etiquetas (nome, cor, ordem) | `bc2_tags` | Empresa |
| Vínculo pasta ↔ conversa | `bc2_contact_tags` | Empresa, **por número** |
| Anotações por conversa | `bc2_notes` | Empresa, **por número** |
| Configurações do usuário (tema, atalho, webhook) | `bc2_settings` | Usuário |

### Os três níveis de dado

| Nível | O que é | Quem enxerga |
|---|---|---|
| **Da empresa** | Mensagens padrão criadas pelo admin, pastas oficiais | Todos os usuários da empresa |
| **Pessoal** | Mensagens rápidas do próprio usuário, tema, atalho, webhook | Só ele — em qualquer máquina dele |
| **Operacional** | Vínculo conversa↔pasta e anotações | Quem atende aquele número (ver §4) |

Uma empresa tem vários usuários; cada um leva **suas** mensagens rápidas e configurações
entre casa e escritório, **mais** o acervo comum que o admin publica para todos.

### Ponto de atenção: mídia das mensagens rápidas

A mídia **das respostas rápidas** (áudios de saudação, PDFs de proposta, imagens de
antes/depois) precisa subir, senão ao logar em outra máquina a resposta chega com o texto
e **sem o áudio** — quebrando justamente o que ela tem de mais valioso.

**Proposta:** sobe para o Storage, com download **sob demanda** e cache local permanente
(baixa uma vez por máquina). Isso não contradiz a promessa: o que não sobe é a mídia
**das conversas**. Volume estimado: ~42 MB no acervo atual completo.

---

## 3. Arquitetura

```
  Extensão (Chrome MV3)                    Servidor próprio
┌──────────────────────────┐        ┌──────────────────────────────┐
│ UI React + WPP           │  auth  │ Supabase Auth                │
│ cache local (storage)    │───────▶│ (e-mail + senha)             │
│ outbox (fila de escrita) │        ├──────────────────────────────┤
│                          │  dados │ Postgres + RLS por empresa   │
│                          │◀──────▶│ Storage (mídia das respostas)│
│                          │ realtime│ Realtime (multi-dispositivo) │
└──────────────────────────┘        ├──────────────────────────────┤
                                     │ API fina (Next.js/Hono):    │
                                     │  billing, convites, licença,│
                                     │  admin, webhooks do gateway │
                                     └──────────────────────────────┘
                                     Painel web (admin da empresa)
```

### Escolha da stack e o porquê

| Camada | Escolha | Justificativa |
|---|---|---|
| Auth | Supabase Auth | Sessão, refresh, reset de senha prontos; a extensão fala direto |
| Banco | Postgres (Supabase) com **RLS por `empresa_id`** | Schema novo permite escrever a permissão em SQL — sem CRUD para manter |
| Mídia | Supabase Storage | URLs assinadas, cache local no cliente |
| Tempo real | Supabase Realtime | Casa ↔ escritório sem polling |
| API fina | Next.js ou Hono | Só o que exige segredo: billing, convites, licença, admin |
| Painel web | Next.js | Admin da empresa e página de assinatura |

**Alternativa considerada:** API própria para tudo, com a extensão nunca falando com o
banco. Dá mais controle e desacopla o schema do cliente, mas acrescenta ~3–4 semanas de
CRUD e não resolve nenhum problema que RLS bem escrita não resolva.

**Risco associado à escolha:** um erro de política RLS vaza dados entre empresas.
Mitigação obrigatória: `empresa_id` em toda tabela, políticas escritas uma única vez a
partir de um helper, e **teste automatizado de isolamento** (loga como empresa A, tenta
ler B, espera zero linhas) rodando em CI.

---

## 4. Modelo de dados

```sql
-- ─── Tenant e acesso ────────────────────────────────────────────────
empresas        (id, nome, plano, status, trial_ate, assentos, criado_em)
usuarios        (id = auth.uid, empresa_id, nome, email, papel, ativo, criado_em)
                 -- papel: 'admin' | 'usuario'
convites        (id, empresa_id, email, papel, token, expira_em, aceito_em)

-- ─── Dados sincronizados ────────────────────────────────────────────
-- Todas com: empresa_id, atualizado_em, deleted_at  (sync incremental + soft delete)

pastas          (id, empresa_id, nome, cor, ordem, escopo, owner_id)
pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, owner_id)
categorias      (id, empresa_id, nome, cor, ordem, escopo, owner_id)
respostas       (id, empresa_id, categoria_id, titulo, atalho, pasta_id,
                 usos, ordem, escopo, owner_id)
resposta_acoes  (id, resposta_id, ordem, tipo, texto,
                 midia_path, midia_mime, midia_nome, delay_segundos)
anotacoes       (id, empresa_id, wa_number, remote_jid, texto, owner_id)
config_usuario  (usuario_id, tema, atalho, webhook_url, atualizado_em)
```

**Duas simplificações em relação ao código atual:**

1. **Pasta e etiqueta viram a mesma entidade.** Na extensão de hoje já são a mesma coisa
   com dois nomes (`bc2_tags` alimenta os chips de pasta e a etiqueta aplicada por resposta).
2. **Todo registro nasce com `escopo`**: `empresa` (o admin cria, todos usam) ou
   `pessoal` (só o dono vê). É o modelo que já funciona no Saleschat.

**Chave do vínculo pasta↔conversa:** `(empresa_id, pasta_id, wa_number, remote_jid)`.
`wa_number` é o número conectado no WhatsApp Web (a "instância"), `remote_jid` é o contato.

#### Por que a chave inclui o número (e por que isso resolve o compartilhamento)

Gravar o vínculo **por número conectado** dá o comportamento certo nos dois cenários reais,
sem criar uma configuração que o cliente possa errar:

- **Clínica com um número só** (caso mais comum — o WhatsApp permite até 4 dispositivos no
  mesmo número, então as recepcionistas abrem o mesmo WhatsApp Web): todas veem as mesmas
  conversas, logo marcar "LEAD FACETA" **precisa** aparecer para todas.
- **Vendedores com números próprios**: como a chave inclui o `wa_number`, os vínculos de
  cada um já ficam separados — ninguém vê a organização do outro, mesmo o dado sendo
  "da empresa".

A mesma regra vale para **anotações**: quem atende aquele número precisa ler a anotação do
colega ("paciente pediu retorno em 15 dias"). Cada anotação guarda o autor, para rastreabilidade.

### Política RLS (padrão para todas)

```sql
create policy "isolamento por empresa" on <tabela>
  using (empresa_id = (select empresa_id from usuarios where id = auth.uid()))
  with check (empresa_id = (select empresa_id from usuarios where id = auth.uid()));

-- Registros pessoais: visíveis só ao dono
create policy "escopo pessoal" on <tabela>
  using (escopo = 'empresa' or owner_id = auth.uid());
```

---

## 5. Sincronização (offline-first)

A extensão **nunca espera a rede** para responder ao usuário.

1. **Escrita otimista**: a ação aplica local imediatamente e entra numa *outbox* no
   `chrome.storage`.
2. **Envio**: o service worker drena a fila com retry e backoff (`chrome.alarms`).
   Sem internet, a fila espera; ao voltar, sobe sozinha.
3. **Leitura incremental**: `atualizado_em > ultimo_sync` — só o que mudou.
4. **Exclusão**: soft delete (`deleted_at`), para propagar remoção entre dispositivos.
5. **Conflito**: last-write-wins por registro. O vínculo pasta↔conversa é um conjunto,
   então a regra é **união**, não sobrescrita (evita perder marcação feita em outra máquina).
6. **Tempo real**: Realtime para propagação instantânea entre dispositivos da empresa.

**Momentos de sync:** no login, ao abrir/focar o WhatsApp Web, a cada 5 min e por evento
do Realtime.

---

## 6. Autenticação e organização

- **Cadastro**: e-mail + senha → cria a **empresa** (tenant) e o primeiro usuário como `admin`.
- **Convite de equipe**: admin convida por e-mail; o convidado define a senha e entra
  automaticamente na empresa (consome um assento).
- **Papéis**: `admin` (gerencia usuários, mensagens padrão da empresa, assinatura) e
  `usuario` (usa tudo, cria as suas mensagens pessoais).
- **Sessão na extensão**: token do Supabase guardado em `chrome.storage`, com refresh
  automático. Logout limpa os dados sincronizados do dispositivo (as conversas locais do
  WhatsApp não são tocadas).

---

## 7. Licenciamento e cobrança

| Item | Definição |
|---|---|
| Status da empresa | `trial` · `ativa` · `inadimplente` · `cancelada` |
| Trial | 7 ou 14 dias, sem cartão *(a definir)* |
| Unidade de cobrança | **Por assento (usuário)** — a clínica com 1 número e 3 recepcionistas paga 3, que é onde o valor é entregue; cobrar por número penalizaria o cliente típico |
| Gateway | Asaas ou Pagar.me (Pix, boleto, cartão). Stripe se houver venda fora do Brasil |
| Verificação | No login e a cada ~6h; resultado em cache |
| **Tolerância offline** | Licença válida em cache por até 7 dias — o vendedor **nunca** fica travado no meio de um atendimento por falta de internet |
| Vencida | Continua lendo o que está local; bloqueia sync e recursos premium, com faixa de aviso (padrão do concorrente) |

O webhook do gateway atualiza `empresas.status` — nenhuma checagem de pagamento roda no cliente.

---

## 8. Segurança e LGPD

Ao hospedar dados de clínicas, você passa a ser **operador** de dados de terceiros.

- Política de privacidade pública (exigida também pela Chrome Web Store).
- Contrato/DPA com o cliente: finalidade, retenção, subprocessadores (Supabase/Vercel).
- Exclusão sob solicitação: apagar empresa remove todos os registros (cascade) e a mídia.
- Trânsito sempre HTTPS; segredos só no servidor; a extensão carrega apenas a chave anon.
- **Ponto forte:** conversas e mídia recebida não saem do dispositivo — reduz drasticamente
  a superfície de exposição e é argumento de venda.
- Auditoria mínima: quem alterou mensagem padrão da empresa e quando.

---

## 9. O que muda na extensão (código atual)

| Área | Hoje | Depois |
|---|---|---|
| Dados | `chrome.storage` como fonte da verdade | `chrome.storage` como **cache** + outbox; servidor é a fonte |
| `src/lib/db.ts` | leitura/escrita direta | ganha camada de sync (marcar sujo, enfileirar, aplicar remoto) |
| Sessão | não existe | `src/lib/auth.ts` + tela de login + estado na barra do topo |
| Mídia | dataURL no storage | referência no servidor + cache local por hash |
| Service worker | só webhook | passa a drenar a outbox e agendar sync (`chrome.alarms`) |
| Manifest | ID variável | `key` fixa + `host_permissions` do domínio do produto |
| Seed local | importa do Dental Chat na 1ª carga | vira **migração one-time** para a conta na nuvem |

O que **não** muda: toda a UI, o motor de envio (WPP), o picker `/`, os temas, a barra do
cabeçalho e as pastas. A extensão continua funcionando 100% offline.

---

## 10. Fases de entrega

| Fase | Escopo | Critério de pronto |
|---|---|---|
| **0. Fundação** ✅ *(concluída — projeto no Supabase Cloud, migrações aplicadas, e2e passando)* | Repo do servidor, projeto Supabase, schema + RLS, teste de isolamento, deploy | Empresa A não enxerga 1 byte da B, provado em CI — **19 testes passando** (`server/`) |
| **1. Login** 🔄 *(código pronto; falta o projeto Supabase e a `key` do manifest)* | Auth na extensão, sessão, empresa/usuário na barra, status da licença, `key` fixa no manifest | Logar em duas máquinas e ver o mesmo usuário |
| **2. Pastas** ✅ *(motor pronto e contrato validado; falta o teste com duas máquinas reais)* | Sync de pastas + vínculos (motor de sync completo) | Marcar pasta em casa e ver no escritório em < 5 s |
| **3. Mensagens rápidas** ✅ *(sync + Storage implementados e validados)* | Sync de categorias/respostas/ações + mídia no Storage com cache | Máquina nova baixa e envia áudio de saudação |
| **4. Anotações e config** ✅ *(implementado e validado)* | Sync de anotações e preferências | Anotação criada em uma máquina aparece na outra |
| **5. Painel admin** ✅ *(telas prontas em `painel/`; falta hospedar)* | Web: usuários, convites, mensagens padrão da empresa | Admin cria mensagem padrão e a equipe recebe |
| **6. Billing** | Trial, planos, checkout, webhook, tela de assinatura | Cobrança real de um cliente piloto |
| **7. Publicação** | Chrome Web Store, site, política de privacidade | Instalação pela loja, sem "modo desenvolvedor" |
| **8. Migração** | Adoção dos dados locais atuais (23 pastas, 188 vínculos, respostas) | Nada se perde no primeiro login |

**Estimativa grosseira:** fases 0–4 formam o produto sincronizado utilizável; 5–8 são o que
o torna vendável sem operação manual. Dá para faturar já entre a 5 e a 6, com 2–3 clínicas
piloto em trial controlado, antes do checkout automático existir.

---

## 11. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Rejeição/remoção na Chrome Web Store (automação de WhatsApp é área sensível) | Alto — bloqueia a distribuição | Publicar cedo (mesmo não listado) na Fase 1 para descobrir o veredito antes de investir no resto |
| Bug de RLS vazando dados entre empresas | Crítico — incidente de segurança | Teste de isolamento em CI desde a Fase 0 |
| Mudança no WhatsApp Web quebra o WPP | Alto — produto para de enviar | `@wppconnect/wa-js` atualizado, fallback por DOM já existente, canal de release rápido |
| Custo de mídia crescer | Médio | Download sob demanda, cache local, limite por plano |
| ID da extensão mudar | Médio | `key` fixa no manifest desde a Fase 1 |
| Conta do WhatsApp do cliente ser banida por automação | Reputacional | Delays já implementados entre ações; comunicar limites de uso |

---

## 12. Decisões

### Tomadas

1. **Estrutura de conta**: empresa (assinante) → usuários criados/convidados pelo admin.
   Cada usuário tem suas mensagens rápidas e configurações sincronizadas; a empresa tem o
   acervo padrão publicado pelo admin.
2. **Vínculo de pasta e anotações são da empresa, chaveados por número** (`wa_number`) —
   compartilhados entre quem atende o mesmo WhatsApp, separados entre números diferentes.
3. **Cobrança por assento (usuário)**, não por número conectado.
4. **Conversas e mídia recebida nunca sobem** — é regra de produto, não detalhe técnico.

### Pendentes

5. **Nome/marca e domínio** do produto (necessários antes da Store e da emissão de licença).
6. **Supabase direto com RLS** (recomendado) ou **API própria em tudo**?
7. **Mídia das mensagens rápidas sobe** (recomendado, §2) — confirmar.

---

## 13. Custos operacionais estimados

| Item | Ordem de grandeza |
|---|---|
| Supabase Pro | ~US$ 25/mês (inclui banco, auth, storage, realtime) |
| Hospedagem da API/painel | US$ 0–20/mês |
| Domínio | ~R$ 40/ano |
| Taxa Chrome Web Store | US$ 5 (única) |
| Gateway de pagamento | ~3–5% por transação |

Custo marginal por cliente é próximo de zero até a casa das dezenas de empresas — o produto
é barato de operar porque o volume pesado (conversas) fica no dispositivo do usuário.
