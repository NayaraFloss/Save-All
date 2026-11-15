-- =====================================================================
-- SAVE ALL - Remoção do perfil "entregador"
-- A própria loja passa a fazer a entrega: o pedido vai de "No preparo" para
-- "A caminho" e depois "Entregue", sem escolher entregador.
--
-- Rode no pgAdmin (Query Tool), no banco do Save All. Pode rodar de novo sem erro.
-- ATENÇÃO: apaga as contas de entregador e as colunas de entregador dos pedidos
-- (os pedidos em si são mantidos).
-- =====================================================================

-- Encerra alguma transação que tenha ficado com erro antes (evita o erro 25P02)
ROLLBACK;

BEGIN;

-- 1. Pedidos: tira as colunas de entregador (a chave estrangeira, o índice e a regra de nota saem junto)
ALTER TABLE pedidos
  DROP COLUMN IF EXISTS entregador_id,
  DROP COLUMN IF EXISTS nome_entregador,
  DROP COLUMN IF EXISTS tipo_entregador,
  DROP COLUMN IF EXISTS nota_entregador,
  DROP COLUMN IF EXISTS comentario_entregador,
  DROP COLUMN IF EXISTS reclamacao_entregador;

-- 2. Contas de entregador
DELETE FROM usuarios WHERE perfil = 'entregador';

-- 3. O perfil "entregador" deixa de ser aceito
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check
  CHECK (perfil = ANY (ARRAY['cliente', 'loja', 'entidade', 'descarte', 'master']));

COMMIT;

-- Conferência: as duas consultas abaixo devem voltar 0
SELECT count(*) AS entregadores_restantes FROM usuarios WHERE perfil = 'entregador';
SELECT count(*) AS colunas_de_entregador
  FROM information_schema.columns
 WHERE table_name = 'pedidos' AND column_name LIKE '%entregador%';
