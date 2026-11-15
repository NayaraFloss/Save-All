-- Controle de estoque por lote (data de validade).
-- Rode UMA vez no pgAdmin (Query Tool) no mesmo banco da aplicação.
-- É seguro rodar de novo: usa IF NOT EXISTS e só cria lote para item que ainda não tem.

BEGIN;

-- Cada linha = um lote de um item (ex.: pão de queijo, 20 un., vence 13/11).
CREATE TABLE IF NOT EXISTS alimento_lotes (
  id              BIGSERIAL PRIMARY KEY,
  alimento_id     TEXT    NOT NULL REFERENCES alimentos(id) ON DELETE CASCADE,
  quantidade      INTEGER NOT NULL CHECK (quantidade >= 0),
  data_fabricacao DATE,
  data_validade   DATE    NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alimento_lotes_alimento ON alimento_lotes (alimento_id, data_validade);

-- De qual(is) lote(s) saiu cada item de um pedido (para devolver ao estoque se o pedido for cancelado).
CREATE TABLE IF NOT EXISTS pedido_item_lotes (
  id              BIGSERIAL PRIMARY KEY,
  pedido_id       TEXT    NOT NULL,
  alimento_id     TEXT    NOT NULL,
  data_fabricacao DATE,
  data_validade   DATE    NOT NULL,
  quantidade      INTEGER NOT NULL CHECK (quantidade > 0)
);
CREATE INDEX IF NOT EXISTS idx_pedido_item_lotes_pedido ON pedido_item_lotes (pedido_id);

-- Itens que já existem viram um lote único (com o estoque e a validade que têm hoje).
INSERT INTO alimento_lotes (alimento_id, quantidade, data_fabricacao, data_validade)
SELECT a.id, a.quantidade, a.data_fabricacao, a.data_validade
  FROM alimentos a
 WHERE a.quantidade > 0
   AND a.data_validade IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM alimento_lotes l WHERE l.alimento_id = a.id);

COMMIT;
