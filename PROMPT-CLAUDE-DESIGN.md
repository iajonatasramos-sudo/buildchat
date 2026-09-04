# Prompt para o Claude Design — Painel web do BuildChat

> Copie tudo o que está entre as linhas abaixo e cole no Claude Design.
> Ajuste o que quiser antes de enviar (nome do produto, planos, preços).

---

Crie um **canvas de design** com as telas do painel web administrativo do **BuildChat**
(nome provisório), um SaaS brasileiro vendido por assinatura para clínicas odontológicas e
equipes comerciais.

## O produto

O BuildChat é uma **extensão de Chrome para WhatsApp Web** que dá à equipe de atendimento:
mensagens rápidas com sequência de ações (texto → áudio → PDF, com intervalos), organização
das conversas em pastas coloridas (etiquetas), anotações por paciente e recuperação de
mensagens apagadas. As conversas e os arquivos recebidos **nunca saem do computador do
usuário** — só as configurações, mensagens e pastas sincronizam na nuvem. Isso é o
diferencial de privacidade e deve aparecer no produto.

O painel web que você vai desenhar **não é a extensão**: é onde o dono da clínica (admin)
gerencia a conta — usuários, acervo de mensagens padrão da empresa, pastas e assinatura.

## Quem usa

- **Admin** (dono da clínica ou gerente comercial, 35–55 anos, pouco íntimo de tecnologia):
  entra poucas vezes por mês, para adicionar uma recepcionista nova, publicar uma mensagem
  padrão ou pagar a fatura. Precisa de telas óbvias, sem jargão.
- **Recepcionista/vendedor**: vive dentro da extensão, quase não entra no painel.

## Telas a desenhar (artboards desktop 1440×1024, salvo indicação)

1. **Login** — e-mail e senha, "esqueci minha senha", link para criar conta.
2. **Criar conta / onboarding** — nome da clínica, nome do responsável, e-mail, senha;
   mostrar que começa com teste grátis e sem cartão.
3. **Visão geral (home do painel)** — cartões com: status da assinatura (ex.: "Teste grátis
   — faltam 9 dias"), assentos usados (ex.: "3 de 5"), quantas mensagens rápidas a empresa
   publicou, quantas pastas existem e quem usou a extensão nos últimos 7 dias.
4. **Usuários** — tabela com nome, e-mail, papel (Admin/Usuário), último acesso e status;
   botão "Convidar usuário" e o modal de convite (e-mail + papel). Mostrar o contador de
   assentos e o que acontece ao estourar o limite.
5. **Mensagens padrão da empresa** — lista agrupada por categoria colorida (ex.: SAUDAÇÃO,
   IMPLANTES, LENTES, CONFIRMAÇÃO), com contagem por categoria e botão de nova mensagem.
6. **Editor de mensagem rápida** — o mais importante: a mensagem é uma **sequência de ações**
   numeradas. Cada ação tem tipo (texto, imagem, áudio, vídeo, documento), conteúdo/legenda e
   "aguardar N segundos antes". Deve dar para reordenar, adicionar e remover ações, escolher
   categoria, definir o atalho (usado como `/saudacao` no WhatsApp) e a pasta aplicada
   automaticamente ao paciente quando a mensagem é enviada. Mostre variáveis disponíveis
   (`{{nome}}`, `{{primeiro_nome}}`, `{{saudacao}}`, `{{data}}`).
7. **Pastas da empresa** — lista de pastas com cor, nome, ordem (arrastável) e quantas
   conversas cada uma tem; modal de criar/editar com seletor de cor.
8. **Assinatura** — plano atual, valor, próxima cobrança, forma de pagamento (Pix, boleto,
   cartão), histórico de faturas, botões de trocar plano e cancelar.
9. **Estados críticos** (podem ser artboards menores):
   - assinatura vencida (faixa vermelha no topo + painel em modo restrito);
   - lista vazia ("nenhuma mensagem padrão ainda") com chamada para criar a primeira;
   - convite pendente aguardando aceite.
10. **Página de estilo** — um artboard com a paleta, tipografia, botões, campos, chips de
    pasta e cartões, para servir de referência ao código.

## Direção visual

- **Ferramenta de trabalho, não site de marketing**: densidade de informação alta, hierarquia
  clara, nada de ilustrações genéricas ou seções gigantes de espaço vazio.
- **Cor de marca**: índigo/azul-violeta (aprox. `#4F46E5`). Neutros com leve tom azulado
  (fundo quase branco `#FAFAFB`, superfícies brancas, bordas suaves).
- **Cores das pastas** são dados, não decoração: verde `#22c55e`, azul `#3b82f6`, roxo
  `#a855f7`, rosa `#ec4899`, âmbar `#f59e0b`, vermelho `#ef4444`, teal `#14b8a6`,
  índigo `#6366f1`. Os chips de pasta aparecem **com fundo sólido na cor e texto branco**.
- **Cantos discretos** (raio 4–8px), não pílulas. Sombras sutis.
- **Tipografia**: uma sans-serif limpa (Inter ou DM Sans). Títulos sóbrios, corpo 14px.
- **Tema claro** como padrão; se sobrar fôlego, uma variação escura da visão geral.
- **Tudo em português do Brasil**, com dados de exemplo realistas de clínica odontológica
  (nomes como "Dra. Kelly Carvalho", pastas como "LEAD FACETA", "CONSULTORIA AGENDADA",
  "PACIENTE IMPLANTE"; mensagens como "SAUDAÇÃO", "Avaliação Lente", "Enviou Proposta").
- Sem logo definida ainda: use o nome em texto com um símbolo simples de raio (⚡) como marca
  provisória.

## O que evitar

- Não desenhe a interface da extensão dentro do WhatsApp — ela já existe.
- Não invente recursos que não listei (relatórios avançados, CRM completo, chat interno).
- Nada de tabelas com 12 colunas nem dashboards cheios de gráficos: o admin quer resolver
  uma coisa e sair.

---
