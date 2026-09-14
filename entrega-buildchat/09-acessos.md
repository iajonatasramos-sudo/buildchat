# 9. Acessos e segredos

**Nenhuma senha, chave ou token está nesta pasta, e não deve passar a estar.** Este documento
lista o que pedir ao Jonatas e para que serve cada coisa.

## O que pedir

| Acesso | Para quê | Onde se usa |
|---|---|---|
| Projeto Supabase (convite de membro) | banco, login e arquivos do BuildChat | painel do Supabase |
| Senha do banco | aplicar migrações e consultar direto | variável `DATABASE_URL` dos scripts |
| Repositório no GitHub | o código | `iajonatasramos-sudo/buildchat` |
| Dokploy | onde o painel é publicado | deploy do painel |
| DNS de `chat.buildclinic.com.br` | apontar o painel | provedor de domínio |
| Token da API de proposta e transcrição | gerar PDF e transcrever | cadastrado em `/sistema/api`, não fica no código |
| Conta de dono do produto | acessar a área `/sistema` | tabela `sistema_operadores` |

## O que é público e pode ficar no código

As credenciais do Supabase que a extensão carrega (endereço do projeto e a chave anônima) são
**públicas por natureza**: elas só abrem o que as regras de linha permitirem. Estão em
`src/lib/config.ts` e nas variáveis do painel.

A chave de serviço do Supabase, que ignora todas as regras, **nunca** entrou neste projeto e
não deve entrar. O painel é cliente do mesmo banco que a extensão, com as mesmas regras.

## Uma recomendação de segurança

A senha do banco foi usada, durante o desenvolvimento, na linha de comando e em variáveis de
ambiente. Vale trocá-la ao assumir o projeto, e trocar também a senha do administrador mestre.
Não custa nada e fecha a porta.

## Comandos que pedem a senha do banco

```bash
# aplica todas as migrações, em ordem, de forma repetível
cd server && DATABASE_URL='postgresql://…' node scripts/aplicar-migracoes.mjs

# cadastra alguém como dono do produto
DATABASE_URL='postgresql://…' node scripts/definir-operador.mjs email@dominio "Nome"
```

A suíte de testes **não** precisa de senha nenhuma: ela sobe um Postgres próprio, em memória.

```bash
cd server && npm test
```
