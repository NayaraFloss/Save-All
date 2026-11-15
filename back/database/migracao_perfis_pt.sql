-- =====================================================================
-- Save All: troca os nomes dos perfis para português
--   client -> cliente      store -> loja        driver -> entregador
--   institution -> entidade   disposal -> descarte   master -> master
-- Rode UMA vez no Query Tool do pgAdmin, dentro do banco do projeto.
-- É seguro rodar de novo: se já estiver em português, nada muda.
-- =====================================================================

-- (Opcional) Antes de rodar, veja se existe outra coluna com nome de perfil:
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND column_name ILIKE '%perfil%';

BEGIN;

-- 1) Remove a(s) regra(s) CHECK antiga(s) que limitam os valores de perfil
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%perfil%'
  LOOP
    EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2) Converte os valores
UPDATE usuarios SET perfil = CASE perfil
  WHEN 'client'      THEN 'cliente'
  WHEN 'store'       THEN 'loja'
  WHEN 'driver'      THEN 'entregador'
  WHEN 'institution' THEN 'entidade'
  WHEN 'entity'      THEN 'entidade'
  WHEN 'disposal'    THEN 'descarte'
  ELSE perfil END;

-- 3) Nova regra e valor padrão em português
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check
  CHECK (perfil IN ('cliente','loja','entregador','entidade','descarte','master'));
ALTER TABLE usuarios ALTER COLUMN perfil SET DEFAULT 'cliente';

COMMIT;

-- Conferência
SELECT perfil, count(*) AS quantidade FROM usuarios GROUP BY perfil ORDER BY perfil;
