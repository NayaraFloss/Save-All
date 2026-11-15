-- =====================================================================
-- SAVE ALL - Inventário completo do banco (somente leitura: não altera nada)
--
-- Como usar no pgAdmin: abra o Query Tool no banco do Save All e execute (F5).
-- O pgAdmin só mostra o resultado da ÚLTIMA consulta, por isso a PARTE 1 é uma
-- consulta única com o relatório inteiro numa grade só (colunas: seção, item, detalhe).
--
-- A PARTE 2 (no fim, dentro de um comentário) tem consultas detalhadas: selecione
-- só o trecho de uma delas com o mouse e aperte F5 para ver a lista completa.
-- =====================================================================

-- Encerra alguma transação que ficou com erro de um script anterior nesta mesma janela
-- (é isso que causa o erro 25P02 "transação atual foi interrompida"). Não desfaz nada
-- que já foi gravado com COMMIT. Se não houver transação aberta, aparece só um aviso.
ROLLBACK;

-- =====================================================================
-- PARTE 1 - RELATÓRIO GERAL (uma grade só)
-- =====================================================================
WITH
-- Conta as linhas de qualquer tabela sem precisar escrever uma consulta para cada uma
tabelas AS (
  SELECT t.table_schema AS esquema, t.table_name AS tabela,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::bigint AS linhas,
         pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)::regclass) AS bytes,
         (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS colunas
    FROM information_schema.tables t
   WHERE t.table_type = 'BASE TABLE' AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
),
-- Executa uma consulta só se a tabela existir (as tabelas novas podem faltar em alguns bancos)
existe AS (
  SELECT nome, to_regclass('public.' || nome) IS NOT NULL AS ok
    FROM unnest(ARRAY['usuarios','lojas','alimentos','pedidos','pedido_itens','entidades_sociais','destinos_descarte',
                      'doacoes','termos_doacao','registros_descarte','transacoes','suporte_chamados','dados_usuario']) AS nome
),
relatorio (ordem, secao, item, detalhe) AS (
  -- 1. Banco
  SELECT 1, '1. Banco', 'Nome do banco', current_database()
  UNION ALL SELECT 1, '1. Banco', 'Versão do PostgreSQL', split_part(version(), ',', 1)
  UNION ALL SELECT 1, '1. Banco', 'Tamanho total', pg_size_pretty(pg_database_size(current_database()))
  UNION ALL SELECT 1, '1. Banco', 'Usuário conectado', current_user
  UNION ALL SELECT 1, '1. Banco', 'Data/hora do servidor', to_char(now(), 'DD/MM/YYYY HH24:MI:SS TZ')
  UNION ALL SELECT 1, '1. Banco', 'Quantidade de tabelas', count(*)::text FROM tabelas

  -- 2. Tabelas com quantidade de registros
  UNION ALL
  SELECT 2, '2. Tabelas', esquema || '.' || tabela,
         linhas || ' registro(s) | ' || colunas || ' coluna(s) | ' || pg_size_pretty(bytes)
    FROM tabelas

  -- 3. Colunas de cada tabela (nome tipo, * = obrigatória)
  UNION ALL
  SELECT 3, '3. Colunas', c.table_name,
         string_agg(c.column_name || ' ' || c.data_type || CASE WHEN c.is_nullable = 'NO' THEN '*' ELSE '' END, ', ' ORDER BY c.ordinal_position)
    FROM information_schema.columns c
   WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
     AND c.table_name IN (SELECT tabela FROM tabelas)
   GROUP BY c.table_name

  -- 4. Chaves primárias, estrangeiras, únicas e regras (CHECK)
  UNION ALL
  SELECT 4, '4. Restrições',
         rel.relname || ' (' || CASE con.contype WHEN 'p' THEN 'chave primária' WHEN 'f' THEN 'chave estrangeira'
                                                 WHEN 'u' THEN 'única' WHEN 'c' THEN 'regra CHECK' ELSE con.contype::text END || ')',
         con.conname || ': ' || pg_get_constraintdef(con.oid)
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND con.contype IN ('p', 'f', 'u', 'c')

  -- 5. Índices
  UNION ALL
  SELECT 5, '5. Índices', tablename || '.' || indexname, indexdef
    FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')

  -- 6. Views, funções, gatilhos e sequências
  UNION ALL
  SELECT 6, '6. Views', table_name, left(regexp_replace(view_definition, '\s+', ' ', 'g'), 300)
    FROM information_schema.views WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT 6, '6. Funções', p.proname || '(' || pg_get_function_arguments(p.oid) || ')', 'retorna ' || pg_get_function_result(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT 6, '6. Gatilhos', event_object_table || '.' || trigger_name, action_timing || ' ' || event_manipulation || ': ' || action_statement
    FROM information_schema.triggers WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT 6, '6. Sequências', sequence_name, 'começa em ' || start_value || ', incremento ' || increment
    FROM information_schema.sequences WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')

  -- 7. Dados do Save All
  UNION ALL
  SELECT 7, '7. Usuários', 'Perfil: ' || perfil,
         count(*) || ' conta(s) | ' || count(*) FILTER (WHERE suspenso) || ' suspensa(s) | ' ||
         count(*) FILTER (WHERE id LIKE 'user-ex-%') || ' de exemplo'
    FROM usuarios GROUP BY perfil
  UNION ALL
  SELECT 7, '7. Lojas', 'Cidade: ' || COALESCE(NULLIF(cidade, ''), '(sem cidade)'),
         count(*) || ' loja(s): ' || string_agg(nome, ', ' ORDER BY nome)
    FROM lojas GROUP BY cidade
  UNION ALL
  SELECT 7, '7. Alimentos', 'Situação: ' || status,
         count(*) || ' item(ns) | ' ||
         count(*) FILTER (WHERE data_validade < CURRENT_DATE) || ' vencido(s) | ' ||
         count(*) FILTER (WHERE data_validade = CURRENT_DATE) || ' vencem hoje | ' ||
         COALESCE(sum(quantidade), 0) || ' unidade(s) em estoque'
    FROM alimentos GROUP BY status
  UNION ALL
  SELECT 7, '7. Alimentos', 'Por categoria: ' || categoria, count(*) || ' item(ns)'
    FROM alimentos GROUP BY categoria
  UNION ALL
  SELECT 7, '7. Pedidos', 'Situação: ' || status,
         count(*) || ' pedido(s) | R$ ' || to_char(COALESCE(sum(total), 0), 'FM999G999G990D00') ||
         ' | último em ' || COALESCE(to_char(max(criado_em), 'DD/MM/YYYY HH24:MI'), '-')
    FROM pedidos GROUP BY status
  UNION ALL
  SELECT 7, '7. Pedidos', 'Avaliações',
         count(*) FILTER (WHERE avaliado_em IS NOT NULL) || ' avaliado(s) | nota média ' ||
         COALESCE(round(avg(nota_comida), 1)::text, '-') || ' | ' ||
         count(*) FILTER (WHERE reclamacao_comida) || ' reclamação(ões)'
    FROM pedidos
  UNION ALL
  SELECT 7, '7. Pedidos', 'Itens de pedido', count(*) || ' linha(s) em pedido_itens' FROM pedido_itens

  -- Coleções novas (só se a tabela existir)
  UNION ALL
  SELECT 7, '7. Coleções', e.nome,
         CASE WHEN NOT e.ok THEN 'TABELA NÃO EXISTE'
              ELSE (xpath('/row/v/text()', query_to_xml(
                     CASE e.nome
                       WHEN 'entidades_sociais' THEN
                         'SELECT COALESCE(sum(n), 0) || '' entidade(s): '' || COALESCE(string_agg(st || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT status_validacao st, count(*) n FROM entidades_sociais GROUP BY 1) x'
                       WHEN 'destinos_descarte' THEN
                         'SELECT COALESCE(sum(n), 0) || '' unidade(s): '' || COALESCE(string_agg(st || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT tipo_tratamento st, count(*) n FROM destinos_descarte GROUP BY 1) x'
                       WHEN 'doacoes' THEN
                         'SELECT COALESCE(sum(n), 0) || '' doação(ões): '' || COALESCE(string_agg(st || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT status st, count(*) n FROM doacoes GROUP BY 1) x'
                       WHEN 'termos_doacao' THEN
                         'SELECT COALESCE(sum(n), 0) || '' termo(s): '' || COALESCE(string_agg(st || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT status st, count(*) n FROM termos_doacao GROUP BY 1) x'
                       WHEN 'transacoes' THEN
                         'SELECT COALESCE(sum(n), 0) || '' transação(ões): '' || COALESCE(string_agg(st || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT tipo || ''/'' || status st, count(*) n FROM transacoes GROUP BY 1) x'
                       WHEN 'suporte_chamados' THEN
                         'SELECT COALESCE(sum(n), 0) || '' chamado(s): '' || COALESCE(string_agg(st || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT COALESCE(dados->>''status'', ''(sem situação)'') st, count(*) n FROM suporte_chamados GROUP BY 1) x'
                       WHEN 'registros_descarte' THEN
                         'SELECT COALESCE(sum(n), 0) || '' descarte(s): '' || COALESCE(string_agg(t || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT tipo_destinacao t, count(*) n FROM registros_descarte GROUP BY 1) x'
                       WHEN 'dados_usuario' THEN
                         'SELECT COALESCE(sum(n), 0) || '' preferência(s) salvas: '' || COALESCE(string_agg(chave || '' = '' || n, '', ''), ''-'') AS v
                            FROM (SELECT chave, count(*) n FROM dados_usuario GROUP BY 1) x'
                       ELSE format('SELECT count(*) || '' registro(s)'' AS v FROM %I', e.nome)
                     END, false, true, '')))[1]::text
         END
    FROM existe e
   WHERE e.nome IN ('entidades_sociais','destinos_descarte','doacoes','termos_doacao','registros_descarte','transacoes','suporte_chamados','dados_usuario')

  -- 8. Verificações
  UNION ALL
  SELECT 8, '8. Verificações', 'Contas de entregador',
         CASE WHEN count(*) = 0 THEN 'OK: nenhuma' ELSE count(*) || ' ainda existem (rode remover_entregadores.sql)' END
    FROM usuarios WHERE perfil = 'entregador'
  UNION ALL
  SELECT 8, '8. Verificações', 'Colunas de entregador em pedidos',
         CASE WHEN count(*) = 0 THEN 'OK: nenhuma' ELSE string_agg(column_name, ', ') || ' (rode remover_entregadores.sql)' END
    FROM information_schema.columns WHERE table_name = 'pedidos' AND column_name LIKE '%entregador%'
  UNION ALL
  SELECT 8, '8. Verificações', 'Tabela ' || nome, CASE WHEN ok THEN 'OK: existe' ELSE 'FALTANDO' END
    FROM existe
  UNION ALL
  SELECT 8, '8. Verificações', 'Coluna extras usada pelo app',
         CASE WHEN count(*) = 4 THEN 'OK: entidades_sociais, destinos_descarte, doacoes, registros_descarte'
              ELSE 'FALTANDO em ' || (4 - count(*)) || ' tabela(s) (rode migracao_sem_localstorage.sql)' END
    FROM information_schema.columns
   WHERE column_name = 'extras' AND table_name IN ('entidades_sociais','destinos_descarte','doacoes','registros_descarte')
  UNION ALL
  SELECT 8, '8. Verificações', 'Colunas de moderação em lojas',
         CASE WHEN count(*) = 2 THEN 'OK: suspenso e motivo_desvinculo' ELSE 'FALTANDO (rode migracao_sem_localstorage.sql)' END
    FROM information_schema.columns WHERE table_name = 'lojas' AND column_name IN ('suspenso', 'motivo_desvinculo')
  UNION ALL
  SELECT 8, '8. Verificações', 'Itens de pedido sem pedido (órfãos)',
         CASE WHEN count(*) = 0 THEN 'OK: nenhum' ELSE count(*) || ' encontrado(s)' END
    FROM pedido_itens pi LEFT JOIN pedidos p ON p.id = pi.pedido_id WHERE p.id IS NULL
  UNION ALL
  SELECT 8, '8. Verificações', 'Lojas sem conta de acesso (só vitrine)',
         CASE WHEN count(*) = 0 THEN 'nenhuma' ELSE count(*) || ' (aparecem para os clientes, mas ninguém entra como essa loja): ' || string_agg(l.nome, ', ') END
    FROM lojas l LEFT JOIN usuarios u ON u.id = l.usuario_id WHERE u.id IS NULL
  UNION ALL
  SELECT 8, '8. Verificações', 'Usuários de loja sem loja',
         CASE WHEN count(*) = 0 THEN 'OK: nenhum' ELSE count(*) || ': ' || string_agg(u.nome, ', ') END
    FROM usuarios u WHERE u.perfil = 'loja' AND NOT EXISTS (SELECT 1 FROM lojas l WHERE l.usuario_id = u.id)
  UNION ALL
  SELECT 8, '8. Verificações', 'E-mails repetidos (ignorando maiúsculas)',
         CASE WHEN count(*) = 0 THEN 'OK: nenhum' ELSE string_agg(e, ', ') END
    FROM (SELECT lower(email) e FROM usuarios GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 8, '8. Verificações', 'Conta master',
         CASE WHEN count(*) = 0 THEN 'FALTANDO: não há usuário master' ELSE count(*) || ' conta(s): ' || string_agg(email, ', ') END
    FROM usuarios WHERE perfil = 'master'
)
SELECT secao AS "Seção", item AS "Item", detalhe AS "Detalhe"
  FROM relatorio
 ORDER BY ordem, secao, item;


-- =====================================================================
-- PARTE 2 - CONSULTAS DETALHADAS
-- Ficam dentro de um comentário para o F5 mostrar só o relatório da PARTE 1.
-- Para usar uma: selecione com o mouse só o texto dela (do SELECT até o ;)
-- e aperte F5.
-- =====================================================================
/*

-- 2.1 Todos os usuários (sem a senha)
SELECT id, nome, email, perfil, pontos, endereco, suspenso, motivo_desvinculo, criado_em
  FROM usuarios
 ORDER BY perfil, nome;

-- 2.2 Lojas com o dono e a quantidade de itens
SELECT l.id, l.nome, l.cidade, l.categoria, l.nota, l.suspenso, u.email AS dono,
       (SELECT count(*) FROM alimentos a WHERE a.loja_id = l.id) AS itens,
       (SELECT count(*) FROM alimentos a WHERE a.loja_id = l.id AND a.status = 'active') AS itens_ativos
  FROM lojas l LEFT JOIN usuarios u ON u.id = l.usuario_id
 ORDER BY l.cidade, l.nome;

-- 2.3 Alimentos com a validade (dias para vencer: negativo = vencido)
SELECT a.id, a.nome, l.nome AS loja, l.cidade, a.categoria, a.status, a.quantidade,
       a.preco_original, a.preco_desconto, a.data_validade, a.data_validade - CURRENT_DATE AS dias_para_vencer
  FROM alimentos a LEFT JOIN lojas l ON l.id = a.loja_id
 ORDER BY dias_para_vencer, l.nome;

-- 2.4 Pedidos com os itens
SELECT p.id, p.criado_em, p.status, p.nome_cliente, p.nome_loja, p.total, p.forma_pagamento,
       string_agg(i.quantidade || 'x ' || i.nome, ', ') AS itens, p.nota_comida, p.reclamacao_comida, p.entregue_em
  FROM pedidos p LEFT JOIN pedido_itens i ON i.pedido_id = p.id
 GROUP BY p.id
 ORDER BY p.criado_em DESC;

-- 2.5 Entidades sociais
SELECT id, nome, cidade, uf, status_validacao, ativo, email, whatsapp, observacoes
  FROM entidades_sociais ORDER BY status_validacao, nome;

-- 2.6 Unidades de descarte
SELECT id, nome, cidade, tipo_tratamento, status_validacao, ativo, email FROM destinos_descarte ORDER BY nome;

-- 2.7 Doações com entidade, alimento e situação do termo
SELECT d.id, l.nome AS loja, e.nome AS entidade, i.nome AS alimento, i.quantidade, i.kg, d.status, t.status AS termo, d.token, d.criado_em
  FROM doacoes d LEFT JOIN lojas l ON l.id = d.loja_id LEFT JOIN entidades_sociais e ON e.id = d.entidade_id
  LEFT JOIN termos_doacao t ON t.doacao_id = d.id LEFT JOIN transacao_itens i ON i.transacao_id = d.transacao_id
 ORDER BY d.criado_em DESC;

-- 2.8 Descartes
SELECT r.id, l.nome AS loja, r.descricao_item, r.quantidade, r.kg, r.tipo_destinacao, dd.nome AS destino, r.criado_em
  FROM registros_descarte r LEFT JOIN lojas l ON l.id = r.loja_id LEFT JOIN destinos_descarte dd ON dd.id = r.destino_id
 ORDER BY r.criado_em DESC;

-- 2.9 Relatório mensal (view do banco) e chamados de suporte
SELECT * FROM visao_relatorio_mensal ORDER BY mes DESC, loja_id, tipo;
SELECT id, dados->>'userName' AS usuario, dados->>'subject' AS assunto, dados->>'status' AS situacao, criado_em
  FROM suporte_chamados ORDER BY criado_em DESC;

-- 2.10 Estrutura completa de todas as colunas (uma linha por coluna)
SELECT table_name AS tabela, ordinal_position AS posicao, column_name AS coluna, data_type AS tipo,
       is_nullable AS aceita_nulo, column_default AS valor_padrao
  FROM information_schema.columns
 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY table_name, ordinal_position;
*/
