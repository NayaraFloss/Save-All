-- =====================================================================
--  SAVE ALL  |  Script do banco de dados (PostgreSQL 13+)
-- =====================================================================
--  COMO USAR NO pgAdmin
--  1) Botão direito em "Databases" > Create > Database...  nome: saveall
--     (encoding UTF8)
--  2) Clique em "saveall" > menu Tools > Query Tool
--  3) Abra este arquivo (ícone de pasta) e execute tudo (F5)
--
--  O script pode ser executado mais de uma vez: as tabelas só são criadas
--  se não existirem, as colunas novas só são acrescentadas se faltarem e os
--  dados de demonstração só entram se o banco estiver vazio.
--
--  Versão 2: inclui os campos do artigo (TCC 1) — faixa de desconto, entidade
--  social completa, transações com kg, doação com termo e assinaturas e
--  descarte. Quem já rodou a versão 1 pode rodar este arquivo por cima:
--  nada é apagado.
--
--  Contas de demonstração (entram só se o banco estiver vazio)
--    camila@email.com (cliente) | store@email.com (loja) | marcos@email.com e
--    carlos@email.com (entregadores) | entidade@email.com | descarte@email.com |
--    admin@saveall.com ou "admin" (master)
--  As senhas NÃO estão neste arquivo (só o hash). Elas foram entregues à parte.
--  Para trocar a senha de qualquer conta, no back-end:
--    npm run senha:definir -- camila@email.com
--  Em PRODUÇÃO, apague os usuários de demonstração (ou nem execute os blocos
--  "DADOS DE DEMONSTRAÇÃO" abaixo) e crie suas próprias contas.
-- =====================================================================

-- Para apagar TUDO e recriar do zero, remova os "--" das linhas abaixo:
-- DROP VIEW IF EXISTS visao_impacto_consumidor, visao_relatorio_mensal, visao_dashboard_impacto, visao_alimentos_desconto;
-- DROP TABLE IF EXISTS assinaturas_termo, termos_doacao, doacoes, registros_descarte, transacao_itens, transacoes,
--   destinos_descarte, entidades_sociais, faixas_desconto, limites_faixa_desconto, parametros_plataforma,
--   pedido_itens, pedidos, alimentos, lojas, usuarios CASCADE;
-- DROP SEQUENCE IF EXISTS seq_pedido, seq_doacao, seq_termo, seq_descarte;
-- DROP FUNCTION IF EXISTS set_atualizado_em() CASCADE;

-- ---------------------------------------------------------------------
--  Função/trigger que mantém "atualizado_em" sempre correto
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_atualizado_em() RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
--  USUÁRIOS  (clientes, lojas, entregadores, entidades, descarte, master)
--  Os campos específicos de cada perfil (tipo de entregador, certificado
--  digital, licença ambiental etc.) ficam em "extras" (JSONB).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                 TEXT PRIMARY KEY,
  id_numerico        INTEGER GENERATED ALWAYS AS IDENTITY UNIQUE,
  nome               TEXT          NOT NULL,
  email              TEXT          NOT NULL,
  senha_hash         TEXT          NOT NULL,
  perfil             TEXT          NOT NULL
                     CHECK (perfil IN ('client','store','driver','institution','disposal','master')),
  pontos             INTEGER       NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  valor_economizado  NUMERIC(12,2) NOT NULL DEFAULT 0,
  lucro_acumulado    NUMERIC(12,2) NOT NULL DEFAULT 0,
  avatar_url         TEXT,
  endereco           TEXT,
  cpf_cnpj           TEXT,
  data_nascimento    DATE,
  termos_aceitos     BOOLEAN       NOT NULL DEFAULT FALSE,
  verificado         BOOLEAN       NOT NULL DEFAULT FALSE,
  nota               NUMERIC(2,1)  CHECK (nota IS NULL OR (nota >= 0 AND nota <= 5)),
  qtd_avaliacoes     INTEGER       NOT NULL DEFAULT 0,
  qtd_reclamacoes    INTEGER       NOT NULL DEFAULT 0,
  suspenso           BOOLEAN       NOT NULL DEFAULT FALSE,
  motivo_desvinculo  TEXT,
  extras             JSONB         NOT NULL DEFAULT '{}'::jsonb,
  criado_em          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (lower(email));
CREATE INDEX IF NOT EXISTS ix_usuarios_perfil ON usuarios (perfil);

DROP TRIGGER IF EXISTS trg_usuarios_atualizado ON usuarios;
CREATE TRIGGER trg_usuarios_atualizado BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ---------------------------------------------------------------------
--  LOJAS (estabelecimentos que aparecem na lista para os clientes)
--  usuario_id liga a loja ao usuário "store" que a administra.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lojas (
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  nome        TEXT         NOT NULL,
  logo        TEXT,
  categoria   TEXT         NOT NULL DEFAULT 'Padaria',
  nota        NUMERIC(2,1) NOT NULL DEFAULT 5 CHECK (nota >= 0 AND nota <= 5),
  endereco    TEXT,
  cidade      TEXT,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lojas_usuario ON lojas (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_lojas_cidade ON lojas (cidade);

-- ---------------------------------------------------------------------
--  ALIMENTOS (excedentes anunciados pelas lojas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alimentos (
  id               TEXT PRIMARY KEY,
  loja_id          TEXT          NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  nome             TEXT          NOT NULL,
  categoria        TEXT          NOT NULL,
  data_fabricacao  DATE,
  data_validade    DATE,
  preco_original   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_original >= 0),
  preco_desconto   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco_desconto >= 0),
  imagem           TEXT,
  status           TEXT          NOT NULL DEFAULT 'active',
  descricao        TEXT,
  quantidade       INTEGER       NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
  extras           JSONB         NOT NULL DEFAULT '{}'::jsonb,
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_alimentos_loja ON alimentos (loja_id);
CREATE INDEX IF NOT EXISTS ix_alimentos_categoria ON alimentos (categoria);
CREATE INDEX IF NOT EXISTS ix_alimentos_status ON alimentos (status);

DROP TRIGGER IF EXISTS trg_alimentos_atualizado ON alimentos;
CREATE TRIGGER trg_alimentos_atualizado BEFORE UPDATE ON alimentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ---------------------------------------------------------------------
--  PEDIDOS  (status: pending > accepted > preparing > delivery > delivered)
--  Os nomes (cliente, loja, entregador) ficam copiados no pedido para
--  preservar o histórico mesmo que o cadastro mude.
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_pedido START 1000;

CREATE TABLE IF NOT EXISTS pedidos (
  id                     TEXT PRIMARY KEY DEFAULT ('order-' || nextval('seq_pedido')),
  cliente_id             TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_cliente           TEXT,
  loja_id                TEXT REFERENCES lojas(id) ON DELETE SET NULL,
  nome_loja              TEXT,
  entregador_id          TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_entregador        TEXT,
  tipo_entregador        TEXT,
  subtotal               NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxa_entrega           NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto_pontos        NUMERIC(10,2) NOT NULL DEFAULT 0,
  pontos_usados          INTEGER       NOT NULL DEFAULT 0 CHECK (pontos_usados >= 0),
  total                  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  forma_pagamento        TEXT,
  status                 TEXT          NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','preparing','delivery','delivered','cancelled')),
  endereco               TEXT,
  nota_comida            SMALLINT CHECK (nota_comida BETWEEN 1 AND 5),
  comentario_comida      TEXT,
  nota_entregador        SMALLINT CHECK (nota_entregador BETWEEN 1 AND 5),
  comentario_entregador  TEXT,
  reclamacao_comida      BOOLEAN       NOT NULL DEFAULT FALSE,
  reclamacao_entregador  BOOLEAN       NOT NULL DEFAULT FALSE,
  avaliado_em            TIMESTAMPTZ,
  entregue_em            TIMESTAMPTZ,
  extras                 JSONB         NOT NULL DEFAULT '{}'::jsonb,
  criado_em              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pedidos_cliente ON pedidos (cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_loja ON pedidos (loja_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_entregador ON pedidos (entregador_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_status ON pedidos (status);

DROP TRIGGER IF EXISTS trg_pedidos_atualizado ON pedidos;
CREATE TRIGGER trg_pedidos_atualizado BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE IF NOT EXISTS pedido_itens (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id   TEXT          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  alimento_id TEXT,                         -- sem FK: o alimento pode ser removido depois
  nome        TEXT          NOT NULL,
  quantidade  INTEGER       NOT NULL CHECK (quantidade > 0),
  preco       NUMERIC(10,2) NOT NULL CHECK (preco >= 0)
);
CREATE INDEX IF NOT EXISTS ix_pedido_itens_pedido ON pedido_itens (pedido_id);

-- =====================================================================
--  ATUALIZAÇÃO v2: campos exigidos pelo artigo (TCC 1, seções 7.2 a 7.5)
--  Seguro para rodar sobre um banco que já tinha a versão anterior.
--
--  Artigo 7.4 (dados armazenados)               ->  onde ficou
--  ------------------------------------------------------------------
--  Estabelecimento: razão social, CNPJ, endereço ->  lojas (razao_social, cnpj, endereco)
--  Produto: categoria, quantidade, fabricação,
--           validade, preço original              ->  alimentos (já existia)
--  Produto: faixa de desconto                     ->  faixas_desconto + visao_alimentos_desconto
--  Entidade social: nome, CNPJ, endereço, tipo
--           de organização, responsável legal     ->  entidades_sociais
--  Transações: venda, doação, descarte, data,
--           hora, volume (kg)                     ->  transacoes + transacao_itens
--  Doação: termo com itens, quantidade, data,
--           hora, entidade e assinaturas          ->  doacoes + termos_doacao + assinaturas_termo
--  Descarte: quantidade e destinação              ->  registros_descarte + destinos_descarte
--  Relatório mensal / dashboard (RN06, RF10)      ->  visao_relatorio_mensal, visao_dashboard_impacto
-- =====================================================================

-- ---- Usuário: contato (diagrama de classes do TCC 2: Usuario.Contato)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone TEXT;

-- ---- Estabelecimento: razão social e CNPJ próprios (artigo 7.4)
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS cnpj         TEXT;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS telefone     TEXT;
-- Pix removido da plataforma: elimina a coluna da taxa em bancos já criados
ALTER TABLE pedidos DROP COLUMN IF EXISTS taxa_pix;
CREATE UNIQUE INDEX IF NOT EXISTS ux_lojas_cnpj ON lojas (cnpj) WHERE cnpj IS NOT NULL;

-- ---- Produto: peso por unidade (base do volume em kg das transações)
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS peso_unitario_kg NUMERIC(8,3)
  CHECK (peso_unitario_kg IS NULL OR peso_unitario_kg > 0);

-- ---------------------------------------------------------------------
--  Parâmetros da plataforma usados nos cálculos de impacto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametros_plataforma (
  chave      TEXT PRIMARY KEY,
  valor      NUMERIC NOT NULL,
  descricao  TEXT    NOT NULL
);
INSERT INTO parametros_plataforma (chave, valor, descricao) VALUES
  ('co2_evitado_kg_por_kg',       2.5,  'kg de CO2 evitados por kg de alimento desviado do descarte (fator adotado no protótipo; cite a fonte no TCC)'),
  ('peso_minimo_estimado_kg',     0.35, 'Peso mínimo por unidade quando o produto não informa peso_unitario_kg'),
  ('fracao_preco_peso_estimado',  0.1,  'Sem peso informado: kg por unidade estimados = preço x esta fração (nunca abaixo do mínimo)')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------
--  FAIXAS DE DESCONTO (artigo 7.3 / RN01 / RN02)
--  limites_faixa_desconto: o que a PLATAFORMA define (faixas e percentuais permitidos)
--  faixas_desconto:        o que cada ESTABELECIMENTO configura, dentro desses limites
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS limites_faixa_desconto (
  faixa                SMALLINT PRIMARY KEY CHECK (faixa BETWEEN 1 AND 3),
  nome                 TEXT     NOT NULL,
  prazo_consumido_min  SMALLINT NOT NULL,   -- % do prazo de validade já consumido em que a faixa começa
  prazo_consumido_max  SMALLINT NOT NULL,
  desconto_min         SMALLINT NOT NULL,   -- % de desconto mínimo que o estabelecimento pode configurar
  desconto_max         SMALLINT NOT NULL,   -- % de desconto máximo
  desconto_padrao      SMALLINT NOT NULL,
  CHECK (prazo_consumido_min < prazo_consumido_max),
  CHECK (desconto_min <= desconto_padrao AND desconto_padrao <= desconto_max)
);
INSERT INTO limites_faixa_desconto (faixa, nome, prazo_consumido_min, prazo_consumido_max, desconto_min, desconto_max, desconto_padrao) VALUES
  (1, 'Faixa 1 - Atenção', 50, 69,  5, 20, 10),
  (2, 'Faixa 2 - Alerta',  70, 89, 15, 40, 25),
  (3, 'Faixa 3 - Crítico', 90, 99, 30, 70, 50)
ON CONFLICT (faixa) DO NOTHING;

CREATE TABLE IF NOT EXISTS faixas_desconto (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loja_id        TEXT        NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  faixa          SMALLINT    NOT NULL REFERENCES limites_faixa_desconto(faixa),
  desconto_atual SMALLINT    NOT NULL CHECK (desconto_atual BETWEEN 0 AND 100),
  ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loja_id, faixa)
);

-- RN02: o estabelecimento só configura percentuais dentro dos limites da plataforma.
CREATE OR REPLACE FUNCTION fn_faixa_dentro_dos_limites() RETURNS trigger AS $$
DECLARE lim limites_faixa_desconto%ROWTYPE;
BEGIN
  SELECT * INTO lim FROM limites_faixa_desconto WHERE faixa = NEW.faixa;
  IF NEW.desconto_atual < lim.desconto_min OR NEW.desconto_atual > lim.desconto_max THEN
    RAISE EXCEPTION 'Desconto da % deve ficar entre % e % por cento (RN02).', lim.nome, lim.desconto_min, lim.desconto_max
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faixas_limites ON faixas_desconto;
CREATE TRIGGER trg_faixas_limites BEFORE INSERT OR UPDATE ON faixas_desconto
  FOR EACH ROW EXECUTE FUNCTION fn_faixa_dentro_dos_limites();

DROP TRIGGER IF EXISTS trg_faixas_atualizado ON faixas_desconto;
CREATE TRIGGER trg_faixas_atualizado BEFORE UPDATE ON faixas_desconto
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Toda loja nova já nasce com as 3 faixas nos percentuais padrão.
CREATE OR REPLACE FUNCTION fn_loja_faixas_padrao() RETURNS trigger AS $$
BEGIN
  INSERT INTO faixas_desconto (loja_id, faixa, desconto_atual)
  SELECT NEW.id, faixa, desconto_padrao FROM limites_faixa_desconto
  ON CONFLICT (loja_id, faixa) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lojas_faixas_padrao ON lojas;
CREATE TRIGGER trg_lojas_faixas_padrao AFTER INSERT ON lojas
  FOR EACH ROW EXECUTE FUNCTION fn_loja_faixas_padrao();

-- Lojas que já existiam ganham as faixas padrão.
INSERT INTO faixas_desconto (loja_id, faixa, desconto_atual)
SELECT l.id, f.faixa, f.desconto_padrao FROM lojas l CROSS JOIN limites_faixa_desconto f
ON CONFLICT (loja_id, faixa) DO NOTHING;

-- Lojas novas com usuário responsável herdam razão social e CNPJ do cadastro dele.
-- Se o CNPJ já estiver em outra loja, ele não é copiado (o cadastro não falha por causa disso).
CREATE OR REPLACE FUNCTION fn_loja_dados_cadastrais() RETURNS trigger AS $$
DECLARE v_nome TEXT; v_doc TEXT;
BEGIN
  IF NEW.usuario_id IS NOT NULL AND (NEW.razao_social IS NULL OR NEW.cnpj IS NULL) THEN
    SELECT nome, cpf_cnpj INTO v_nome, v_doc FROM usuarios WHERE id = NEW.usuario_id;
    NEW.razao_social := COALESCE(NEW.razao_social, v_nome);
    IF NEW.cnpj IS NULL AND v_doc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lojas WHERE cnpj = v_doc) THEN
      NEW.cnpj := v_doc;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lojas_dados_cadastrais ON lojas;
CREATE TRIGGER trg_lojas_dados_cadastrais BEFORE INSERT ON lojas
  FOR EACH ROW EXECUTE FUNCTION fn_loja_dados_cadastrais();

-- Razão social e CNPJ das lojas que já existiam e têm usuário responsável (copiados do cadastro dele).
UPDATE lojas l SET razao_social = COALESCE(l.razao_social, u.nome), cnpj = COALESCE(l.cnpj, u.cpf_cnpj)
  FROM usuarios u
 WHERE l.usuario_id = u.id AND u.perfil = 'store' AND (l.razao_social IS NULL OR l.cnpj IS NULL)
   AND (u.cpf_cnpj IS NULL OR l.cnpj IS NOT NULL OR NOT EXISTS (SELECT 1 FROM lojas o WHERE o.cnpj = u.cpf_cnpj));

-- RF03: desconto calculado automaticamente pelo prazo restante (RN01).
-- % consumido = (hoje - fabricação) / (validade - fabricação). Usa a faixa mais alta já atingida
-- e o percentual que a loja configurou (ou o padrão da plataforma, se a faixa estiver sem configuração).
-- Migração: remove as views com os nomes antigos (vw_*) antes de criar as novas (visao_*).
DROP VIEW IF EXISTS vw_alimentos_desconto, vw_dashboard_impacto, vw_relatorio_mensal, vw_impacto_consumidor;

CREATE OR REPLACE VIEW visao_alimentos_desconto AS
WITH base AS (
  SELECT a.*,
         -- A validade vai até o fim do dia informado; fabricação e validade no mesmo dia são aceitas (prazo de 24h).
         CASE WHEN a.data_fabricacao IS NULL OR a.data_validade IS NULL OR a.data_validade < a.data_fabricacao THEN 0
              ELSE ROUND(GREATEST(0, EXTRACT(EPOCH FROM (now() - a.data_fabricacao::timestamp)))::numeric
                         / EXTRACT(EPOCH FROM ((a.data_validade + 1)::timestamp - a.data_fabricacao::timestamp)) * 100, 1)
         END AS pct,
         -- RN: produto feito e vencendo no mesmo dia (mais fresco) tem desconto fixo de 50%.
         (a.data_fabricacao IS NOT NULL AND a.data_fabricacao = a.data_validade) AS mesmo_dia
    FROM alimentos a
)
SELECT b.id AS alimento_id, b.loja_id, b.nome, b.categoria, b.quantidade,
       b.data_fabricacao, b.data_validade, b.preco_original,
       b.preco_desconto AS preco_praticado,
       b.pct AS percentual_prazo_consumido,
       CASE WHEN b.mesmo_dia THEN 3 ELSE COALESCE(fx.faixa, 0) END AS faixa,
       CASE WHEN b.mesmo_dia THEN 50 WHEN fx.faixa IS NULL OR f.ativo = FALSE THEN 0 ELSE COALESCE(f.desconto_atual, fx.desconto_padrao) END AS desconto_percentual,
       ROUND(b.preco_original * (1 - (CASE WHEN b.mesmo_dia THEN 50 WHEN fx.faixa IS NULL OR f.ativo = FALSE THEN 0 ELSE COALESCE(f.desconto_atual, fx.desconto_padrao) END) / 100.0), 2) AS preco_calculado,
       (b.data_validade < CURRENT_DATE) AS vencido
  FROM base b
  LEFT JOIN LATERAL (
        SELECT l.* FROM limites_faixa_desconto l WHERE b.pct >= l.prazo_consumido_min ORDER BY l.faixa DESC LIMIT 1
       ) fx ON TRUE
  LEFT JOIN faixas_desconto f ON f.loja_id = b.loja_id AND f.faixa = fx.faixa;

-- ---------------------------------------------------------------------
--  ENTIDADES SOCIAIS (artigo 7.4; RN05: só elas recebem doações)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entidades_sociais (
  id                       TEXT PRIMARY KEY,
  usuario_id               TEXT REFERENCES usuarios(id) ON DELETE SET NULL,   -- conta de acesso da entidade (opcional)
  nome                     TEXT NOT NULL,
  cnpj                     TEXT NOT NULL,
  tipo_organizacao         TEXT NOT NULL DEFAULT 'outro'
                           CHECK (tipo_organizacao IN ('banco_de_alimentos','ong','associacao','instituicao_religiosa','instituicao_assistencial','outro')),
  responsavel_legal        TEXT NOT NULL,
  cargo_responsavel        TEXT,
  email                    TEXT,
  telefone                 TEXT,
  whatsapp                 TEXT,
  endereco                 TEXT NOT NULL,
  bairro                   TEXT,
  cidade                   TEXT NOT NULL,
  uf                       CHAR(2) NOT NULL,
  cep                      TEXT,
  categorias_aceitas       TEXT[] NOT NULL DEFAULT '{}',
  possui_refrigeracao      BOOLEAN NOT NULL DEFAULT FALSE,
  possui_transporte        BOOLEAN NOT NULL DEFAULT FALSE,
  horario_funcionamento    TEXT,
  status_validacao         TEXT NOT NULL DEFAULT 'pending_review'
                           CHECK (status_validacao IN ('pending_review','validated','rejected','unlinked')),
  validado_em              TIMESTAMPTZ,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes              TEXT,
  termo_adesao_arquivo     TEXT,     -- termo de credenciamento assinado (gov.br)
  termo_adesao_hash        TEXT,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entidades_cnpj    ON entidades_sociais (cnpj);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entidades_usuario ON entidades_sociais (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_entidades_cidade ON entidades_sociais (cidade, status_validacao);

DROP TRIGGER IF EXISTS trg_entidades_atualizado ON entidades_sociais;
CREATE TRIGGER trg_entidades_atualizado BEFORE UPDATE ON entidades_sociais
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ---------------------------------------------------------------------
--  DESTINOS DE DESCARTE (classe "Aterro" do diagrama, generalizada:
--  aterro, compostagem, biodigestor...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS destinos_descarte (
  id                     TEXT PRIMARY KEY,
  nome                   TEXT NOT NULL,
  cnpj                   TEXT NOT NULL,
  tipo_tratamento        TEXT NOT NULL
                         CHECK (tipo_tratamento IN ('ATERRO_SANITARIO_CONTROLADO','COMPOSTAGEM','BIODIGESTOR','LIXO_ORGANICO','OUTRO')),
  licenca_ambiental      TEXT,
  endereco               TEXT NOT NULL,
  cidade                 TEXT NOT NULL,
  uf                     CHAR(2) NOT NULL,
  cep                    TEXT,
  responsavel            TEXT,
  email                  TEXT,
  whatsapp               TEXT,
  capacidade_diaria_kg   NUMERIC(12,2) CHECK (capacidade_diaria_kg IS NULL OR capacidade_diaria_kg > 0),
  horario_funcionamento  TEXT,
  unidade_municipal      BOOLEAN NOT NULL DEFAULT FALSE,
  autoridade_municipal   TEXT,
  status_validacao       TEXT NOT NULL DEFAULT 'pending_review'
                         CHECK (status_validacao IN ('pending_review','validated','rejected','unlinked')),
  validado_em            TIMESTAMPTZ,
  ativo                  BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes            TEXT,
  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_destinos_cnpj ON destinos_descarte (cnpj);

DROP TRIGGER IF EXISTS trg_destinos_atualizado ON destinos_descarte;
CREATE TRIGGER trg_destinos_atualizado BEFORE UPDATE ON destinos_descarte
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- ---------------------------------------------------------------------
--  TRANSAÇÕES (venda, doação ou descarte) e seus itens  (RN06)
--  Todo evento fica aqui: é a base do dashboard e do relatório mensal.
--  data_local / hora_local = "Data" e "Hora" do diagrama (fuso de Brasília).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacoes (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo           TEXT          NOT NULL CHECK (tipo IN ('venda','doacao','descarte')),
  loja_id        TEXT          REFERENCES lojas(id) ON DELETE SET NULL,
  usuario_id     TEXT          REFERENCES usuarios(id) ON DELETE SET NULL,  -- quem realizou (cliente na venda; responsável da loja na doação/descarte)
  pedido_id      TEXT          REFERENCES pedidos(id) ON DELETE SET NULL,   -- só nas vendas
  descricao      TEXT,
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  quantidade     INTEGER       NOT NULL DEFAULT 0 CHECK (quantidade >= 0),  -- unidades (soma dos itens)
  kg             NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (kg >= 0),          -- volume (soma dos itens)
  status         TEXT          NOT NULL DEFAULT 'registrada'
                 CHECK (status IN ('registrada','confirmada','cancelada')),
  data_hora      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  data_local     DATE GENERATED ALWAYS AS ((data_hora AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  hora_local     TIME GENERATED ALWAYS AS ((data_hora AT TIME ZONE 'America/Sao_Paulo')::time) STORED,
  criado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_transacoes_pedido ON transacoes (pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_transacoes_loja_data ON transacoes (loja_id, data_hora DESC);
CREATE INDEX IF NOT EXISTS ix_transacoes_tipo      ON transacoes (tipo);
CREATE INDEX IF NOT EXISTS ix_transacoes_usuario   ON transacoes (usuario_id);

DROP TRIGGER IF EXISTS trg_transacoes_atualizado ON transacoes;
CREATE TRIGGER trg_transacoes_atualizado BEFORE UPDATE ON transacoes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE IF NOT EXISTS transacao_itens (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transacao_id  BIGINT        NOT NULL REFERENCES transacoes(id) ON DELETE CASCADE,
  alimento_id   TEXT,                        -- sem FK: o produto pode ser removido do catálogo depois
  nome          TEXT          NOT NULL,
  categoria     TEXT          NOT NULL DEFAULT 'sem_categoria',
  quantidade    INTEGER       NOT NULL CHECK (quantidade > 0),
  kg            NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (kg >= 0),
  valor         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0)
);
CREATE INDEX IF NOT EXISTS ix_transacao_itens_transacao ON transacao_itens (transacao_id);

-- Mantém quantidade e kg da transação sempre iguais à soma dos itens.
CREATE OR REPLACE FUNCTION fn_transacao_recalcular() RETURNS trigger AS $$
DECLARE v_id BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN v_id := OLD.transacao_id; ELSE v_id := NEW.transacao_id; END IF;
  UPDATE transacoes t SET quantidade = s.q, kg = s.k
    FROM (SELECT COALESCE(SUM(quantidade), 0) AS q, COALESCE(SUM(kg), 0) AS k
            FROM transacao_itens WHERE transacao_id = v_id) s
   WHERE t.id = v_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transacao_itens_recalcula ON transacao_itens;
CREATE TRIGGER trg_transacao_itens_recalcula AFTER INSERT OR UPDATE OR DELETE ON transacao_itens
  FOR EACH ROW EXECUTE FUNCTION fn_transacao_recalcular();

-- ---- Venda: cada pedido gera uma transação "venda" (com seus itens e kg)
CREATE OR REPLACE FUNCTION fn_status_transacao_pedido(p_status TEXT) RETURNS TEXT AS $$
  SELECT CASE p_status WHEN 'delivered' THEN 'confirmada' WHEN 'cancelled' THEN 'cancelada' ELSE 'registrada' END
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_pedido_gera_transacao() RETURNS trigger AS $$
BEGIN
  INSERT INTO transacoes (tipo, loja_id, usuario_id, pedido_id, descricao, valor, status, data_hora)
  VALUES ('venda', NEW.loja_id, NEW.cliente_id, NEW.id, 'Venda com desconto ' || NEW.id, NEW.total,
          fn_status_transacao_pedido(NEW.status), NEW.criado_em)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_transacao ON pedidos;
CREATE TRIGGER trg_pedidos_transacao AFTER INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_pedido_gera_transacao();

CREATE OR REPLACE FUNCTION fn_pedido_status_transacao() RETURNS trigger AS $$
BEGIN
  UPDATE transacoes SET status = fn_status_transacao_pedido(NEW.status) WHERE pedido_id = NEW.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_status_transacao ON pedidos;
CREATE TRIGGER trg_pedidos_status_transacao AFTER UPDATE OF status ON pedidos
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_pedido_status_transacao();

-- kg do item vendido: peso do produto x quantidade; sem peso, estimativa pelo preço (regra do protótipo)
CREATE OR REPLACE FUNCTION fn_peso_item_kg(p_alimento TEXT, p_preco NUMERIC, p_qtd INTEGER) RETURNS NUMERIC AS $$
DECLARE v_peso NUMERIC; v_min NUMERIC; v_fr NUMERIC;
BEGIN
  SELECT peso_unitario_kg INTO v_peso FROM alimentos WHERE id = p_alimento;
  IF v_peso IS NULL THEN
    SELECT valor INTO v_min FROM parametros_plataforma WHERE chave = 'peso_minimo_estimado_kg';
    SELECT valor INTO v_fr  FROM parametros_plataforma WHERE chave = 'fracao_preco_peso_estimado';
    v_peso := GREATEST(COALESCE(v_min, 0.35), p_preco * COALESCE(v_fr, 0.1));
  END IF;
  RETURN ROUND(v_peso * p_qtd, 3);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_pedido_item_gera_item_transacao() RETURNS trigger AS $$
DECLARE v_trx BIGINT; v_cat TEXT;
BEGIN
  SELECT id INTO v_trx FROM transacoes WHERE pedido_id = NEW.pedido_id;
  IF v_trx IS NULL THEN RETURN NEW; END IF;
  SELECT categoria INTO v_cat FROM alimentos WHERE id = NEW.alimento_id;
  INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
  VALUES (v_trx, NEW.alimento_id, NEW.nome, COALESCE(v_cat, 'sem_categoria'), NEW.quantidade,
          fn_peso_item_kg(NEW.alimento_id, NEW.preco, NEW.quantidade), NEW.preco * NEW.quantidade);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedido_itens_transacao ON pedido_itens;
CREATE TRIGGER trg_pedido_itens_transacao AFTER INSERT ON pedido_itens
  FOR EACH ROW EXECUTE FUNCTION fn_pedido_item_gera_item_transacao();

-- ---------------------------------------------------------------------
--  DOAÇÕES, TERMO DE DOAÇÃO e ASSINATURAS DIGITAIS (RF07, RF08, RN04, RN05)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_doacao  START 1000;
CREATE SEQUENCE IF NOT EXISTS seq_termo   START 1000;
CREATE SEQUENCE IF NOT EXISTS seq_descarte START 1000;

CREATE TABLE IF NOT EXISTS doacoes (
  id                TEXT PRIMARY KEY DEFAULT ('doacao-' || nextval('seq_doacao')),
  token             TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),  -- link público de confirmação
  transacao_id      BIGINT UNIQUE REFERENCES transacoes(id),    -- preenchido automaticamente
  loja_id           TEXT NOT NULL REFERENCES lojas(id),
  entidade_id       TEXT NOT NULL REFERENCES entidades_sociais(id),
  descricao         TEXT,
  data_validade     DATE,
  forma_entrega     TEXT NOT NULL DEFAULT 'pickup_by_entity'
                    CHECK (forma_entrega IN ('pickup_by_entity','store_delivery')),
  status            TEXT NOT NULL DEFAULT 'pending_inquiry'
                    CHECK (status IN ('pending_inquiry','accepted','rejected','completed','expired')),
  notificado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),         -- RF07: entidade notificada
  respondido_em     TIMESTAMPTZ,
  confirmado_por    TEXT,
  nota_resposta     TEXT,
  previsao_retirada TIME,
  motivo_rejeicao   TEXT,
  concluida_em      TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_doacoes_loja     ON doacoes (loja_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_doacoes_entidade ON doacoes (entidade_id, status);

DROP TRIGGER IF EXISTS trg_doacoes_atualizado ON doacoes;
CREATE TRIGGER trg_doacoes_atualizado BEFORE UPDATE ON doacoes
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE OR REPLACE FUNCTION fn_status_transacao_doacao(p_status TEXT) RETURNS TEXT AS $$
  SELECT CASE p_status WHEN 'accepted' THEN 'confirmada' WHEN 'completed' THEN 'confirmada'
                       WHEN 'rejected' THEN 'cancelada'  WHEN 'expired'   THEN 'cancelada' ELSE 'registrada' END
$$ LANGUAGE sql IMMUTABLE;

-- RN05 (só entidade cadastrada e validada) + cria a transação "doacao"
CREATE OR REPLACE FUNCTION fn_doacao_antes_inserir() RETURNS trigger AS $$
DECLARE v_status TEXT; v_ativo BOOLEAN;
BEGIN
  SELECT status_validacao, ativo INTO v_status, v_ativo FROM entidades_sociais WHERE id = NEW.entidade_id;
  IF v_status IS DISTINCT FROM 'validated' OR v_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Doações só podem ser destinadas a entidades sociais cadastradas e validadas (RN05).' USING ERRCODE = '23514';
  END IF;
  IF NEW.transacao_id IS NULL THEN
    INSERT INTO transacoes (tipo, loja_id, usuario_id, descricao, status, data_hora)
    VALUES ('doacao', NEW.loja_id, (SELECT usuario_id FROM lojas WHERE id = NEW.loja_id), NEW.descricao,
            fn_status_transacao_doacao(NEW.status), NEW.criado_em)
    RETURNING id INTO NEW.transacao_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doacoes_antes_inserir ON doacoes;
CREATE TRIGGER trg_doacoes_antes_inserir BEFORE INSERT ON doacoes
  FOR EACH ROW EXECUTE FUNCTION fn_doacao_antes_inserir();

CREATE OR REPLACE FUNCTION fn_doacao_status_transacao() RETURNS trigger AS $$
BEGIN
  UPDATE transacoes SET status = fn_status_transacao_doacao(NEW.status) WHERE id = NEW.transacao_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doacoes_status_transacao ON doacoes;
CREATE TRIGGER trg_doacoes_status_transacao AFTER UPDATE OF status ON doacoes
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_doacao_status_transacao();

CREATE TABLE IF NOT EXISTS termos_doacao (
  id              TEXT PRIMARY KEY DEFAULT ('termo-' || nextval('seq_termo')),
  doacao_id       TEXT   NOT NULL UNIQUE REFERENCES doacoes(id) ON DELETE CASCADE,
  transacao_id    BIGINT NOT NULL REFERENCES transacoes(id),            -- os ITENS do termo são os transacao_itens desta transação
  entidade_id     TEXT   NOT NULL REFERENCES entidades_sociais(id),     -- entidade receptora
  status          TEXT   NOT NULL DEFAULT 'aguardando_assinaturas'
                  CHECK (status IN ('aguardando_assinaturas','assinado')),
  emitido_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_emissao    DATE GENERATED ALWAYS AS ((emitido_em AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  horario_emissao TIME GENERATED ALWAYS AS ((emitido_em AT TIME ZONE 'America/Sao_Paulo')::time) STORED
);
CREATE INDEX IF NOT EXISTS ix_termos_entidade ON termos_doacao (entidade_id);

-- Preenche transação e entidade a partir da doação (evita divergência)
CREATE OR REPLACE FUNCTION fn_termo_antes_inserir() RETURNS trigger AS $$
BEGIN
  SELECT d.transacao_id, d.entidade_id INTO NEW.transacao_id, NEW.entidade_id FROM doacoes d WHERE d.id = NEW.doacao_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_termos_antes_inserir ON termos_doacao;
CREATE TRIGGER trg_termos_antes_inserir BEFORE INSERT ON termos_doacao
  FOR EACH ROW EXECUTE FUNCTION fn_termo_antes_inserir();

-- RN04: toda doação gera automaticamente o Termo de Doação
CREATE OR REPLACE FUNCTION fn_doacao_gera_termo() RETURNS trigger AS $$
BEGIN
  INSERT INTO termos_doacao (doacao_id, emitido_em) VALUES (NEW.id, NEW.criado_em);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doacoes_gera_termo ON doacoes;
CREATE TRIGGER trg_doacoes_gera_termo AFTER INSERT ON doacoes
  FOR EACH ROW EXECUTE FUNCTION fn_doacao_gera_termo();

-- Assinaturas digitais das duas partes (doador e receptor)
CREATE TABLE IF NOT EXISTS assinaturas_termo (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  termo_id             TEXT NOT NULL REFERENCES termos_doacao(id) ON DELETE CASCADE,
  parte                TEXT NOT NULL CHECK (parte IN ('doador','receptor')),
  assinante_nome       TEXT NOT NULL,
  assinante_documento  TEXT,                      -- CPF do signatário (dado pessoal: LGPD)
  tipo_assinatura      TEXT NOT NULL CHECK (tipo_assinatura IN ('desenho','certificado_digital','govbr')),
  certificado          TEXT,
  imagem_assinatura    TEXT,
  hash_sha256          TEXT NOT NULL,
  assinado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (termo_id, parte)
);

-- Termo fica "assinado" quando as DUAS partes assinaram
CREATE OR REPLACE FUNCTION fn_termo_status_assinaturas() RETURNS trigger AS $$
DECLARE v_termo TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN v_termo := OLD.termo_id; ELSE v_termo := NEW.termo_id; END IF;
  UPDATE termos_doacao
     SET status = CASE WHEN (SELECT COUNT(DISTINCT parte) FROM assinaturas_termo WHERE termo_id = v_termo) = 2
                       THEN 'assinado' ELSE 'aguardando_assinaturas' END
   WHERE id = v_termo;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assinaturas_status ON assinaturas_termo;
CREATE TRIGGER trg_assinaturas_status AFTER INSERT OR DELETE ON assinaturas_termo
  FOR EACH ROW EXECUTE FUNCTION fn_termo_status_assinaturas();

-- ---------------------------------------------------------------------
--  REGISTRO DE DESCARTE (RF09; artigo 7.5: quantidade e destinação)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros_descarte (
  id                        TEXT PRIMARY KEY DEFAULT ('descarte-' || nextval('seq_descarte')),
  transacao_id              BIGINT UNIQUE REFERENCES transacoes(id),    -- preenchido automaticamente
  loja_id                   TEXT NOT NULL REFERENCES lojas(id),
  destino_id                TEXT REFERENCES destinos_descarte(id),      -- opcional: "sem burocracia"
  alimento_id               TEXT,
  descricao_item            TEXT NOT NULL,
  categoria                 TEXT NOT NULL DEFAULT 'sem_categoria',
  quantidade                INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  kg                        NUMERIC(12,3) NOT NULL CHECK (kg > 0),
  tipo_destinacao           TEXT NOT NULL
                            CHECK (tipo_destinacao IN ('LIXO_ORGANICO','COMPOSTAGEM','BIODIGESTOR','ATERRO_SANITARIO_CONTROLADO','OUTRO')),
  motivo                    TEXT,
  responsavel_nome          TEXT,
  tipo_assinatura           TEXT CHECK (tipo_assinatura IS NULL OR tipo_assinatura IN ('desenho','certificado_digital','govbr')),
  certificado               TEXT,
  coordenadas_gps           TEXT,
  destinacao_confirmada_em  TIMESTAMPTZ,       -- ConfirmarDestinacao() do diagrama
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_descarte_loja    ON registros_descarte (loja_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_descarte_destino ON registros_descarte (destino_id);

CREATE OR REPLACE FUNCTION fn_descarte_antes_inserir() RETURNS trigger AS $$
BEGIN
  IF NEW.transacao_id IS NULL THEN
    INSERT INTO transacoes (tipo, loja_id, usuario_id, descricao, status, data_hora)
    VALUES ('descarte', NEW.loja_id, (SELECT usuario_id FROM lojas WHERE id = NEW.loja_id), NEW.descricao_item,
            CASE WHEN NEW.destinacao_confirmada_em IS NULL THEN 'registrada' ELSE 'confirmada' END, NEW.criado_em)
    RETURNING id INTO NEW.transacao_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_descarte_antes_inserir ON registros_descarte;
CREATE TRIGGER trg_descarte_antes_inserir BEFORE INSERT ON registros_descarte
  FOR EACH ROW EXECUTE FUNCTION fn_descarte_antes_inserir();

CREATE OR REPLACE FUNCTION fn_descarte_depois_inserir() RETURNS trigger AS $$
BEGIN
  INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
  VALUES (NEW.transacao_id, NEW.alimento_id, NEW.descricao_item, NEW.categoria, NEW.quantidade, NEW.kg, 0);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_descarte_depois_inserir ON registros_descarte;
CREATE TRIGGER trg_descarte_depois_inserir AFTER INSERT ON registros_descarte
  FOR EACH ROW EXECUTE FUNCTION fn_descarte_depois_inserir();

CREATE OR REPLACE FUNCTION fn_descarte_confirmado() RETURNS trigger AS $$
BEGIN
  UPDATE transacoes SET status = 'confirmada' WHERE id = NEW.transacao_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_descarte_confirmado ON registros_descarte;
CREATE TRIGGER trg_descarte_confirmado AFTER UPDATE OF destinacao_confirmada_em ON registros_descarte
  FOR EACH ROW WHEN (OLD.destinacao_confirmada_em IS NULL AND NEW.destinacao_confirmada_em IS NOT NULL)
  EXECUTE FUNCTION fn_descarte_confirmado();

-- ---------------------------------------------------------------------
--  DASHBOARD DE IMPACTO e RELATÓRIO MENSAL (RF10, RN06)
--  "Desviado do descarte" = venda + doação. O descarte entra com seus kg, mas
--  NÃO conta como CO2 evitado. Receita = total dos pedidos (com taxas), como no protótipo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW visao_dashboard_impacto AS
SELECT t.loja_id,
       COALESCE(SUM(t.kg)         FILTER (WHERE t.tipo IN ('venda','doacao')), 0) AS kg_desviados,
       COALESCE(SUM(t.quantidade) FILTER (WHERE t.tipo IN ('venda','doacao')), 0) AS unidades_desviadas,
       COALESCE(SUM(t.kg)         FILTER (WHERE t.tipo = 'descarte'), 0)          AS kg_descartados,
       COALESCE(SUM(t.valor)      FILTER (WHERE t.tipo = 'venda'), 0)             AS receita,
       COUNT(*)                   FILTER (WHERE t.tipo = 'doacao')                AS doacoes,
       ROUND(COALESCE(SUM(t.kg) FILTER (WHERE t.tipo IN ('venda','doacao')), 0)
             * (SELECT valor FROM parametros_plataforma WHERE chave = 'co2_evitado_kg_por_kg'), 1) AS co2_evitado_kg
  FROM transacoes t
 WHERE t.status <> 'cancelada'
 GROUP BY t.loja_id;

CREATE OR REPLACE VIEW visao_relatorio_mensal AS
SELECT t.loja_id,
       date_trunc('month', t.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS mes,
       t.tipo,
       i.categoria,
       COUNT(DISTINCT t.id)  AS transacoes,
       SUM(i.quantidade)     AS unidades,
       SUM(i.kg)             AS kg,
       SUM(i.valor)          AS receita_itens,
       CASE WHEN t.tipo IN ('venda','doacao')
            THEN ROUND(SUM(i.kg) * (SELECT valor FROM parametros_plataforma WHERE chave = 'co2_evitado_kg_por_kg'), 1)
       END                   AS co2_evitado_kg
  FROM transacoes t
  JOIN transacao_itens i ON i.transacao_id = t.id
 WHERE t.status <> 'cancelada'
 GROUP BY t.loja_id, date_trunc('month', t.data_hora AT TIME ZONE 'America/Sao_Paulo'), t.tipo, i.categoria;

-- Contador pessoal do consumidor (artigo 7.2)
CREATE OR REPLACE VIEW visao_impacto_consumidor AS
SELECT u.id AS usuario_id,
       COUNT(t.id)                  AS compras,
       COALESCE(SUM(t.kg), 0)       AS kg_salvos,
       u.valor_economizado          AS economia
  FROM usuarios u
  LEFT JOIN transacoes t ON t.usuario_id = u.id AND t.tipo = 'venda' AND t.status <> 'cancelada'
 WHERE u.perfil = 'client'
 GROUP BY u.id, u.valor_economizado;

-- =====================================================================
--  DADOS DE DEMONSTRAÇÃO 1/2: usuários, lojas, alimentos e pedidos
--  (só entram se o banco ainda estiver vazio)
-- =====================================================================
DO $seed$
BEGIN
IF NOT EXISTS (SELECT 1 FROM usuarios) THEN

  -- ---- USUÁRIOS DE DEMONSTRAÇÃO (somente o hash das senhas)
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-client-1', 'Camila Silva', 'camila@email.com', '$2a$10$ufIIW7g2Tc75K3wGaiuWK.DySQzVMeRUhKVaYL9w68MHocybEFM7S', 'client', 3000, 300, 0, 'avatarPadrao', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', '123.456.789-00', '1995-05-15', TRUE, FALSE, NULL, 0, FALSE, '{}'::jsonb, '2026-01-15T09:20:00.000Z');
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-store-1', 'Padaria & Confeitaria Kiuda', 'store@email.com', '$2a$10$K0YZpp6pNWJXY/69x5LC1e6FdhYuIiL0YxelqnL4acZmR3OOSODBq', 'store', 0, 0, 450, 'lojaItaipu', 'Av. Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', '01.234.567/0001-89', NULL, TRUE, TRUE, 4.9, 28, FALSE, '{"legalRepresentativeName":"Kiuda Proprietária","legalRepresentativeCpf":"987.654.321-00","stateRegistration":"12345678-ALVARA"}'::jsonb, '2026-01-10T08:00:00.000Z');
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-driver-1', 'Marcos Entregador (Próprio)', 'marcos@email.com', '$2a$10$qXYQZb1CeEgwQd..QMmMSeswbgML/nzvEuY9QBrFvBbNCs7iZn3ra', 'driver', 0, 0, 0, 'avatar02', 'Av. Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', '111.222.333-44', NULL, FALSE, TRUE, 4.8, 15, FALSE, '{"driverType":"internal","contractedStoreId":"user-store-1","contractedStoreName":"Dona Kiuda Café","workingCity":"Pinhalzinho"}'::jsonb, '2026-02-01T14:10:00.000Z');
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-driver-2', 'Carlos Entregador (Compartilhado)', 'carlos@email.com', '$2a$10$z4TDguXC4/XVZejhFZlZO.qDx37P834OZyOo000oxrYvUJnqp62uu', 'driver', 0, 0, 0, 'avatar03', 'Rua Paraná, Centro, 510 - Pinhalzinho/SC', '222.333.444-55', NULL, FALSE, TRUE, 4.7, 41, FALSE, '{"driverType":"shared","workingCity":"Pinhalzinho"}'::jsonb, '2026-02-12T11:45:00.000Z');
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-institution-1', 'Mesa Brasil Sesc', 'entidade@email.com', '$2a$10$YxyzjUuMxLqDB.SfdgTpBOYs7hHbKHipekYjcnsFNM0rEOwU66G7m', 'institution', 1200, 0, 0, 'avatar04', 'Rua Getúlio Vargas, 120 - Pinhalzinho/SC', '12.345.678/0001-90', NULL, FALSE, TRUE, 4.9, 34, FALSE, '{"socialAtuationProof":"Certificado Mesa Brasil Ativo"}'::jsonb, '2026-01-05T16:00:00.000Z');
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-disposal-1', 'Adubo Orgânico Pinhal', 'descarte@email.com', '$2a$10$2fQmmbQhmtrlRe4lUfP1cu3Hs76gReuCln26jG6o2PijA06OebWnm', 'disposal', 800, 0, 0, 'avatar05', 'Linha São Paulo, Km 4 - Interior, Pinhalzinho/SC', '98.765.432/0001-10', NULL, FALSE, TRUE, 4.6, 12, FALSE, '{"environmentalLicense":"Licença de Compostagem Nº 451/2026"}'::jsonb, '2026-02-20T10:00:00.000Z');
  INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, lucro_acumulado, avatar_url, endereco, cpf_cnpj, data_nascimento, termos_aceitos, verificado, nota, qtd_avaliacoes, suspenso, extras, criado_em)
  VALUES ('user-master', 'Administrador Master', 'admin@saveall.com', '$2a$10$9EPj075ihoCr1ExoLjXVMOSKprd4cVdWiQKKWcUjKR98FAETcLexm', 'master', 99999, 0, 0, 'avatar02', 'Central de Operações SaveAll - SC', NULL, NULL, FALSE, TRUE, 5, 100, FALSE, '{}'::jsonb, '2026-01-01T00:00:00.000Z');

  -- ---- LOJAS
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-1', 'user-store-1', 'Panificadora & Confeitaria Itaipu', 'lojaItaipu', 'Padaria', 4.8, 'Avenida República, 1420 - Centro, Pinhalzinho/SC', 'Pinhalzinho, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-2', NULL, 'Panificadora Delícias Da Villa', 'lojaVilla', 'Padaria', 4.6, 'Rua das Flores, 88 - Vila Nova, Pinhalzinho/SC', 'Pinhalzinho, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-3', NULL, 'Padaria & Confeitaria Kiuda', 'lojaKiuda', 'Padaria', 4.9, 'Av. Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', 'Pinhalzinho, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-4', NULL, 'Panificadora Boníssima', 'lojaBonissima', 'Padaria', 4.7, 'Rua Dom Pedro II, 450 - Jd. América, Pinhalzinho/SC', 'Pinhalzinho, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-5', NULL, 'Padaria Central Pão & Arte', 'lojaCentral', 'Padaria', 4.5, 'Avenida Brasil, 829 - Centro, Pinhalzinho/SC', 'Pinhalzinho, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-chp-1', NULL, 'Panificadora & Confeitaria Seleção', 'lojaSelecao', 'Padaria', 4.9, 'Av. Getúlio Vargas, 1120 - Centro, Chapecó/SC', 'Chapecó, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-chp-2', NULL, 'Bella Villa Pães Artesanais', 'lojaItaipu', 'Padaria', 4.8, 'Rua Fernando Machado, 450 - São Cristóvão, Chapecó/SC', 'Chapecó, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-chp-3', NULL, 'Doce Sabor Café & Padaria', 'lojaBonissima', 'Padaria', 4.7, 'Av. General Osório, 310 - Jardim Itália, Chapecó/SC', 'Chapecó, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-fln-1', NULL, 'Pão da Ilha Confeitaria & Café', 'lojaKiuda', 'Padaria', 4.9, 'Rua Bocaiúva, 2468 - Centro, Florianópolis/SC', 'Florianópolis, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-fln-2', NULL, 'Lagoa Fresh Panificadora', 'lojaVilla', 'Padaria', 4.8, 'Av. das Rendeiras, 850 - Lagoa da Conceição, Florianópolis/SC', 'Florianópolis, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-fln-3', NULL, 'Campeche Fornada Orgânica', 'lojaCentral', 'Padaria', 4.7, 'Av. Pequeno Príncipe, 1200 - Campeche, Florianópolis/SC', 'Florianópolis, SC');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-poa-1', NULL, 'Casa do Pão Moinhos', 'lojaItaipu', 'Padaria', 4.9, 'Rua Padre Chagas, 315 - Moinhos de Vento, Porto Alegre/RS', 'Porto Alegre, RS');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-poa-2', NULL, 'Confeitaria & Padaria Bella Vista', 'lojaSelecao', 'Padaria', 4.8, 'Av. Goethe, 210 - Rio Branco, Porto Alegre/RS', 'Porto Alegre, RS');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-poa-3', NULL, 'Pão dos Pobres Bakery', 'lojaBonissima', 'Padaria', 4.6, 'Rua dos Andradas, 1420 - Centro Histórico, Porto Alegre/RS', 'Porto Alegre, RS');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-sp-1', NULL, 'Padaria Bella Paulista', 'lojaKiuda', 'Padaria', 4.9, 'Rua Haddock Lobo, 354 - Cerqueira César, São Paulo/SP', 'São Paulo, SP');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-sp-2', NULL, 'Confeitaria & Forno Vila Madalena', 'lojaVilla', 'Padaria', 4.8, 'Rua Fradique Coutinho, 980 - Pinheiros, São Paulo/SP', 'São Paulo, SP');
  INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade) VALUES ('store-sp-3', NULL, 'Pão das Laranjeiras Jardins', 'lojaCentral', 'Padaria', 4.7, 'Alameda Lorena, 1300 - Jardins, São Paulo/SP', 'São Paulo, SP');

  -- ---- ALIMENTOS
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-1', 'store-3', 'Pão de Queijo Mineiro (6 unidades)', 'salgado', '2026-06-04', '2026-06-05', 12, 6, 'alimento01', 'active', 'Pão de queijo tradicional crocante por fora e macio por dentro.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-2', 'store-2', 'Donut Glaciado de Morango', 'doce', '2026-06-04', '2026-06-05', 10, 5, 'alimento02', 'active', 'Delicioso donut com cobertura cremosa de morango e granulados coloridos.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-3', 'store-1', 'Combo de Salgados Sortidos', 'salgado', '2026-06-04', '2026-06-05', 18, 9, 'alimento03', 'active', 'Coxinha, bolinha de queijo, rissole de presunto. Perfeito para lanche!', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-4', 'store-3', 'Cupcake Gourmet de Chocolate', 'doce', '2026-06-04', '2026-06-05', 8, 4, 'alimento04', 'active', 'Cupcake de chocolate meio amargo com cobertura de brigadeiro belga.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-5', 'store-4', 'Croissant Recheado Presunto e Queijo', 'salgado', '2026-06-04', '2026-06-05', 14, 7, 'lojaSelecao', 'active', 'Massa folhada amanteigada com recheio generoso derretido.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-6', 'store-4', 'Fatia de Torta Holandesa', 'doce', '2026-06-04', '2026-06-05', 16, 8, 'alimento05', 'active', 'Creme aveludado com base de biscoito e cobertura brilhante de ganache.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-1-doce', 'store-1', 'Sonho Tradicional Recheado de Creme', 'doce', '2026-06-04', '2026-06-05', 10, 5, 'alimento02', 'active', 'Sonho aerado e macio polvilhado com açúcar de confeiteiro e recheio de baunilha.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-2-salgado', 'store-2', 'Empadão de Frango com Catupiry', 'salgado', '2026-06-04', '2026-06-05', 15, 7.5, 'lojaSelecao', 'active', 'Massa podre tradicional que desmancha na boca com recheio cremoso farto.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-5-salgado', 'store-5', 'Pão Francês & Queijo da Serra', 'salgado', '2026-06-04', '2026-06-05', 12, 6, 'alimento01', 'active', 'Pãezinhos quentinhos crocantes com queijo colonial derretido.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-5-doce', 'store-5', 'Bolo Caseiro de Fubá com Goiabada', 'doce', '2026-06-04', '2026-06-05', 14, 7, 'alimento04', 'active', 'Bolo fresquinho da tarde com pedaços macios de goiabada cascão cremosa.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-chp-1', 'store-chp-1', 'Pão Italiano de Fermentação Natural', 'salgado', '2026-06-04', '2026-06-05', 16, 8, 'alimento03', 'active', 'Casca rústica e crocante com miolo macio e aerado, receita italiana autêntica.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-chp-2', 'store-chp-1', 'Cuca Gaúcha de Banana com Canela', 'doce', '2026-06-04', '2026-06-05', 14, 7, 'alimento04', 'active', 'Cuca fofinha com cobertura generosa de farofa crocante e bananas caramelizadas.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-chp-3', 'store-chp-2', 'Mix de Empadas Folhadas Especiais', 'salgado', '2026-06-04', '2026-06-05', 18, 9, 'lojaSelecao', 'active', 'Empadas de frango cremoso e palmito com massa amanteigada que derrete na boca.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-chp-4', 'store-chp-3', 'Torta Alemã Tradicional com Ganache', 'doce', '2026-06-04', '2026-06-05', 20, 10, 'alimento05', 'active', 'Camadas de creme especial de baunilha, biscoitos crocantes e calda de chocolate.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-chp-2-doce', 'store-chp-2', 'Cinnamon Roll Artesanal com Canela', 'doce', '2026-06-04', '2026-06-05', 15, 7.5, 'alimento02', 'active', 'Enroladinho fofinho com açúcar mascavo, canela do ceilão e cobertura de cream cheese.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-chp-3-salgado', 'store-chp-3', 'Focaccia de Tomate Seco e Queijo', 'salgado', '2026-06-04', '2026-06-05', 16, 8, 'lojaSelecao', 'active', 'Focaccia macia com azeite de oliva nobre, fatias de queijo e tomate seco artesanal.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-fln-1', 'store-fln-1', 'Croissant Francês de Amêndoas', 'doce', '2026-06-04', '2026-06-05', 18, 9, 'lojaSelecao', 'active', 'Folhado artesanal com recheio de creme de amêndoas e lâminas tostadas.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-fln-2', 'store-fln-1', 'Pão de Queijo Canastra da Ilha (6 un)', 'salgado', '2026-06-04', '2026-06-05', 12, 6, 'alimento01', 'active', 'Receita artesanal com queijo curado da Canastra, sabor marcante e quentinho.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-fln-3', 'store-fln-2', 'Torta Gelada de Frutas Vermelhas', 'doce', '2026-06-04', '2026-06-05', 22, 11, 'alimento05', 'active', 'Frutas frescas da estação com calda reduzida e base crocante de biscoito.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-fln-2-salgado', 'store-fln-2', 'Empanada de Palmito Cremoso', 'salgado', '2026-06-04', '2026-06-05', 14, 7, 'alimento01', 'active', 'Massa fina e crocante com recheio suculento de palmito fresco e ervas.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-fln-4', 'store-fln-3', 'Focaccia Mediterrânea de Tomate e Alecrim', 'salgado', '2026-06-04', '2026-06-05', 16, 8, 'alimento03', 'active', 'Azeite de oliva extravirgem, sal marinho grosso, alecrim fresco e tomatinhos cereja.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-fln-3-doce', 'store-fln-3', 'Torta Mousse de Chocolate Belga', 'doce', '2026-06-04', '2026-06-05', 20, 10, 'alimento04', 'active', 'Cacau 70% aveludado com raspas finas de chocolate meio amargo.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-poa-1', 'store-poa-1', 'Cuca Gaúcha Tradicional com Farofa', 'doce', '2026-06-04', '2026-06-05', 15, 7.5, 'alimento04', 'active', 'Receita típica colonial com farofinha crocante e açúcar mascavo.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-poa-2', 'store-poa-1', 'Sanduíche Colonial de Forno Quente', 'salgado', '2026-06-04', '2026-06-05', 18, 9, 'lojaSelecao', 'active', 'Pão de batata fofinho recheado com queijo colonial e copa fatiada.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-poa-3', 'store-poa-2', 'Fatia de Torta Marta Rocha Gaúcha', 'doce', '2026-06-04', '2026-06-05', 24, 12, 'alimento05', 'active', 'Clássico com disco de suspiro, pão de ló, crocante de nozes e nata fresca.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-poa-2-salgado', 'store-poa-2', 'Croissant de Queijo Colonial', 'salgado', '2026-06-04', '2026-06-05', 16, 8, 'lojaSelecao', 'active', 'Folhado dourado amanteigado com queijo típico da serra gaúcha derretido.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-poa-4', 'store-poa-3', 'Pão de Batata Recheado com Catupiry', 'salgado', '2026-06-04', '2026-06-05', 14, 7, 'alimento01', 'active', 'Massa levíssima de batata com recheio cremoso e casca dourada ao forno.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-poa-3-doce', 'store-poa-3', 'Cuca de Maçã com Especiarias', 'doce', '2026-06-04', '2026-06-05', 16, 8, 'alimento04', 'active', 'Massa fofa artesanal com fatias de maçã fresca e noz-moscada aromática.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-sp-1', 'store-sp-1', 'Pão na Chapa Especial & Requeijão', 'salgado', '2026-06-04', '2026-06-05', 14, 7, 'lojaSelecao', 'active', 'Pão francês fresquinho tostado na manteiga com requeijão na casquinha.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-sp-2', 'store-sp-1', 'Sonho Paulista Recheado com Creme', 'doce', '2026-06-04', '2026-06-05', 12, 6, 'alimento02', 'active', 'Sonho tradicional frito no ponto certo com recheio farto de creme patissier.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-sp-3', 'store-sp-2', 'Baguete Artesanal de Fermentação Natural', 'salgado', '2026-06-04', '2026-06-05', 16, 8, 'alimento03', 'active', 'Fornada matinal com farinha francesa importada e 36h de fermentação natural.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-sp-2-doce', 'store-sp-2', 'Donut Recheado de Doce de Leite', 'doce', '2026-06-04', '2026-06-05', 12, 6, 'alimento02', 'active', 'Donut artesanal macio recheado com autêntico doce de leite artesanal.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-sp-4', 'store-sp-3', 'Cheesecake com Calda de Frutas Vermelhas', 'doce', '2026-06-04', '2026-06-05', 22, 11, 'alimento05', 'active', 'Base crocante de biscoitos, cream cheese cremoso assado e geleia artesanal.', 10);
  INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade) VALUES ('food-sp-3-salgado', 'store-sp-3', 'Quiche Lorraine Clássica', 'salgado', '2026-06-04', '2026-06-05', 18, 9, 'lojaSelecao', 'active', 'Receita francesa tradicional com bacon defumado e queijo gruyère.', 10);

  -- ---- PEDIDOS DE EXEMPLO (histórico da cliente Camila; datas relativas a agora)
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-97', 'user-client-1', 'Camila Silva', 'store-1', 'Panificadora & Confeitaria Itaipu', NULL, NULL, NULL, 18, 5, 0, 0, 23, 'Cartão de Crédito', 'delivered', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', NULL, NULL, now() - interval '2880 minutes', now() - interval '2880 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-97', 'food-3', 'Combo de Salgados Sortidos', 2, 9);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-98', 'user-client-1', 'Camila Silva', 'store-4', 'Panificadora Boníssima', NULL, NULL, NULL, 30, 5, 0, 0, 35, 'Cartão', 'delivered', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', NULL, NULL, now() - interval '11520 minutes', now() - interval '11520 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-98', 'food-5', 'Croissant Recheado Presunto e Queijo', 2, 7);
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-98', 'food-6', 'Fatia de Torta Holandesa', 2, 8);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-99', 'user-client-1', 'Camila Silva', 'store-3', 'Padaria & Confeitaria Kiuda', NULL, NULL, NULL, 24, 5, 0, 0, 29, 'Cartão de Crédito', 'delivered', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', NULL, NULL, now() - interval '50400 minutes', now() - interval '50400 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-99', 'food-4', 'Cupcake Gourmet de Chocolate', 3, 4);
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-99', 'food-1', 'Pão de Queijo Mineiro (6 unidades)', 2, 6);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-100', 'user-client-1', 'Camila Silva', 'store-2', 'Panificadora Delícias Da Villa', NULL, NULL, NULL, 32, 5, 0, 0, 37, 'Cartão', 'delivered', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', NULL, NULL, now() - interval '93600 minutes', now() - interval '93600 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-100', 'food-2', 'Pão Francês Tradicional Crocante', 4, 3.5);
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-100', 'food-3', 'Combo de Salgados Sortidos', 2, 9);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-101', 'user-client-1', 'Camila Silva', 'store-3', 'Padaria & Confeitaria Kiuda', NULL, NULL, NULL, 6, 10, 0, 0, 16, 'Cartão de Crédito', 'delivered', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', NULL, NULL, '2026-06-04T18:00:00.000Z', '2026-06-04T18:00:00.000Z');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-101', 'food-1', 'Pão de Queijo Mineiro (6 unidades)', 1, 6);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-102', 'user-client-1', 'Camila Silva', 'store-3', 'Padaria & Confeitaria Kiuda', NULL, NULL, NULL, 20, 5, 0, 0, 25, 'Cartão de Crédito', 'delivered', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', 5, 5, now() - interval '2880 minutes', now() - interval '2880 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-102', 'food-4', 'Cupcake Gourmet de Chocolate', 2, 4);
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-102', 'food-1', 'Pão de Queijo Mineiro (6 unidades)', 2, 6);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-103', 'user-client-1', 'Camila Silva', 'store-1', 'Itaipu Panificadora', NULL, NULL, NULL, 18, 10, 0, 0, 28, 'Cartão', 'delivered', 'Avenida República, 1420 - Centro', 4, 5, now() - interval '1440 minutes', now() - interval '1440 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-103', 'food-3', 'Combo de Salgados Sortidos', 2, 9);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-104', 'user-client-1', 'Camila Silva', 'store-3', 'Dona Kiuda Café', 'user-driver-1', 'Marcos Entregador (Próprio)', 'internal', 12, 5, 0, 0, 17, 'Cartão de Crédito', 'delivery', 'Avenida Mato Grosso, Divineia, 3269 - Pinhalzinho/SC', NULL, NULL, now(), NULL);
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-104', 'food-1', 'Pão de Queijo Mineiro (6 unidades)', 2, 6);
  INSERT INTO pedidos (id, cliente_id, nome_cliente, loja_id, nome_loja, entregador_id, nome_entregador, tipo_entregador, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, nota_entregador, criado_em, entregue_em)
  VALUES ('order-105', 'user-client-1', 'Camila Silva', 'store-1', 'Itaipu Panificadora', NULL, 'Compartilhado da Cidade', 'shared', 9, 10, 0, 0, 19, 'Cartão', 'delivered', 'Avenida República, 1420 - Centro', 5, 4, now() - interval '720 minutes', now() - interval '720 minutes');
  INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ('order-105', 'food-3', 'Combo de Salgados Sortidos', 1, 9);

END IF;
END
$seed$;

-- =====================================================================
--  DADOS DE DEMONSTRAÇÃO 2/2: entidades sociais, destinos de descarte,
--  doações (com termo e assinaturas) e descartes.
--  Só entram se ainda não houver entidades e se as lojas de demonstração existirem.
--  Tipo de organização: preenchido só quando o nome já indica (ex.: "ONG ...");
--  nos demais fica "outro". Responsável legal = pessoa de contato do protótipo:
--  confira/corrija com o responsável legal real.
-- =====================================================================
DO $seed2$
BEGIN
IF NOT EXISTS (SELECT 1 FROM entidades_sociais)
   AND (SELECT COUNT(*) FROM lojas WHERE id IN ('store-1', 'store-2')) = 2 THEN

  -- ---- ENTIDADES SOCIAIS (diretório do protótipo)
  INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em)
  VALUES ('soc-part-1', 'user-institution-1', 'Mesa Brasil Sesc', '12.345.678/0001-90', 'banco_de_alimentos', 'Clara Silva', 'Coordenadora de Nutrição e Logística', 'mesabrasil@sesc-sc.com.br', '(49) 3319-9100', '(49) 99122-3344', 'Rua Fernando Machado, 400-D', 'Centro', 'Chapecó', 'SC', '89802-112', ARRAY['Padaria', 'Hortifrúti', 'Salgados', 'Doces', 'Laticínios', 'Refeições', 'Não-perecíveis']::text[], TRUE, TRUE, '08:00 às 18:00 (Seg a Sex)', 'validated', '2026-01-10T10:00:00Z', TRUE, 'Entidade credenciada nacionalmente com caminhão isotérmico próprio para coleta.', 'termo_adesao_mesabrasil_govbr_assinado.pdf', 'a7b8c9d0e1f234567890abcdef1234567890abcdef1234567890abcdef123456', '2026-01-10T10:00:00Z');
  INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em)
  VALUES ('soc-part-2', NULL, 'Amigos do Alimento SC', '45.678.901/0002-34', 'outro', 'Marcos Vinicius', 'Diretor de Operações', 'contato@amigosdoalimento.org', '(48) 3244-1188', '(48) 99824-7755', 'Av. Ivo Silveira, 1850', 'Capoeiras', 'Florianópolis', 'SC', '88085-001', ARRAY['Padaria', 'Hortifrúti', 'Salgados', 'Doces', 'Refeições']::text[], TRUE, TRUE, '07:30 às 19:00', 'validated', '2026-02-01T14:30:00Z', TRUE, 'Atende mais de 40 creches e asilos conveniados na região.', 'termo_amigosdoalimento_govbr.pdf', 'b8c9d0e1f2a34567890abcdef1234567890abcdef1234567890abcdef123456', '2026-02-01T14:30:00Z');
  INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em)
  VALUES ('soc-part-3', NULL, 'Paróquia Integrar Verde', '03.456.789/0001-12', 'instituicao_religiosa', 'Pe. João Carlos', 'Pároco e Coordenador Social', 'paroquia.integrar@diocesesc.org.br', '(49) 3366-1200', '(49) 98811-2233', 'Rua São Judas Tadeu, 88', 'Bela Vista', 'Pinhalzinho', 'SC', '89870-000', ARRAY['Padaria', 'Hortifrúti', 'Não-perecíveis']::text[], FALSE, FALSE, '08:00 às 17:00', 'validated', '2026-01-15T09:00:00Z', TRUE, 'Distribuição direta para famílias cadastradas na pastoral comunitária.', 'credenciamento_paroquia_pinhalzinho_assinado_govbr.pdf', 'c9d0e1f2a3b4567890abcdef1234567890abcdef1234567890abcdef123456', '2026-01-15T09:00:00Z');
  INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em)
  VALUES ('soc-part-4', NULL, 'ONG Sopão Solidário', '98.765.432/0001-21', 'ong', 'Helena Bastos', 'Presidente', 'sopaosolidario@gmail.com', NULL, '(49) 99933-4455', 'Rua Marechal Deodoro, 310', 'Passo dos Fortes', 'Chapecó', 'SC', '89805-200', ARRAY['Hortifrúti', 'Carnes', 'Padaria', 'Refeições', 'Legumes']::text[], TRUE, FALSE, '14:00 às 21:00', 'validated', '2026-02-12T11:00:00Z', TRUE, 'Prepara 300 refeições quentes diárias todas as noites.', 'termo_sopao_solidario_govbr_assinado.pdf', 'd0e1f2a3b4c567890abcdef1234567890abcdef1234567890abcdef123456', '2026-02-12T11:00:00Z');
  INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em)
  VALUES ('soc-part-5', NULL, 'Associação Beneficente Esperança Viva', '77.889.900/0001-11', 'associacao', 'Tereza Scherer', 'Assistente Social', 'esperancaviva.saudades@gmail.com', NULL, '(49) 99887-1234', 'Rua Castro Alves, 55', 'Centro', 'Saudades', 'SC', '89868-000', ARRAY['Padaria', 'Hortifrúti', 'Doces', 'Salgados']::text[], TRUE, TRUE, '08:00 às 17:30', 'pending_review', NULL, TRUE, 'Formulário público recebido com termo assinado via Gov.br. Aguardando seleção manual da loja.', 'termo_esperanca_viva_govbr_assinado.pdf', 'e1f2a3b4c5d67890abcdef1234567890abcdef1234567890abcdef123456', '2026-02-28T16:20:00Z');

  -- ---- DESTINOS DE DESCARTE (aterro, compostagem, biodigestor)
  INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, unidade_municipal, autoridade_municipal, status_validacao, validado_em, ativo, observacoes)
  VALUES ('disp-part-1', 'Aterro Sanitário & CTR Consórcio Intermunicipal do Oeste', '02.456.789/0001-33', 'ATERRO_SANITARIO_CONTROLADO', 'IMA/SC-LAO-2024-00129', 'Rodovia Municipal SC-473, Km 8 - Zona Especial de Tratamento', 'Pinhalzinho', 'SC', '89870-000', 'Eng. Ambiental Carlos Trentin (Sec. Meio Ambiente)', 'aterro.municipal@pinhalzinho.sc.gov.br', '(49) 98855-1100', 50000, '07:00 às 18:00', TRUE, 'Prefeitura Municipal de Pinhalzinho / Secretaria de Meio Ambiente e Obras', 'validated', '2026-01-05T08:00:00Z', TRUE, 'Unidade oficial regulamentada da Prefeitura Municipal para triagem técnica e destinação com pesagem balança automatizada.');
  INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, unidade_municipal, autoridade_municipal, status_validacao, validado_em, ativo, observacoes)
  VALUES ('disp-part-2', 'Composteira Municipal Sustentável & Horto Público', '01.123.456/0001-00', 'COMPOSTAGEM', 'SEC-ENV-449/2024', 'Parque Ecológico Municipal, s/n', 'Pinhalzinho', 'SC', '89870-000', 'Coord. Vanessa Duarte', 'compostagem@pinhalzinho.sc.gov.br', '(49) 98401-2299', 8000, '08:00 às 16:30', TRUE, 'Prefeitura Municipal de Pinhalzinho / Convênio Cidades Limpas', 'validated', '2026-02-01T10:00:00Z', TRUE, 'Programa público municipal de transformação de orgânicos em adubo ecológico para hortas comunitárias.');
  INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, unidade_municipal, autoridade_municipal, status_validacao, validado_em, ativo, observacoes)
  VALUES ('disp-part-3', 'Adubo Orgânico Pinhal & Usina Regional', '23.456.789/0001-88', 'COMPOSTAGEM', 'IMA/SC-2024-00918', 'Linha Volta Grande, Km 4 - Área Rural', 'Pinhalzinho', 'SC', '89870-000', 'Eng. Agrônomo Rodrigo M.', 'contato@adubopinhal.com.br', '(49) 99844-3322', 15000, '07:00 às 17:30', TRUE, 'Prefeitura Municipal / Convênio IMA', 'validated', '2026-01-05T08:00:00Z', TRUE, 'Usina credenciada pela Prefeitura para compostagem termofílica e fertilizante orgânico.');
  INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, unidade_municipal, autoridade_municipal, status_validacao, validado_em, ativo, observacoes)
  VALUES ('disp-part-4', 'Central de Tratamento de Resíduos & Biogás Regional', '88.990.112/0001-45', 'BIODIGESTOR', 'IMA/SC-LAI-2025-110', 'Distrito Industrial 2, Lote 15', 'Chapecó', 'SC', '89805-000', 'Dr. Lucas Silveira', 'recebimento@biogaschapeco.sc.gov.br', '(49) 99901-8833', 40000, '24 horas', TRUE, 'Consórcio Intermunicipal de Resíduos Sólidos do Grande Oeste', 'validated', '2026-01-28T13:00:00Z', TRUE, 'Centro consorciado municipal de biodigestão anaeróbia para geração de biometano.');

  -- ---- DOAÇÕES DE EXEMPLO (ofertas do protótipo) com termo e assinaturas
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, respondido_em, confirmado_por, nota_resposta, previsao_retirada, criado_em)
  VALUES ('don-off-101', 'tok-abc123xyz', 'store-1', (SELECT id FROM entidades_sociais WHERE cnpj = '12.345.678/0001-90'), 'Excedente de produção matinal em perfeito estado sanitário, embalado e pronto para consumo.', '2026-10-18', 'pickup_by_entity', 'pending_inquiry', now() - interval '35 minutes', NULL, NULL, NULL, NULL, now() - interval '35 minutes');
  INSERT INTO transacao_itens (transacao_id, nome, categoria, quantidade, kg, valor)
  SELECT transacao_id, 'Pães Franceses e Brioches do Dia', 'Padaria', 25, 7.5, 0 FROM doacoes WHERE id = 'don-off-101';
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, respondido_em, confirmado_por, nota_resposta, previsao_retirada, criado_em)
  VALUES ('don-off-102', 'tok-def456uvw', 'store-2', (SELECT id FROM entidades_sociais WHERE cnpj = '45.678.901/0002-34'), 'Lanches refrigerados de hoje, mantidos sob refrigeração de 4°C.', '2026-10-17', 'pickup_by_entity', 'accepted', now() - interval '125 minutes', now() - interval '95 minutes', 'Clara Silva (Coordenadora de Triagem)', 'Temos espaço na câmara fria e motorista disponível para retirar às 17h30!', '17:30', now() - interval '125 minutes');
  INSERT INTO transacao_itens (transacao_id, nome, categoria, quantidade, kg, valor)
  SELECT transacao_id, 'Lanches Naturais e Torta Salgada', 'Salgados', 14, 4.2, 0 FROM doacoes WHERE id = 'don-off-102';
  INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, certificado, hash_sha256, assinado_em)
  SELECT t.id, 'receptor', 'Clara Silva (Coordenadora de Triagem)', '333.444.555-66', 'desenho', NULL, encode(sha256(convert_to('don-off-102' || '|' || 'receptor' || '|' || 'Clara Silva (Coordenadora de Triagem)' || '|' || '333.444.555-66', 'UTF8')), 'hex'), now() - interval '95 minutes'
    FROM termos_doacao t WHERE t.doacao_id = 'don-off-102';
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, forma_entrega, status, respondido_em, confirmado_por, concluida_em, notificado_em, criado_em)
  VALUES ('don-off-103', 'tok-ghi789rst', 'store-1', (SELECT id FROM entidades_sociais WHERE cnpj = '12.345.678/0001-90'), 'Frutas frescas sortidas em perfeito estado (lote B)', 'pickup_by_entity', 'completed', now() - interval '2 days', 'Mesa Brasil Sesc Coletor', now() - interval '2 days', now() - interval '2 days 3 hours', now() - interval '2 days 3 hours');
  INSERT INTO transacao_itens (transacao_id, nome, categoria, quantidade, kg, valor)
  SELECT transacao_id, 'Frutas Frescas Sortidas (Lote B)', 'Frutas/Verduras', 1, 15, 0 FROM doacoes WHERE id = 'don-off-103';
  INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, certificado, hash_sha256, assinado_em)
  SELECT t.id, 'doador', 'Kiuda Proprietária', '987.654.321-00', 'certificado_digital', 'Certificado A1: 01.234.567/0001-89', encode(sha256(convert_to('don-off-103' || '|' || 'doador' || '|' || 'Kiuda Proprietária' || '|' || '987.654.321-00', 'UTF8')), 'hex'), now() - interval '2 days 2 hours'
    FROM termos_doacao t WHERE t.doacao_id = 'don-off-103';
  INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, certificado, hash_sha256, assinado_em)
  SELECT t.id, 'receptor', 'Mesa Brasil Sesc Coletor', NULL, 'certificado_digital', 'Certificado ICP-Brasil SHA256: 9e24a1b0c95...', encode(sha256(convert_to('don-off-103' || '|' || 'receptor' || '|' || 'Mesa Brasil Sesc Coletor' || '|' || '', 'UTF8')), 'hex'), now() - interval '2 days'
    FROM termos_doacao t WHERE t.doacao_id = 'don-off-103';

  -- ---- DESCARTES DE EXEMPLO (registros do protótipo)
  INSERT INTO registros_descarte (id, loja_id, destino_id, descricao_item, categoria, quantidade, kg, tipo_destinacao, responsavel_nome, tipo_assinatura, certificado, coordenadas_gps, destinacao_confirmada_em, criado_em)
  VALUES ('descarte-seed-1', 'store-1', 'disp-part-3', 'Bolo de Chocolate Decorado', 'doce', 1, 4.2, 'COMPOSTAGEM', NULL, NULL, NULL, NULL, now() - interval '1 day', now() - interval '1 day');
  INSERT INTO registros_descarte (id, loja_id, destino_id, descricao_item, categoria, quantidade, kg, tipo_destinacao, responsavel_nome, tipo_assinatura, certificado, coordenadas_gps, destinacao_confirmada_em, criado_em)
  VALUES ('descarte-seed-2', 'store-1', 'disp-part-3', 'Cascas e Sobras Hortifrúti (Lote Composto)', 'Vegetal', 1, 45, 'COMPOSTAGEM', 'Adubo Orgânico Pinhal Coletor', 'certificado_digital', 'Certificado ICP-Brasil SHA256: 4f12b0c95...', '-26.8831, -53.0583', now() - interval '1 day', now() - interval '1 day');

END IF;
END
$seed2$;

-- =====================================================================
--  Pedidos de bancos criados antes da v2 ganham a transação de venda e os itens
--  (em banco novo isto não faz nada: os gatilhos já criaram tudo).
-- =====================================================================
INSERT INTO transacoes (tipo, loja_id, usuario_id, pedido_id, descricao, valor, status, data_hora)
SELECT 'venda', p.loja_id, p.cliente_id, p.id, 'Venda com desconto ' || p.id, p.total,
       fn_status_transacao_pedido(p.status), p.criado_em
  FROM pedidos p
 WHERE NOT EXISTS (SELECT 1 FROM transacoes t WHERE t.pedido_id = p.id);

INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
SELECT t.id, pi.alimento_id, pi.nome, COALESCE(a.categoria, 'sem_categoria'), pi.quantidade,
       fn_peso_item_kg(pi.alimento_id, pi.preco, pi.quantidade), pi.preco * pi.quantidade
  FROM transacoes t
  JOIN pedido_itens pi ON pi.pedido_id = t.pedido_id
  LEFT JOIN alimentos a ON a.id = pi.alimento_id
 WHERE NOT EXISTS (SELECT 1 FROM transacao_itens ti WHERE ti.transacao_id = t.id);
