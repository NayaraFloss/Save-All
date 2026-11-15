-- =====================================================================
-- SAVE ALL - Ajustes do banco para o app sem localStorage
--
-- Usa as tabelas que o banco JÁ TEM (entidades_sociais, destinos_descarte, doacoes,
-- termos_doacao, assinaturas_termo, registros_descarte, transacoes...) e só acrescenta:
--   - coluna "extras" (jsonb) nas tabelas do app, para campos de tela sem coluna própria;
--   - moderação de lojas (suspenso / motivo_desvinculo);
--   - tabelas novas: dados_usuario (preferências) e suporte_chamados (central de suporte).
-- Rode no pgAdmin (Query Tool), no banco do Save All. Pode rodar de novo sem erro.
-- =====================================================================

-- Encerra alguma transação que tenha ficado com erro antes (evita o erro 25P02)
ROLLBACK;

BEGIN;

-- Moderação de estabelecimentos pelo painel master
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS suspenso BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS motivo_desvinculo TEXT;

-- Campos de tela que não têm coluna própria (ex.: situação de seleção, assinatura da entidade)
ALTER TABLE entidades_sociais  ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE destinos_descarte  ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doacoes            ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE registros_descarte ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Preferências e estado de tela de cada usuário
-- (modo escuro, cidade, notificações, mensagens lidas, rodízio do sorteio, avisos fechados)
CREATE TABLE IF NOT EXISTS dados_usuario (
  usuario_id    TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chave         TEXT NOT NULL,
  valor         JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, chave)
);

-- Central de suporte (cada usuário vê os seus; o master vê todos)
CREATE TABLE IF NOT EXISTS suporte_chamados (
  id            TEXT PRIMARY KEY,
  dados         JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por    TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Correção: a view de impacto do consumidor filtrava perfil = 'client', mas no banco o
-- perfil é gravado como 'cliente' (por isso ela sempre voltava vazia).
CREATE OR REPLACE VIEW visao_impacto_consumidor AS
 SELECT u.id AS usuario_id,
    count(t.id) AS compras,
    COALESCE(sum(t.kg), (0)::numeric) AS kg_salvos,
    u.valor_economizado AS economia
   FROM usuarios u
     LEFT JOIN transacoes t ON t.usuario_id = u.id AND t.tipo = 'venda' AND t.status <> 'cancelada'
  WHERE u.perfil = 'cliente'
  GROUP BY u.id, u.valor_economizado;

COMMIT;

-- Conferência: deve listar as 4 colunas extras e as 2 tabelas novas
SELECT table_name, column_name FROM information_schema.columns
 WHERE (column_name = 'extras' AND table_name IN ('entidades_sociais','destinos_descarte','doacoes','registros_descarte'))
    OR table_name IN ('dados_usuario','suporte_chamados') AND column_name IN ('usuario_id','id')
 ORDER BY 1;
