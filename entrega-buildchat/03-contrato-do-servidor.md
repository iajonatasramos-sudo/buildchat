# 3. O contrato do servidor

Este é o documento a ler se a ideia for **trocar o Supabase pelo servidor da BuildClinic**. Ele
descreve o que a extensão espera encontrar do outro lado.

O esquema inteiro está em [sql/](sql/), em ordem de aplicação. A suíte em [testes/](testes/)
prova as regras de acesso contra um Postgres de verdade.

## Os princípios

1. **Multiempresa por linha.** Toda tabela de dado tem `empresa_id`, e a regra de acesso
   (Row Level Security) filtra pela empresa da pessoa logada. Não existe consulta do
   aplicativo que precise lembrar de filtrar: o banco não devolve o que não é seu.
2. **Nada é apagado de verdade.** Tudo tem `deleted_at`. É o que permite a exclusão chegar aos
   outros computadores.
3. **Leitura incremental.** Tudo tem `atualizado_em`, tocado por gatilho. A extensão pede só o
   que mudou desde a última vez.
4. **O que é do aparelho nunca sobe.** Conversas, mídia recebida e o cache de mensagens
   apagadas ficam no navegador.

## As tabelas

### Conta e estrutura

| Tabela | O que guarda |
|---|---|
| `empresas` | a clínica: plano, situação, assentos, valor, ciclo, marca do produto |
| `usuarios` | pessoas da clínica; `id` é o mesmo do login (`auth.users`) |
| `equipes`, `equipe_usuarios` | departamentos (o nome mudou só na tela) |
| `config_usuario` | preferências (tema, atalho) — privadas de cada um |
| `convites` | herdado, hoje não usado: o administrador cria o usuário direto |

### Acervo

| Tabela | O que guarda |
|---|---|
| `categorias` | agrupam as mensagens rápidas |
| `respostas` | a mensagem rápida (título, atalho, categoria, etiqueta ao usar, visibilidade) |
| `resposta_acoes` | a sequência: texto, mídia, espera, entrar/sair de pasta |
| `pastas` | as etiquetas, com escopo (da empresa ou pessoal) e visibilidade |

### Operação

| Tabela | O que guarda |
|---|---|
| `contatos` | a ficha do lead: nome, telefone, interesses, origem, quem cadastrou |
| `pasta_conversas` | vínculo conversa ↔ pasta |
| `anotacoes` | anotações do contato, com autor |
| `agendamentos` | a agenda: título, início, fim, situação, etiqueta, responsável |
| `propostas` | metadados do PDF gerado (o arquivo fica no armazenamento) |
| `usuario_numeros` | quais números de WhatsApp cada pessoa conectou |
| `recurso_acesso` | quais funções da extensão cada pessoa enxerga |

### Produto e cobrança

| Tabela | O que guarda |
|---|---|
| `planos` | catálogo (Start, Pro, Master) com limites |
| `faturas` | cobrança por clínica |
| `integracoes` | endereço e token das APIs (proposta, transcrição), global ou por clínica |
| `sistema_operadores` | quem é dono do produto e acessa a área `/sistema` |

## As chaves que importam

Três chaves explicam quase todo o comportamento:

- **`empresa_id`** isola clínicas.
- **`wa_number`** é o número de WhatsApp que gerou o registro. A mesma conversa atendida por
  dois números da equipe tem duas linhas; a extensão baixa a empresa inteira e junta por
  `remote_jid`. Gatilhos mantêm as linhas irmãs coerentes.
- **`remote_jid`** identifica a conversa. **Cuidado**: nem sempre é telefone. Ver
  [04-armadilhas.md](04-armadilhas.md).

## Regras de acesso, em português

| Assunto | Quem enxerga |
|---|---|
| Mensagem rápida e pasta | pessoal: só o dono. Da empresa: quem o administrador marcou (todos, departamentos ou pessoas) |
| Anotação e etiqueta do contato | quem registrou, quem divide departamento, e o administrador |
| Agenda | quem marcou, o responsável, e o administrador |
| Ficha do contato | a empresa inteira (é o CRM) |
| Itens do contato | o administrador pode restringir, por contato, notas, interesses, etiquetas e propostas |
| Cobrança | só o dono do produto escreve; a clínica lê as próprias faturas |

## Funções que a extensão chama

Além das consultas normais, a extensão usa estas funções do banco:

| Função | Para quê |
|---|---|
| `criar_empresa_e_admin(empresa, nome, marca)` | criar a própria conta, com teste de sete dias |
| `minhas_fichas(desde)` | as fichas da empresa, com os interesses mascarados quando restritos |
| `minhas_integracoes()` | endereço e token das APIs que valem para esta clínica |
| `registrar_numero(numero, nome)` e `meus_numeros()` | relação pessoa ↔ número conectado |
| `meu_plano()` | recursos e consumo, para a interface |

## Arquivos

Um único depósito, `midias`, com o caminho sempre começando pelo id da empresa:

- mídia das mensagens rápidas: `<empresa>/<arquivo>`
- PDF da proposta: `<empresa>/propostas/<id>.pdf`

A regra de acesso é o prefixo do caminho. A extensão guarda uma cópia local do que baixa.

## Como a sincronização funciona

**Subida.** Cada alteração vira uma operação numa fila (`bc2_outbox`). A fila é processada a
cada ciclo. **Nada é descartado em silêncio**: operação que falha guarda a tentativa e o erro e
tenta de novo, até cinquenta vezes. Isso não é detalhe: a versão anterior descartava erro que
não fosse de rede, e anotações sumiam sem chegar ao servidor.

**Descida.** Leitura incremental por `atualizado_em`, com exclusão lógica.

**Uma sutileza que vale ouro.** Quando o administrador tira a visibilidade de uma pasta, o
servidor simplesmente **para de devolver a linha** — ela não vem marcada como apagada, ela
some. A leitura incremental nunca ficaria sabendo. Por isso, a cada ciclo, a extensão pede a
lista dos ids que ainda enxerga e remove do computador o que saiu. Quem reimplementar o
servidor precisa manter esse comportamento, ou dar outro jeito de avisar.

**Adoção.** No primeiro login de um computador, o acervo local é assumido pela conta (pastas
casam por nome, o que falta é criado). Isso vale **uma vez só**: entrar com conta de outra
empresa limpa o local em vez de adotar. Foi assim que, um dia, uma clínica nasceu com as pastas
da outra.
