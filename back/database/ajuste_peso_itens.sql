-- =====================================================================
-- SAVE ALL - Peso da unidade dos itens
-- O app passa a gravar o peso em alimentos.peso_unitario_kg, a coluna usada
-- pelas funções do banco no cálculo de kg, CO2 e água. Se houver pesos já
-- gravados na coluna antiga peso_kg, eles são copiados.
-- Rode no pgAdmin (Query Tool). Pode rodar de novo sem erro.
-- =====================================================================
ROLLBACK;
BEGIN;
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS peso_unitario_kg NUMERIC;
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS peso_kg NUMERIC;
UPDATE alimentos SET peso_unitario_kg = peso_kg
 WHERE peso_unitario_kg IS NULL AND peso_kg IS NOT NULL;
COMMIT;

-- Conferência: itens e o peso de cada unidade
SELECT a.nome, l.nome AS loja, a.quantidade, a.peso_unitario_kg AS peso_unidade_kg,
       round(a.quantidade * a.peso_unitario_kg, 3) AS peso_total_kg
  FROM alimentos a JOIN lojas l ON l.id = a.loja_id
 ORDER BY l.nome, a.nome;
