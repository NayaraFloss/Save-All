-- =====================================================================
-- SAVE ALL - Deixa o sistema só com as cidades atendidas:
--   Pinhalzinho, Saudades, Nova Erechim e Chapecó (SC)
-- Lojas, entidades sociais, destinos de descarte e endereços de outras cidades
-- são movidos para uma dessas:
--   Florianópolis -> Saudades | Porto Alegre -> Nova Erechim | São Paulo -> Chapecó
--   qualquer outra cidade -> Pinhalzinho
-- Rode no pgAdmin (Query Tool). Pode rodar de novo sem erro.
-- =====================================================================
ROLLBACK;
BEGIN;

-- "Chapecó, SC" -> "chapeco" (sem acento, minúsculo, só o nome)
CREATE OR REPLACE FUNCTION pg_temp.norm(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(trim(split_part(COALESCE(t, ''), ',', 1))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;
CREATE OR REPLACE FUNCTION pg_temp.atendida(t TEXT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT pg_temp.norm(t) IN ('pinhalzinho', 'saudades', 'nova erechim', 'chapeco')
$$;
-- Cidade nova para uma cidade não atendida
CREATE OR REPLACE FUNCTION pg_temp.nova(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE pg_temp.norm(t)
           WHEN 'florianopolis' THEN 'Saudades'
           WHEN 'porto alegre'  THEN 'Nova Erechim'
           WHEN 'sao paulo'     THEN 'Chapecó'
           ELSE 'Pinhalzinho'
         END
$$;
-- Troca "Cidade/UF" (ou "Cidade - UF", "Cidade, UF") no fim do endereço
CREATE OR REPLACE FUNCTION pg_temp.trocar_endereco(endereco TEXT, antiga TEXT, nova TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN endereco IS NULL OR antiga IS NULL OR trim(antiga) = '' THEN endereco
           ELSE regexp_replace(endereco, trim(split_part(antiga, ',', 1)) || '\s*[/,-]\s*[A-Za-z]{2}\s*$', nova || '/SC', 'i')
         END
$$;

-- Lojas: cidade e endereço (lojas sem cidade continuam sendo tratadas pelo endereço)
UPDATE lojas
   SET endereco = pg_temp.trocar_endereco(endereco, cidade, pg_temp.nova(cidade)),
       cidade   = pg_temp.nova(cidade) || ', SC'
 WHERE cidade IS NOT NULL AND trim(cidade) <> '' AND NOT pg_temp.atendida(cidade);

-- Endereço dos donos das lojas e dos demais usuários que citam essas cidades
UPDATE usuarios u
   SET endereco = regexp_replace(u.endereco, m.antiga || '\s*[/,-]\s*[A-Za-z]{2}', m.nova || '/SC', 'gi')
  FROM (VALUES ('Florianópolis', 'Saudades'), ('Porto Alegre', 'Nova Erechim'), ('São Paulo', 'Chapecó')) AS m(antiga, nova)
 WHERE u.endereco ~* m.antiga;

-- Entidades sociais e destinos de descarte
UPDATE entidades_sociais SET cidade = pg_temp.nova(cidade), uf = 'SC' WHERE NOT pg_temp.atendida(cidade);
UPDATE destinos_descarte SET cidade = pg_temp.nova(cidade), uf = 'SC' WHERE NOT pg_temp.atendida(cidade);

-- Cidade escolhida pelos clientes (preferências)
UPDATE dados_usuario
   SET valor = jsonb_set(valor, '{cidade}', to_jsonb(pg_temp.nova(valor->>'cidade') || ', SC'))
 WHERE chave = 'preferencias' AND valor ? 'cidade' AND NOT pg_temp.atendida(valor->>'cidade');
UPDATE usuarios
   SET extras = jsonb_set(extras, '{cidadePreferida}', to_jsonb(pg_temp.nova(extras->>'cidadePreferida') || ', SC'))
 WHERE extras ? 'cidadePreferida' AND NOT pg_temp.atendida(extras->>'cidadePreferida');

COMMIT;

-- Conferência: quantas lojas, entidades e destinos ficaram em cada cidade
SELECT 'Lojas' AS tipo, cidade, count(*) FROM lojas GROUP BY cidade
UNION ALL SELECT 'Entidades', cidade || ', ' || trim(uf), count(*) FROM entidades_sociais GROUP BY 2
UNION ALL SELECT 'Destinos de descarte', cidade || ', ' || trim(uf), count(*) FROM destinos_descarte GROUP BY 2
ORDER BY 1, 2;
