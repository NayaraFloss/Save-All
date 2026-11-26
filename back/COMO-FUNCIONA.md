# Como o back-end (API) do Save All funciona

Todos os arquivos desta pasta têm um comentário acima de cada linha explicando o que ela faz.
O código em si NÃO foi alterado: só foram adicionados comentários (dá para substituir os originais com segurança).

## O caminho de uma requisição

1. `src/servidor.js` liga a API numa porta e testa o banco.
2. `src/app.js` aplica as proteções (Helmet, CORS, limite de 10 MB, sem cache).
3. `src/rotas/index.js` olha o endereço pedido (ex.: `POST /v1/auth/login`) e escolhe a função certa.
4. No caminho, os "porteiros" de `src/middlewares/auth.js` conferem se a pessoa está logada e se tem o perfil certo.
5. A função em `src/controladores/...` faz o trabalho e consulta o banco via `src/config/db.js`.
6. Se algo der errado, `src/middlewares/erros.js` devolve uma mensagem `{ message }` para o front.

## O que cada pasta faz

- `config/` — lê o `.env` e conecta no PostgreSQL.
- `middlewares/` — login/sessão (cookie com token JWT) e tratamento de erros.
- `rotas/` — lista de todos os endereços da API.
- `controladores/` — a lógica de cada rota (login, cadastro, lojas, pedidos...).
- `utils/` — ferramentas: validação, criptografia, tradução banco ↔ front, checagem de duplicados.
- `scripts/` — comandos de manutenção rodados no terminal (criar banco, trocar senha, criptografar).

## Palavras que aparecem muito

- **async / await**: "espere esta tarefa demorada (ex.: consulta ao banco) terminar antes de seguir".
- **$1, $2...** no SQL: lugares onde entram os valores; evita o ataque chamado SQL Injection.
- **transação**: várias gravações "tudo ou nada".
- **hash (bcrypt)**: embaralhamento sem volta usado para guardar senhas.
- **JWT**: crachá digital assinado que prova quem está logado.
- Comentários `-- ...` dentro dos textos SQL são comentários do próprio PostgreSQL e não mudam a consulta.
