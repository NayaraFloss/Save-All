-- =====================================================================
-- SAVE ALL - Dados de exemplo nas tabelas do seu banco
-- (usuarios, lojas, alimentos, pedidos, entidades_sociais, destinos_descarte,
--  doacoes + termos_doacao + assinaturas_termo, registros_descarte e suporte_chamados).
-- Os gatilhos do banco geram as transações, os itens de transação, os termos e as
-- faixas de desconto, então os relatórios (visao_relatorio_mensal etc.) já mostram números.
--
-- Rode no pgAdmin (Query Tool), no banco do Save All. Pode rodar de novo: ele apaga os
-- exemplos antigos (ids começando com "ex-") e recria. Seus dados reais não são tocados.
-- Senha de TODOS os usuários de exemplo: 123456
-- =====================================================================

-- Encerra alguma transação que tenha ficado com erro antes (evita o erro 25P02)
ROLLBACK;

BEGIN;

-- ---------------------------------------------------------------------
-- Estrutura usada pelo app (a mesma da migracao_sem_localstorage.sql; só cria o que falta)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 0. Remove os exemplos anteriores (somente ids "ex-"), na ordem das chaves estrangeiras
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _trx_exemplo ON COMMIT DROP AS
  SELECT transacao_id AS id FROM doacoes WHERE id LIKE 'ex-%' AND transacao_id IS NOT NULL
  UNION SELECT transacao_id FROM registros_descarte WHERE id LIKE 'ex-%' AND transacao_id IS NOT NULL
  UNION SELECT t.id FROM transacoes t JOIN pedidos p ON p.id = t.pedido_id
         WHERE p.extras ? 'codigoExemplo' OR p.cliente_id LIKE 'user-ex-%' OR p.loja_id LIKE 'ex-loja-%'
  UNION SELECT id FROM transacoes WHERE loja_id LIKE 'ex-loja-%' OR usuario_id LIKE 'user-ex-%';
DELETE FROM assinaturas_termo WHERE termo_id IN (SELECT id FROM termos_doacao WHERE doacao_id LIKE 'ex-%' OR transacao_id IN (SELECT id FROM _trx_exemplo));
DELETE FROM termos_doacao WHERE doacao_id LIKE 'ex-%' OR transacao_id IN (SELECT id FROM _trx_exemplo);
DELETE FROM doacoes WHERE id LIKE 'ex-%' OR loja_id LIKE 'ex-loja-%';
DELETE FROM registros_descarte WHERE id LIKE 'ex-%' OR loja_id LIKE 'ex-loja-%';
DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE extras ? 'codigoExemplo' OR cliente_id LIKE 'user-ex-%' OR loja_id LIKE 'ex-loja-%');
DELETE FROM transacao_itens WHERE transacao_id IN (SELECT id FROM _trx_exemplo);
DELETE FROM transacoes WHERE id IN (SELECT id FROM _trx_exemplo);
DELETE FROM pedidos WHERE extras ? 'codigoExemplo' OR cliente_id LIKE 'user-ex-%' OR loja_id LIKE 'ex-loja-%';
DELETE FROM faixas_desconto WHERE loja_id LIKE 'ex-loja-%';
DELETE FROM alimentos WHERE id LIKE 'ex-food-%' OR loja_id LIKE 'ex-loja-%';
DELETE FROM lojas WHERE id LIKE 'ex-loja-%';
DELETE FROM entidades_sociais WHERE id LIKE 'ex-ent-%';
DELETE FROM destinos_descarte WHERE id LIKE 'ex-desc-%';
DELETE FROM suporte_chamados WHERE id LIKE 'ex-tkt-%';
DELETE FROM dados_usuario WHERE usuario_id LIKE 'user-ex-%';
DELETE FROM usuarios WHERE id LIKE 'user-ex-%';

-- ---------------------------------------------------------------------
-- 1. ESTABELECIMENTOS (usuário dono + loja; o gatilho cria as faixas de desconto)
-- ---------------------------------------------------------------------
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-pinhal-1', 'Panificadora Pão Dourado', 'loja.pinhal1.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Rua São Paulo, 210 - Centro, Pinhalzinho/SC', '11.111.111/0001-01', '5549991110001', TRUE, 4.8, 52, 1, FALSE, NULL, TRUE, 192.4, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Panificadora Pão Dourado", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-pinhal-1', 'user-ex-loja-pinhal-1', 'Panificadora Pão Dourado', 'Panificadora Pão Dourado Ltda', '11.111.111/0001-01', '5549991110001', 'lojaVilla', 'Padaria', 4.8, 'Rua São Paulo, 210 - Centro, Pinhalzinho/SC', 'Pinhalzinho, SC', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-pinhal-2', 'Doce Encanto Confeitaria', 'loja.pinhal2.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Av. Brasília, 1580 - Bela Vista, Pinhalzinho/SC', '11.111.111/0001-02', '5549991110002', TRUE, 4.6, 37, 1, FALSE, NULL, TRUE, 136.9, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Doce Encanto Confeitaria", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-pinhal-2', 'user-ex-loja-pinhal-2', 'Doce Encanto Confeitaria', 'Doce Encanto Confeitaria Ltda', '11.111.111/0001-02', '5549991110002', 'lojaBonissima', 'Confeitaria', 4.6, 'Av. Brasília, 1580 - Bela Vista, Pinhalzinho/SC', 'Pinhalzinho, SC', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-chape-1', 'Padaria Oeste Catarinense', 'loja.chape1.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Av. Getúlio Vargas, 2300 - Centro, Chapecó/SC', '22.222.222/0001-01', '5549991110003', TRUE, 4.7, 88, 2, FALSE, NULL, TRUE, 325.6, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Padaria Oeste Catarinense", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-chape-1', 'user-ex-loja-chape-1', 'Padaria Oeste Catarinense', 'Padaria Oeste Catarinense Ltda', '22.222.222/0001-01', '5549991110003', 'lojaCentral', 'Padaria', 4.7, 'Av. Getúlio Vargas, 2300 - Centro, Chapecó/SC', 'Chapecó, SC', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-chape-2', 'Café & Cia Efapi', 'loja.chape2.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Rua Clevelândia, 455 - Efapi, Chapecó/SC', '22.222.222/0001-02', '5549991110004', TRUE, 4.3, 24, 0, FALSE, NULL, TRUE, 88.8, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Café & Cia Efapi", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-chape-2', 'user-ex-loja-chape-2', 'Café & Cia Efapi', 'Café & Cia Efapi Ltda', '22.222.222/0001-02', '5549991110004', 'lojaSelecao', 'Café & Alimentação', 4.3, 'Rua Clevelândia, 455 - Efapi, Chapecó/SC', 'Chapecó, SC', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-floripa-1', 'Padoca da Ilha', 'loja.floripa1.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Rua Lauro Linhares, 870 - Trindade, Florianópolis/SC', '33.333.333/0001-01', '5548991110005', TRUE, 4.9, 141, 4, FALSE, NULL, TRUE, 521.7, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Padoca da Ilha", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-floripa-1', 'user-ex-loja-floripa-1', 'Padoca da Ilha', 'Padoca da Ilha Ltda', '33.333.333/0001-01', '5548991110005', 'lojaItaipu', 'Padaria', 4.9, 'Rua Lauro Linhares, 870 - Trindade, Florianópolis/SC', 'Florianópolis, SC', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-floripa-2', 'Sabor Lagoa Salgaderia', 'loja.floripa2.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Av. das Rendeiras, 1200 - Lagoa da Conceição, Florianópolis/SC', '33.333.333/0001-02', '5548991110006', TRUE, 2.1, 19, 7, TRUE, 'Acumulou mais de 5 reclamações de 1 estrela (itens fora do padrão sanitário).', TRUE, 70.3, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Sabor Lagoa Salgaderia", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-floripa-2', 'user-ex-loja-floripa-2', 'Sabor Lagoa Salgaderia', 'Sabor Lagoa Salgaderia Ltda', '33.333.333/0001-02', '5548991110006', 'lojaKiuda', 'Salgaderia', 2.1, 'Av. das Rendeiras, 1200 - Lagoa da Conceição, Florianópolis/SC', 'Florianópolis, SC', TRUE, 'Acumulou mais de 5 reclamações de 1 estrela (itens fora do padrão sanitário).');
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-poa-1', 'Padaria Bom Fim', 'loja.poa1.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Av. Osvaldo Aranha, 960 - Bom Fim, Porto Alegre/RS', '44.444.444/0001-01', '5551991110007', TRUE, 4.5, 73, 2, FALSE, NULL, TRUE, 270.1, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Padaria Bom Fim", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-poa-1', 'user-ex-loja-poa-1', 'Padaria Bom Fim', 'Padaria Bom Fim Ltda', '44.444.444/0001-01', '5551991110007', 'lojaVilla', 'Padaria', 4.5, 'Av. Osvaldo Aranha, 960 - Bom Fim, Porto Alegre/RS', 'Porto Alegre, RS', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-poa-2', 'Confeitaria Moinhos', 'loja.poa2.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Rua Padre Chagas, 300 - Moinhos de Vento, Porto Alegre/RS', '44.444.444/0001-02', '5551991110008', TRUE, 4.8, 56, 1, FALSE, NULL, TRUE, 207.2, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Confeitaria Moinhos", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-poa-2', 'user-ex-loja-poa-2', 'Confeitaria Moinhos', 'Confeitaria Moinhos Ltda', '44.444.444/0001-02', '5551991110008', 'lojaBonissima', 'Confeitaria', 4.8, 'Rua Padre Chagas, 300 - Moinhos de Vento, Porto Alegre/RS', 'Porto Alegre, RS', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-sp-1', 'Panificadora Vila Mariana', 'loja.sp1.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Rua Domingos de Morais, 1450 - Vila Mariana, São Paulo/SP', '55.555.555/0001-01', '5511991110009', TRUE, 4.4, 210, 7, FALSE, NULL, TRUE, 777.0, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Panificadora Vila Mariana", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-sp-1', 'user-ex-loja-sp-1', 'Panificadora Vila Mariana', 'Panificadora Vila Mariana Ltda', '55.555.555/0001-01', '5511991110009', 'lojaCentral', 'Padaria', 4.4, 'Rua Domingos de Morais, 1450 - Vila Mariana, São Paulo/SP', 'São Paulo, SP', FALSE, NULL);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, nota, qtd_avaliacoes, qtd_reclamacoes, suspenso, motivo_desvinculo, termos_aceitos, lucro_acumulado, extras)
VALUES ('user-ex-loja-sp-2', 'Empório Pinheiros', 'loja.sp2.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'loja', 0, 'Rua dos Pinheiros, 780 - Pinheiros, São Paulo/SP', '55.555.555/0001-02', '5511991110010', TRUE, 4.6, 98, 3, FALSE, NULL, TRUE, 362.6, $j${"whatsappConfig": {"abrirEm": "app", "assinatura": "Equipe Empório Pinheiros", "avisarStatus": true}, "deliveryConfig": {"zones": [{"name": "Centro", "fee": 5}, {"name": "Bairros", "fee": 8}]}}$j$::jsonb);
INSERT INTO lojas (id, usuario_id, nome, razao_social, cnpj, telefone, logo, categoria, nota, endereco, cidade, suspenso, motivo_desvinculo)
VALUES ('ex-loja-sp-2', 'user-ex-loja-sp-2', 'Empório Pinheiros', 'Empório Pinheiros Ltda', '55.555.555/0001-02', '5511991110010', 'lojaSelecao', 'Café & Alimentação', 4.6, 'Rua dos Pinheiros, 780 - Pinheiros, São Paulo/SP', 'São Paulo, SP', FALSE, NULL);

-- ---------------------------------------------------------------------
-- 2. ITENS DAS LOJAS (frescos, perto do vencimento, vencidos e pausados)
-- ---------------------------------------------------------------------
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-1', 'ex-loja-pinhal-1', 'Pão Francês (kit 10 un.)', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 9.9, 6.9, 'alimento01', 'active', 'Fornada da manhã, crocante e quentinho.', 18, 0.297);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-2', 'ex-loja-pinhal-1', 'Pão de Queijo Mineiro (500 g)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 22.0, 13.2, 'alimento02', 'active', 'Massa artesanal com queijo canastra.', 9, 0.66);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-3', 'ex-loja-pinhal-1', 'Cuca de Banana', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (2), 24.0, 12.0, 'alimento03', 'active', 'Receita alemã tradicional com farofa crocante.', 4, 0.72);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-4', 'ex-loja-pinhal-1', 'Sonho de Creme', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (0), 7.5, 2.25, 'alimento04', 'active', 'Último dia de validade: desconto máximo.', 6, 0.225);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-5', 'ex-loja-pinhal-1', 'Kit Café da Manhã', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (3), 32.0, 25.6, 'alimento05', 'active', 'Pães, bolo do dia e mini salgados.', 5, 0.96);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-6', 'ex-loja-pinhal-1', 'Pão Integral de Fermentação Natural', 'salgado', CURRENT_DATE - 4, CURRENT_DATE + (-1), 18.0, 9.0, 'alimento01', 'active', 'Vencido ontem: aguardando doação ou descarte.', 2, 0.54);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-1-7', 'ex-loja-pinhal-1', 'Bolo de Fubá com Goiabada', 'doce', CURRENT_DATE - 0, CURRENT_DATE + (4), 28.0, 28.0, 'alimento03', 'inactive', 'Pausado pela loja (fora da vitrine).', 3, 0.84);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-2-1', 'ex-loja-pinhal-2', 'Torta de Morango (fatia)', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (1), 14.0, 8.4, 'alimento04', 'active', 'Creme de baunilha e morangos frescos.', 10, 0.42);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-2-2', 'ex-loja-pinhal-2', 'Brigadeiros Gourmet (caixa 12)', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (5), 36.0, 30.6, 'alimento03', 'active', 'Chocolate belga 54%.', 7, 1.08);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-2-3', 'ex-loja-pinhal-2', 'Bolo de Cenoura com Calda', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (1), 30.0, 15.0, 'alimento03', 'active', 'Calda de chocolate meio amargo.', 3, 0.9);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-2-4', 'ex-loja-pinhal-2', 'Mini Quiches Sortidas (6 un.)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 27.0, 18.9, 'alimento02', 'active', 'Alho-poró, queijo e calabresa.', 6, 0.81);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-pinhal-2-5', 'ex-loja-pinhal-2', 'Combo Doce & Salgado', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (2), 39.9, 29.9, 'alimento05', 'active', 'Seleção do dia da confeitaria.', 4, 1.197);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-1', 'ex-loja-chape-1', 'Pão Francês (kit 10 un.)', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 9.9, 6.9, 'alimento01', 'active', 'Fornada da manhã, crocante e quentinho.', 18, 0.297);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-2', 'ex-loja-chape-1', 'Pão de Queijo Mineiro (500 g)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 22.0, 13.2, 'alimento02', 'active', 'Massa artesanal com queijo canastra.', 9, 0.66);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-3', 'ex-loja-chape-1', 'Cuca de Banana', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (2), 24.0, 12.0, 'alimento03', 'active', 'Receita alemã tradicional com farofa crocante.', 4, 0.72);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-4', 'ex-loja-chape-1', 'Sonho de Creme', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (0), 7.5, 2.25, 'alimento04', 'active', 'Último dia de validade: desconto máximo.', 6, 0.225);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-5', 'ex-loja-chape-1', 'Kit Café da Manhã', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (3), 32.0, 25.6, 'alimento05', 'active', 'Pães, bolo do dia e mini salgados.', 5, 0.96);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-6', 'ex-loja-chape-1', 'Pão Integral de Fermentação Natural', 'salgado', CURRENT_DATE - 4, CURRENT_DATE + (-1), 18.0, 9.0, 'alimento01', 'active', 'Vencido ontem: aguardando doação ou descarte.', 2, 0.54);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-1-7', 'ex-loja-chape-1', 'Bolo de Fubá com Goiabada', 'doce', CURRENT_DATE - 0, CURRENT_DATE + (4), 28.0, 28.0, 'alimento03', 'inactive', 'Pausado pela loja (fora da vitrine).', 3, 0.84);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-2-1', 'ex-loja-chape-2', 'Croissant de Presunto e Queijo', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 13.0, 9.1, 'alimento01', 'active', 'Massa folhada amanteigada.', 9, 0.39);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-2-2', 'ex-loja-chape-2', 'Muffin de Mirtilo', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (3), 11.0, 8.8, 'alimento04', 'active', 'Com mirtilos frescos.', 8, 0.33);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-2-3', 'ex-loja-chape-2', 'Sanduíche Natural de Frango', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 17.0, 10.2, 'alimento02', 'active', 'Pão integral, frango e cenoura.', 6, 0.51);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-2-4', 'ex-loja-chape-2', 'Kit Lanche da Tarde', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (2), 29.0, 20.3, 'alimento05', 'active', 'Bolo, cookie e pão de queijo.', 4, 0.87);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-chape-2-5', 'ex-loja-chape-2', 'Cookies Artesanais (4 un.)', 'doce', CURRENT_DATE - 3, CURRENT_DATE + (7), 19.0, 19.0, 'alimento03', 'active', 'Gotas de chocolate.', 12, 0.57);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-1', 'ex-loja-floripa-1', 'Pão Francês (kit 10 un.)', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 9.9, 6.9, 'alimento01', 'active', 'Fornada da manhã, crocante e quentinho.', 18, 0.297);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-2', 'ex-loja-floripa-1', 'Pão de Queijo Mineiro (500 g)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 22.0, 13.2, 'alimento02', 'active', 'Massa artesanal com queijo canastra.', 9, 0.66);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-3', 'ex-loja-floripa-1', 'Cuca de Banana', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (2), 24.0, 12.0, 'alimento03', 'active', 'Receita alemã tradicional com farofa crocante.', 4, 0.72);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-4', 'ex-loja-floripa-1', 'Sonho de Creme', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (0), 7.5, 2.25, 'alimento04', 'active', 'Último dia de validade: desconto máximo.', 6, 0.225);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-5', 'ex-loja-floripa-1', 'Kit Café da Manhã', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (3), 32.0, 25.6, 'alimento05', 'active', 'Pães, bolo do dia e mini salgados.', 5, 0.96);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-6', 'ex-loja-floripa-1', 'Pão Integral de Fermentação Natural', 'salgado', CURRENT_DATE - 4, CURRENT_DATE + (-1), 18.0, 9.0, 'alimento01', 'active', 'Vencido ontem: aguardando doação ou descarte.', 2, 0.54);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-1-7', 'ex-loja-floripa-1', 'Bolo de Fubá com Goiabada', 'doce', CURRENT_DATE - 0, CURRENT_DATE + (4), 28.0, 28.0, 'alimento03', 'inactive', 'Pausado pela loja (fora da vitrine).', 3, 0.84);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-2-1', 'ex-loja-floripa-2', 'Coxinha de Frango (6 un.)', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 24.0, 14.4, 'alimento02', 'inactive', 'Massa de batata e recheio cremoso.', 12, 0.72);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-2-2', 'ex-loja-floripa-2', 'Esfiha de Carne (6 un.)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (1), 21.0, 12.6, 'alimento02', 'inactive', 'Massa leve, carne temperada.', 8, 0.63);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-2-3', 'ex-loja-floripa-2', 'Combo de Salgados Sortidos', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (2), 30.0, 21.0, 'alimento05', 'inactive', 'Coxinha, kibe, risole e enroladinho.', 6, 0.9);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-floripa-2-4', 'ex-loja-floripa-2', 'Pastel de Queijo (4 un.)', 'salgado', CURRENT_DATE - 2, CURRENT_DATE + (0), 16.0, 4.8, 'alimento01', 'inactive', 'Vence hoje.', 5, 0.48);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-1', 'ex-loja-poa-1', 'Pão Francês (kit 10 un.)', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 9.9, 6.9, 'alimento01', 'active', 'Fornada da manhã, crocante e quentinho.', 18, 0.297);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-2', 'ex-loja-poa-1', 'Pão de Queijo Mineiro (500 g)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 22.0, 13.2, 'alimento02', 'active', 'Massa artesanal com queijo canastra.', 9, 0.66);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-3', 'ex-loja-poa-1', 'Cuca de Banana', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (2), 24.0, 12.0, 'alimento03', 'active', 'Receita alemã tradicional com farofa crocante.', 4, 0.72);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-4', 'ex-loja-poa-1', 'Sonho de Creme', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (0), 7.5, 2.25, 'alimento04', 'active', 'Último dia de validade: desconto máximo.', 6, 0.225);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-5', 'ex-loja-poa-1', 'Kit Café da Manhã', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (3), 32.0, 25.6, 'alimento05', 'active', 'Pães, bolo do dia e mini salgados.', 5, 0.96);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-6', 'ex-loja-poa-1', 'Pão Integral de Fermentação Natural', 'salgado', CURRENT_DATE - 4, CURRENT_DATE + (-1), 18.0, 9.0, 'alimento01', 'active', 'Vencido ontem: aguardando doação ou descarte.', 2, 0.54);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-1-7', 'ex-loja-poa-1', 'Bolo de Fubá com Goiabada', 'doce', CURRENT_DATE - 0, CURRENT_DATE + (4), 28.0, 28.0, 'alimento03', 'inactive', 'Pausado pela loja (fora da vitrine).', 3, 0.84);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-2-1', 'ex-loja-poa-2', 'Torta de Morango (fatia)', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (1), 14.0, 8.4, 'alimento04', 'active', 'Creme de baunilha e morangos frescos.', 10, 0.42);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-2-2', 'ex-loja-poa-2', 'Brigadeiros Gourmet (caixa 12)', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (5), 36.0, 30.6, 'alimento03', 'active', 'Chocolate belga 54%.', 7, 1.08);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-2-3', 'ex-loja-poa-2', 'Bolo de Cenoura com Calda', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (1), 30.0, 15.0, 'alimento03', 'active', 'Calda de chocolate meio amargo.', 3, 0.9);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-2-4', 'ex-loja-poa-2', 'Mini Quiches Sortidas (6 un.)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 27.0, 18.9, 'alimento02', 'active', 'Alho-poró, queijo e calabresa.', 6, 0.81);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-poa-2-5', 'ex-loja-poa-2', 'Combo Doce & Salgado', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (2), 39.9, 29.9, 'alimento05', 'active', 'Seleção do dia da confeitaria.', 4, 1.197);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-1', 'ex-loja-sp-1', 'Pão Francês (kit 10 un.)', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 9.9, 6.9, 'alimento01', 'active', 'Fornada da manhã, crocante e quentinho.', 18, 0.297);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-2', 'ex-loja-sp-1', 'Pão de Queijo Mineiro (500 g)', 'salgado', CURRENT_DATE - 1, CURRENT_DATE + (2), 22.0, 13.2, 'alimento02', 'active', 'Massa artesanal com queijo canastra.', 9, 0.66);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-3', 'ex-loja-sp-1', 'Cuca de Banana', 'doce', CURRENT_DATE - 2, CURRENT_DATE + (2), 24.0, 12.0, 'alimento03', 'active', 'Receita alemã tradicional com farofa crocante.', 4, 0.72);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-4', 'ex-loja-sp-1', 'Sonho de Creme', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (0), 7.5, 2.25, 'alimento04', 'active', 'Último dia de validade: desconto máximo.', 6, 0.225);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-5', 'ex-loja-sp-1', 'Kit Café da Manhã', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (3), 32.0, 25.6, 'alimento05', 'active', 'Pães, bolo do dia e mini salgados.', 5, 0.96);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-6', 'ex-loja-sp-1', 'Pão Integral de Fermentação Natural', 'salgado', CURRENT_DATE - 4, CURRENT_DATE + (-1), 18.0, 9.0, 'alimento01', 'active', 'Vencido ontem: aguardando doação ou descarte.', 2, 0.54);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-1-7', 'ex-loja-sp-1', 'Bolo de Fubá com Goiabada', 'doce', CURRENT_DATE - 0, CURRENT_DATE + (4), 28.0, 28.0, 'alimento03', 'inactive', 'Pausado pela loja (fora da vitrine).', 3, 0.84);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-2-1', 'ex-loja-sp-2', 'Croissant de Presunto e Queijo', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 13.0, 9.1, 'alimento01', 'active', 'Massa folhada amanteigada.', 9, 0.39);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-2-2', 'ex-loja-sp-2', 'Muffin de Mirtilo', 'doce', CURRENT_DATE - 1, CURRENT_DATE + (3), 11.0, 8.8, 'alimento04', 'active', 'Com mirtilos frescos.', 8, 0.33);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-2-3', 'ex-loja-sp-2', 'Sanduíche Natural de Frango', 'salgado', CURRENT_DATE - 0, CURRENT_DATE + (1), 17.0, 10.2, 'alimento02', 'active', 'Pão integral, frango e cenoura.', 6, 0.51);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-2-4', 'ex-loja-sp-2', 'Kit Lanche da Tarde', 'misto', CURRENT_DATE - 0, CURRENT_DATE + (2), 29.0, 20.3, 'alimento05', 'active', 'Bolo, cookie e pão de queijo.', 4, 0.87);
INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, peso_unitario_kg)
VALUES ('ex-food-sp-2-5', 'ex-loja-sp-2', 'Cookies Artesanais (4 un.)', 'doce', CURRENT_DATE - 3, CURRENT_DATE + (7), 19.0, 19.0, 'alimento03', 'active', 'Gotas de chocolate.', 12, 0.57);

-- ---------------------------------------------------------------------
-- 3. CLIENTES (cidades diferentes; dois sem WhatsApp)
-- ---------------------------------------------------------------------
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-01', 'Ana Beatriz Rocha', 'ana.rocha.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 2450, 186.4, 'avatar02', 'Rua Sete de Setembro, 120 - Centro, Pinhalzinho/SC', '111.444.777-35', '5549999020001', '1994-03-12', TRUE, TRUE, $j${"cidadePreferida": "Pinhalzinho, SC"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-01', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Pinhalzinho, SC"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-02', 'Bruno Henrique Zanella', 'bruno.zanella.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 980, 64.1, 'avatar03', 'Rua Porto Alegre, 88 - Jardim, Pinhalzinho/SC', '222.555.888-46', '5549999020002', '1988-11-02', TRUE, TRUE, $j${"cidadePreferida": "Pinhalzinho, SC"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-02', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Pinhalzinho, SC"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-03', 'Carla Menegatti', 'carla.menegatti.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 3120, 241.75, 'avatar04', 'Rua Nereu Ramos, 501 - Centro, Chapecó/SC', '333.666.999-57', '5549999020003', '1999-07-21', TRUE, TRUE, $j${"cidadePreferida": "Chapecó, SC"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-03', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Chapecó, SC"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-04', 'Diego Fontana', 'diego.fontana.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 1500, 92.3, 'avatar05', 'Rua Assis Brasil, 1700 - Passo dos Fortes, Chapecó/SC', '444.777.000-68', '5549999020004', '1985-01-30', TRUE, TRUE, $j${"cidadePreferida": "Chapecó, SC"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-04', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Chapecó, SC"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-05', 'Eduarda Silveira', 'eduarda.silveira.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 4200, 318.9, 'avatar06', 'Rua Deputado Antônio Edu Vieira, 300 - Pantanal, Florianópolis/SC', '555.888.111-79', '5548999020005', '2001-05-09', TRUE, TRUE, $j${"cidadePreferida": "Florianópolis, SC"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-05', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Florianópolis, SC"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-06', 'Felipe Andrade', 'felipe.andrade.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 1000, 0, 'avatar07', 'Rua Bocaiúva, 1900 - Centro, Florianópolis/SC', NULL, '5548999020006', '1996-09-14', FALSE, TRUE, $j${"cidadePreferida": "Florianópolis, SC"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-06', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Florianópolis, SC"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-07', 'Gabriela Muller', 'gabriela.muller.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 2780, 205.6, 'avatar08', 'Rua Fernandes Vieira, 412 - Bom Fim, Porto Alegre/RS', '666.999.222-80', '5551999020007', '1992-12-25', TRUE, TRUE, $j${"cidadePreferida": "Porto Alegre, RS"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-07', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Porto Alegre, RS"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-08', 'Henrique Duarte', 'henrique.duarte.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 640, 38.0, 'avatar09', 'Av. Ipiranga, 6681 - Partenon, Porto Alegre/RS', '777.000.333-91', '5551999020008', '1979-04-18', TRUE, TRUE, $j${"cidadePreferida": "Porto Alegre, RS"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-08', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "Porto Alegre, RS"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-09', 'Isabela Nakamura', 'isabela.nakamura.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 5300, 412.2, 'avatar10', 'Rua Vergueiro, 2400 - Vila Mariana, São Paulo/SP', '888.111.444-02', '5511999020009', '1998-08-03', TRUE, TRUE, $j${"cidadePreferida": "São Paulo, SP"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-09', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "São Paulo, SP"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, valor_economizado, avatar_url, endereco, cpf_cnpj, telefone, data_nascimento, verificado, termos_aceitos, extras)
VALUES ('user-ex-cli-10', 'João Pedro Lima', 'joao.lima.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'cliente', 1200, 71.5, 'avatarPadrao', 'Rua Teodoro Sampaio, 1020 - Pinheiros, São Paulo/SP', '999.222.555-13', NULL, '1990-02-27', TRUE, TRUE, $j${"cidadePreferida": "São Paulo, SP"}$j$::jsonb);
INSERT INTO dados_usuario (usuario_id, chave, valor) VALUES ('user-ex-cli-10', 'preferencias', $j${"modoEscuro": false, "notificacoes": true, "cidade": "São Paulo, SP"}$j$::jsonb);

-- ---------------------------------------------------------------------
-- 4. ENTIDADES SOCIAIS: 5 validadas (com conta), 3 aguardando análise, 2 desvinculadas, 1 recusada
-- ---------------------------------------------------------------------
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, termos_aceitos)
VALUES ('user-ex-ent-01', 'Instituto Mãos que Alimentam', 'entidade01.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'entidade', 0, 'Rua Florianópolis, 77 - Pinhalzinho', '61.111.111/0001-11', '5549999400001', TRUE, TRUE);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, termos_aceitos)
VALUES ('user-ex-ent-02', 'Recanto Vovó Esperança', 'entidade02.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'entidade', 0, 'Rua Uruguai, 1500 - Chapecó', '61.222.222/0001-22', '5549999400002', TRUE, TRUE);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, termos_aceitos)
VALUES ('user-ex-ent-03', 'Coletivo Maré Solidária', 'entidade03.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'entidade', 0, 'Servidão dos Açores, 45 - Florianópolis', '61.333.333/0001-33', '5548999400003', TRUE, TRUE);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, termos_aceitos)
VALUES ('user-ex-ent-04', 'Panela Cheia Comunitária', 'entidade04.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'entidade', 0, 'Rua Luiz de Camões, 300 - Porto Alegre', '61.444.444/0001-44', '5551999400004', TRUE, TRUE);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, termos_aceitos)
VALUES ('user-ex-ent-05', 'Rede Pão de Cada Dia', 'entidade05.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'entidade', 0, 'Rua Santa Cruz, 900 - São Paulo', '61.555.555/0001-55', '5511999400005', TRUE, TRUE);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-01', 'user-ex-ent-01', 'Instituto Mãos que Alimentam', '61.111.111/0001-11', 'banco_de_alimentos', 'Lúcia Bortolini', 'Presidente', 'maosquealimentam.saveall@gmail.com', '(49) 3366-1001', '(49) 99940-0001', 'Rua Florianópolis, 77', 'Centro', 'Pinhalzinho', 'SC', '89870-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], TRUE, TRUE, '08:00 às 17:00 (Seg a Sex)', 'validated', '2026-02-03T10:00:00Z', TRUE, 'Coleta diária com veículo próprio refrigerado.', 'termo_oestesolidario.pdf', '4104d4bbfef774e61dfdd156c9ab20c364a9ad5738526aae8ab2ce5b75075727', now() - interval '0 days', $j${"selectionStatus": "selected", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-02', 'user-ex-ent-02', 'Recanto Vovó Esperança', '61.222.222/0001-22', 'instituicao_assistencial', 'Irmã Teresa Gaio', 'Diretora', 'recantovovoesperanca.saveall@gmail.com', NULL, '(49) 99940-0002', 'Rua Uruguai, 1500', 'Passo dos Fortes', 'Chapecó', 'SC', '89805-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'validated', '2026-03-11T14:00:00Z', TRUE, 'Atende 48 idosos; prefere pães e bolos.', 'termo_larsaovicente.pdf', '5cf0f44dff3a979d10593eeeae766c38674820f43363011c5b6a3e1c98de35cf', now() - interval '0 days', $j${"selectionStatus": "selected", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-03', 'user-ex-ent-03', 'Coletivo Maré Solidária', '61.333.333/0001-33', 'associacao', 'Marcos Vieira', 'Coordenador', 'coletivomaresolidaria.saveall@gmail.com', NULL, '(48) 99940-0003', 'Servidão dos Açores, 45', 'Saco dos Limões', 'Florianópolis', 'SC', '88045-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, TRUE, '08:00 às 17:00 (Seg a Sex)', 'validated', '2026-04-20T09:30:00Z', TRUE, 'Distribui marmitas para pessoas em situação de rua.', 'termo_ilhasemfome.pdf', 'bc0d9908f061e2a71edf82f2ef37507c8cf6b079e4bd74ee938fc5b9b1f9e40b', now() - interval '0 days', $j${"selectionStatus": "standby", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-04', 'user-ex-ent-04', 'Panela Cheia Comunitária', '61.444.444/0001-44', 'ong', 'Rosângela Freitas', 'Voluntária responsável', 'panelacheia.comunitaria.saveall@gmail.com', NULL, '(51) 99940-0004', 'Rua Luiz de Camões, 300', 'Partenon', 'Porto Alegre', 'RS', '90620-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], TRUE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'validated', '2026-05-02T11:00:00Z', TRUE, 'Serve 150 refeições por dia.', 'termo_partenon.pdf', 'a17673a8f7a7a8ecff1388b7344f901c77be3d958fcec7d2cd389a47af2ed705', now() - interval '0 days', $j${"selectionStatus": "standby", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-05', 'user-ex-ent-05', 'Rede Pão de Cada Dia', '61.555.555/0001-55', 'ong', 'Paulo Tanaka', 'Diretor executivo', 'redepaodecadadia.saveall@gmail.com', NULL, '(11) 99940-0005', 'Rua Santa Cruz, 900', 'Vila Mariana', 'São Paulo', 'SP', '04122-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], TRUE, TRUE, '08:00 às 17:00 (Seg a Sex)', 'validated', '2026-06-15T16:00:00Z', TRUE, 'Rede com 6 pontos de distribuição na zona sul.', 'termo_paopartilhado.pdf', '09fd084c4ca5e3ef7c4746a4908379134b38ef1636d7ca80eba0d38e7df16ff7', now() - interval '0 days', $j${"selectionStatus": "selected", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-06', NULL, 'Creche Pequeno Girassol', '61.666.666/0001-66', 'instituicao_assistencial', 'Juliana Paim', 'Coordenadora pedagógica', 'crechepequenogirassol.saveall@gmail.com', NULL, '(49) 99940-0006', 'Rua Pará, 240', 'Bela Vista', 'Pinhalzinho', 'SC', '89870-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'pending_review', NULL, TRUE, 'Submetido via formulário público com assinatura Gov.br', 'termo_govbr_sementinha.pdf', '8004baadf53b5ab37d0704f18482a0f4df55addecf7139778e55ff37f7b3b088', now() - interval '0 days', $j${"selectionStatus": "standby", "origin": "public_form", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-07', NULL, 'Projeto Raízes do Amanhã', '61.777.777/0001-77', 'ong', 'Anderson Moraes', 'Presidente', 'projetoraizesdoamanha.saveall@gmail.com', NULL, '(49) 99940-0007', 'Rua Alpes, 33', 'Efapi', 'Chapecó', 'SC', '89809-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'pending_review', NULL, TRUE, 'Submetido via formulário público com assinatura Gov.br', 'termo_govbr_vidanova.pdf', '907fcd82b3400b8394f866984a47faad77a4b9bd4faae77837adbcf78790f012', now() - interval '1 days', $j${"selectionStatus": "standby", "origin": "public_form", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-08', NULL, 'Casa Abrigo Ventos do Sul', '61.888.888/0001-88', 'instituicao_assistencial', 'Helena Schmidt', 'Assistente social', 'casaabrigoventosdosul.saveall@gmail.com', NULL, '(51) 99940-0008', 'Rua Dinarte Ribeiro, 150', 'Moinhos de Vento', 'Porto Alegre', 'RS', '90570-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'pending_review', NULL, TRUE, 'Submetido via formulário público com assinatura Gov.br', 'termo_govbr_moinhos.pdf', '98da8d3f203fafe41daeba255f6e40b51d17becf1c8ca1c3775eec8792b8bb02', now() - interval '2 days', $j${"selectionStatus": "standby", "origin": "public_form", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-09', NULL, 'Associação Vizinhança Unida', '61.999.999/0001-99', 'associacao', 'Sérgio Amaral', 'Tesoureiro', 'vizinhancaunida.saveall@gmail.com', NULL, '(48) 99940-0009', 'Rua Henrique Veras, 600', 'Lagoa da Conceição', 'Florianópolis', 'SC', '88062-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'unlinked', '2026-01-20T10:00:00Z', FALSE, 'Desvinculada: não retirou três doações confirmadas seguidas.', 'termo_amigoslagoa.pdf', '212dbf02f80b661684722e8d6caf9aa14ad09a89a4b3787f6a838ce1c071a8fb', now() - interval '0 days', $j${"selectionStatus": "standby", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-10', NULL, 'Grupo Mesa Fraterna', '62.101.010/0001-10', 'ong', 'Beatriz Campos', 'Presidente', 'grupomesafraterna.saveall@gmail.com', NULL, '(11) 99940-0010', 'Rua Cardeal Arcoverde, 1100', 'Pinheiros', 'São Paulo', 'SP', '05407-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'unlinked', '2026-02-28T10:00:00Z', FALSE, 'Desvinculada: documentação do CNPJ vencida.', 'termo_pinheiros.pdf', '7bbaf98bcf0c4244e023d7d8de32146b5528915a1493c3e6263e3b0970452a68', now() - interval '0 days', $j${"selectionStatus": "standby", "origin": "manual", "govSignatureVerified": true}$j$::jsonb);
INSERT INTO entidades_sociais (id, usuario_id, nome, cnpj, tipo_organizacao, responsavel_legal, cargo_responsavel, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep, categorias_aceitas, possui_refrigeracao, possui_transporte, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, termo_adesao_arquivo, termo_adesao_hash, criado_em, extras)
VALUES ('ex-ent-11', NULL, 'Clube Recreativo Arco-Íris', '62.111.111/0001-21', 'outro', 'Valdir Kunz', 'Diretor', 'cluberecreativoarcoiris.saveall@gmail.com', NULL, '(49) 99940-0011', 'Rua Goiás, 12', 'Centro', 'Pinhalzinho', 'SC', '89870-000', ARRAY['Padaria','Salgados','Doces','Hortifrúti']::text[], FALSE, FALSE, '08:00 às 17:00 (Seg a Sex)', 'rejected', NULL, TRUE, 'Recusada: estatuto não prevê atividade assistencial.', 'termo_govbr_esperanca.pdf', 'a5867b4ebab14671a55902d0d0a7c3b2213d3c6ee17480340248e682c72998fb', now() - interval '5 days', $j${"selectionStatus": "rejected", "origin": "public_form", "govSignatureVerified": true}$j$::jsonb);

-- ---------------------------------------------------------------------
-- 5. UNIDADES DE DESCARTE (+ conta de acesso da primeira)
-- ---------------------------------------------------------------------
INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, extras)
VALUES ('ex-desc-01', 'Compostagem Terra Viva', '71.111.111/0001-11', 'COMPOSTAGEM', 'IMA/SC-LAO-2025-00311', 'Linha São Roque, s/n', 'Chapecó', 'SC', '89800-000', 'Eng. Fernanda Lazzari', 'compostagemterraviva.saveall@gmail.com', '(49) 99950-0001', 3000, '07:00 às 17:00', 'validated', '2026-03-01T08:00:00Z', TRUE, 'Transforma resíduos orgânicos em adubo para agricultura familiar.', $j${}$j$::jsonb);
INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, extras)
VALUES ('ex-desc-02', 'BioEnergia Maresia', '71.222.222/0001-22', 'BIODIGESTOR', 'IMA/SC-LAO-2025-00902', 'Rodovia SC-405, km 3', 'Florianópolis', 'SC', '88066-000', 'Eng. Ricardo Pires', 'bioenergiamaresia.saveall@gmail.com', '(48) 99950-0002', 8000, '24 horas', 'validated', '2026-04-10T08:00:00Z', TRUE, 'Biodigestor que gera energia a partir de resíduos de alimentos.', $j${}$j$::jsonb);
INSERT INTO destinos_descarte (id, nome, cnpj, tipo_tratamento, licenca_ambiental, endereco, cidade, uf, cep, responsavel, email, whatsapp, capacidade_diaria_kg, horario_funcionamento, status_validacao, validado_em, ativo, observacoes, extras)
VALUES ('ex-desc-03', 'Ração Campo Forte', '71.333.333/0001-33', 'OUTRO', 'FEPAM-LO-2025-4410', 'Estrada do Lami, 2000', 'Porto Alegre', 'RS', '91790-000', 'Zootecnista Carla Becker', 'racaocampoforte.saveall@gmail.com', '(51) 99950-0003', 5000, '06:00 às 16:00', 'validated', '2026-05-18T08:00:00Z', TRUE, 'Aproveita pães e massas na produção de ração.', $j${"treatmentTypeOriginal": "RACAO_ANIMAL"}$j$::jsonb);
INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, telefone, verificado, termos_aceitos)
VALUES ('user-ex-desc-01', 'Compostagem Terra Viva', 'descarte01.saveall@gmail.com', '$2a$10$kQExLxC0Vc7vKTqe0sLT9.EcYqtah62k6Cu7idaoLPA8BGNzZ40ke', 'descarte', 0, 'Linha São Roque, s/n - Chapecó/SC', '71.111.111/0001-11', '5549999500001', TRUE, TRUE);

-- ---------------------------------------------------------------------
-- 6. PEDIDOS (o gatilho cria a transação de venda e os itens; entrega feita pela própria loja)
-- ---------------------------------------------------------------------
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-01', 'Ana Beatriz Rocha', 'ex-loja-pinhal-1', 'Panificadora Pão Dourado', 27.0, 5.0, 0, 0, 32.0, 'Pix', 'pending', 'Rua Sete de Setembro, 120 - Centro, Pinhalzinho/SC', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-001"}$j$::jsonb, now() - interval '0.2 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-pinhal-1-1', 'Pão Francês (kit 10 un.)', 2, 6.9),
  ('ex-food-pinhal-1-2', 'Pão de Queijo Mineiro (500 g)', 1, 13.2)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-02', 'Bruno Henrique Zanella', 'ex-loja-pinhal-2', 'Doce Encanto Confeitaria', 16.8, 5.0, 0, 0, 21.8, 'Cartão', 'preparing', 'Rua Porto Alegre, 88 - Jardim, Pinhalzinho/SC', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-002"}$j$::jsonb, now() - interval '0.6 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-pinhal-2-1', 'Torta de Morango (fatia)', 2, 8.4)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-01', 'Ana Beatriz Rocha', 'ex-loja-pinhal-1', 'Panificadora Pão Dourado', 25.6, 5.0, 0, 0, 30.6, 'Pix', 'delivery', 'Rua Sete de Setembro, 120 - Centro, Pinhalzinho/SC', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-003"}$j$::jsonb, now() - interval '1.0 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-pinhal-1-5', 'Kit Café da Manhã', 1, 25.6)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-02', 'Bruno Henrique Zanella', 'ex-loja-pinhal-1', 'Panificadora Pão Dourado', 18.9, 5.0, 0, 0, 23.9, 'Dinheiro', 'delivered', 'Rua Porto Alegre, 88 - Jardim, Pinhalzinho/SC', 5, 'Cuca maravilhosa, chegou quentinha!', FALSE, now() - interval '2.5 hours', now() - interval '2.7 hours', $j${"codigoExemplo": "ex-004"}$j$::jsonb, now() - interval '3 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-pinhal-1-3', 'Cuca de Banana', 1, 12.0),
  ('ex-food-pinhal-1-1', 'Pão Francês (kit 10 un.)', 1, 6.9)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-03', 'Carla Menegatti', 'ex-loja-chape-1', 'Padaria Oeste Catarinense', 26.4, 5.0, 0, 0, 31.4, 'Pix', 'pending', 'Rua Nereu Ramos, 501 - Centro, Chapecó/SC', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-005"}$j$::jsonb, now() - interval '0.1 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-chape-1-2', 'Pão de Queijo Mineiro (500 g)', 2, 13.2)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-04', 'Diego Fontana', 'ex-loja-chape-2', 'Café & Cia Efapi', 20.3, 5.0, 0, 0, 25.3, 'Cartão', 'delivered', 'Rua Assis Brasil, 1700 - Passo dos Fortes, Chapecó/SC', 4, 'Muito bom custo-benefício.', FALSE, now() - interval '25.5 hours', now() - interval '25.7 hours', $j${"codigoExemplo": "ex-006"}$j$::jsonb, now() - interval '26 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-chape-2-4', 'Kit Lanche da Tarde', 1, 20.3)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-03', 'Carla Menegatti', 'ex-loja-chape-1', 'Padaria Oeste Catarinense', 18.9, 5.0, 0, 0, 23.9, 'Pix', 'delivered', 'Rua Nereu Ramos, 501 - Centro, Chapecó/SC', 5, '', FALSE, now() - interval '49.5 hours', now() - interval '49.7 hours', $j${"codigoExemplo": "ex-007"}$j$::jsonb, now() - interval '50 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-chape-1-1', 'Pão Francês (kit 10 un.)', 1, 6.9),
  ('ex-food-chape-1-3', 'Cuca de Banana', 1, 12.0)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-05', 'Eduarda Silveira', 'ex-loja-floripa-1', 'Padoca da Ilha', 25.6, 5.0, 0, 0, 30.6, 'Pix', 'preparing', 'Rua Deputado Antônio Edu Vieira, 300 - Pantanal, Florianópolis/SC', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-008"}$j$::jsonb, now() - interval '0.4 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-floripa-1-5', 'Kit Café da Manhã', 1, 25.6)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-06', 'Felipe Andrade', 'ex-loja-floripa-2', 'Sabor Lagoa Salgaderia', 14.4, 5.0, 0, 0, 19.4, 'Cartão', 'delivered', 'Rua Bocaiúva, 1900 - Centro, Florianópolis/SC', 1, 'Salgado estava velho e sem sabor.', TRUE, now() - interval '119.5 hours', now() - interval '119.7 hours', $j${"codigoExemplo": "ex-009"}$j$::jsonb, now() - interval '120 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-floripa-2-1', 'Coxinha de Frango (6 un.)', 1, 14.4)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-05', 'Eduarda Silveira', 'ex-loja-floripa-1', 'Padoca da Ilha', 17.7, 5.0, 0, 0, 22.7, 'Pix', 'delivered', 'Rua Deputado Antônio Edu Vieira, 300 - Pantanal, Florianópolis/SC', NULL, NULL, FALSE, NULL, now() - interval '4.7 hours', $j${"codigoExemplo": "ex-010"}$j$::jsonb, now() - interval '5 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-floripa-1-2', 'Pão de Queijo Mineiro (500 g)', 1, 13.2),
  ('ex-food-floripa-1-4', 'Sonho de Creme', 2, 2.25)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-07', 'Gabriela Muller', 'ex-loja-poa-1', 'Padaria Bom Fim', 20.7, 5.0, 0, 0, 25.7, 'Dinheiro', 'delivery', 'Rua Fernandes Vieira, 412 - Bom Fim, Porto Alegre/RS', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-011"}$j$::jsonb, now() - interval '0.8 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-poa-1-1', 'Pão Francês (kit 10 un.)', 3, 6.9)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-08', 'Henrique Duarte', 'ex-loja-poa-2', 'Confeitaria Moinhos', 30.6, 5.0, 0, 0, 35.6, 'Cartão', 'delivered', 'Av. Ipiranga, 6681 - Partenon, Porto Alegre/RS', 5, 'Brigadeiros perfeitos.', FALSE, now() - interval '29.5 hours', now() - interval '29.7 hours', $j${"codigoExemplo": "ex-012"}$j$::jsonb, now() - interval '30 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-poa-2-2', 'Brigadeiros Gourmet (caixa 12)', 1, 30.6)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-07', 'Gabriela Muller', 'ex-loja-poa-2', 'Confeitaria Moinhos', 15.0, 5.0, 0, 0, 20.0, 'Pix', 'cancelled', 'Rua Fernandes Vieira, 412 - Bom Fim, Porto Alegre/RS', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-013"}$j$::jsonb, now() - interval '8 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-poa-2-3', 'Bolo de Cenoura com Calda', 1, 15.0)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-09', 'Isabela Nakamura', 'ex-loja-sp-1', 'Panificadora Vila Mariana', 39.4, 5.0, 0, 0, 44.4, 'Pix', 'pending', 'Rua Vergueiro, 2400 - Vila Mariana, São Paulo/SP', NULL, NULL, FALSE, NULL, NULL, $j${"codigoExemplo": "ex-014"}$j$::jsonb, now() - interval '0.05 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-sp-1-1', 'Pão Francês (kit 10 un.)', 2, 6.9),
  ('ex-food-sp-1-5', 'Kit Café da Manhã', 1, 25.6)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-10', 'João Pedro Lima', 'ex-loja-sp-2', 'Empório Pinheiros', 37.9, 5.0, 0, 0, 42.9, 'Cartão', 'delivered', 'Rua Teodoro Sampaio, 1020 - Pinheiros, São Paulo/SP', NULL, NULL, FALSE, NULL, now() - interval '1.7 hours', $j${"codigoExemplo": "ex-015"}$j$::jsonb, now() - interval '2 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-sp-2-4', 'Kit Lanche da Tarde', 1, 20.3),
  ('ex-food-sp-2-2', 'Muffin de Mirtilo', 2, 8.8)
) AS v(alimento_id, nome, quantidade, preco);
WITH novo AS (
  INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, nota_comida, comentario_comida, reclamacao_comida, avaliado_em, entregue_em, extras, criado_em)
  VALUES ('user-ex-cli-09', 'Isabela Nakamura', 'ex-loja-sp-2', 'Empório Pinheiros', 18.2, 5.0, 0, 0, 23.2, 'Pix', 'delivered', 'Rua Vergueiro, 2400 - Vila Mariana, São Paulo/SP', 4, 'Entrega demorou um pouco.', FALSE, now() - interval '239.5 hours', now() - interval '239.7 hours', $j${"codigoExemplo": "ex-016"}$j$::jsonb, now() - interval '240 hours')
  RETURNING id
)
INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco)
SELECT novo.id, v.alimento_id, v.nome, v.quantidade, v.preco FROM novo, (VALUES
  ('ex-food-sp-2-1', 'Croissant de Presunto e Queijo', 2, 9.1)
) AS v(alimento_id, nome, quantidade, preco);

-- ---------------------------------------------------------------------
-- 7. DOAÇÕES (aguardando, aceita, recusada e concluídas). O gatilho cria a transação e o termo;
--    aqui entram o alimento doado (transacao_itens) e as assinaturas do termo.
-- ---------------------------------------------------------------------
WITH d AS (
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, criado_em, extras) VALUES ('ex-don-01', 'tok-ex-7f3k9q2a', 'ex-loja-pinhal-1', 'ex-ent-01', 'Excedente do dia em perfeito estado, embalado.', CURRENT_DATE + 1, 'pickup_by_entity', 'pending_inquiry', now() - interval '1 hours', now() - interval '1 hours', $j${"category": "Padaria"}$j$::jsonb)
  RETURNING transacao_id
)
INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
SELECT transacao_id, 'ex-food-pinhal-1-6', 'Pão Integral de Fermentação Natural', 'salgado', 6, 2.4, 0 FROM d;
WITH d AS (
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, criado_em, extras, respondido_em, confirmado_por, previsao_retirada, nota_resposta) VALUES ('ex-don-02', 'tok-ex-b81m4x7z', 'ex-loja-chape-1', 'ex-ent-02', 'Excedente do dia em perfeito estado, embalado.', CURRENT_DATE + 1, 'pickup_by_entity', 'accepted', now() - interval '20 hours', now() - interval '20 hours', $j${"category": "Padaria"}$j$::jsonb, now() - interval '18 hours', 'Irmã Teresa Gaio', '16:30', 'Retiramos hoje à tarde.')
  RETURNING transacao_id
)
INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
SELECT transacao_id, 'ex-food-chape-1-4', 'Sonho de Creme', 'doce', 10, 3.0, 0 FROM d;
INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, hash_sha256)
SELECT id, 'receptor', 'Irmã Teresa Gaio', NULL, 'govbr', '06e6f947aeaef8cd7a5282842c9be154e5793943c1829d1c38a77ab2c424dcb3' FROM termos_doacao WHERE doacao_id = 'ex-don-02';
WITH d AS (
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, criado_em, extras, respondido_em, motivo_rejeicao) VALUES ('ex-don-03', 'tok-ex-q2w8e5r1', 'ex-loja-floripa-1', 'ex-ent-03', 'Excedente do dia em perfeito estado, embalado.', CURRENT_DATE + 1, 'pickup_by_entity', 'rejected', now() - interval '48 hours', now() - interval '48 hours', $j${"category": "Padaria"}$j$::jsonb, now() - interval '46 hours', 'Sem espaço refrigerado no momento')
  RETURNING transacao_id
)
INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
SELECT transacao_id, 'ex-food-floripa-1-1', 'Pão Francês (kit 10 un.)', 'salgado', 15, 4.5, 0 FROM d;
WITH d AS (
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, criado_em, extras, respondido_em, concluida_em, confirmado_por) VALUES ('ex-don-04', 'tok-ex-z9y6t3u0', 'ex-loja-sp-1', 'ex-ent-05', 'Excedente do dia em perfeito estado, embalado.', CURRENT_DATE + 1, 'pickup_by_entity', 'completed', now() - interval '96 hours', now() - interval '96 hours', $j${"category": "Padaria"}$j$::jsonb, now() - interval '94 hours', now() - interval '90 hours', 'Paulo Tanaka')
  RETURNING transacao_id
)
INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
SELECT transacao_id, 'ex-food-sp-1-2', 'Pão de Queijo Mineiro (500 g)', 'salgado', 20, 6.0, 0 FROM d;
INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, hash_sha256)
SELECT id, 'receptor', 'Paulo Tanaka', NULL, 'govbr', '3725da1017b3e805d4903cfd75b31b1361c4ce14fa0f82c6bd70164235aba49c' FROM termos_doacao WHERE doacao_id = 'ex-don-04';
INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, certificado, hash_sha256)
SELECT id, 'doador', 'Panificadora Vila Mariana', '55.555.555/0001-01', 'certificado_digital', 'Certificado A1 (exemplo)', '5ba46988849fe126f70d8b0f27a25fc705e77bdf2616d1ab80750035356a73b5' FROM termos_doacao WHERE doacao_id = 'ex-don-04';
WITH d AS (
  INSERT INTO doacoes (id, token, loja_id, entidade_id, descricao, data_validade, forma_entrega, status, notificado_em, criado_em, extras, respondido_em, concluida_em, confirmado_por) VALUES ('ex-don-05', 'tok-ex-p4l0m2n8', 'ex-loja-poa-1', 'ex-ent-04', 'Excedente do dia em perfeito estado, embalado.', CURRENT_DATE + 1, 'pickup_by_entity', 'completed', now() - interval '840 hours', now() - interval '840 hours', $j${"category": "Padaria", "log": {"id": "ex-esg-05", "type": "donation", "foodName": "Pão Francês (kit 10 un.)", "category": "Padaria", "weightEstimatedKg": 5.5, "quantity": 30, "recipientOrganization": "Panela Cheia Comunitária", "signatureName": "Padaria Bom Fim", "date": "(ver concluida_em)"}}$j$::jsonb, now() - interval '838 hours', now() - interval '834 hours', 'Rosângela Freitas')
  RETURNING transacao_id
)
INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor)
SELECT transacao_id, 'ex-food-poa-1-1', 'Pão Francês (kit 10 un.)', 'salgado', 30, 5.5, 0 FROM d;
INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, hash_sha256)
SELECT id, 'receptor', 'Rosângela Freitas', NULL, 'govbr', 'fd4a0defcb8de3bc2466e219d033c3dd7b0fc3ea59b8f0374b7f543f431bced6' FROM termos_doacao WHERE doacao_id = 'ex-don-05';
INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, certificado, hash_sha256)
SELECT id, 'doador', 'Padaria Bom Fim', '44.444.444/0001-01', 'certificado_digital', 'Certificado A1 (exemplo)', '7d6ddb73af80c6aa1b08752572925124a7208a70dc41dc6c672156613a3f4fbf' FROM termos_doacao WHERE doacao_id = 'ex-don-05';
UPDATE doacoes SET extras = jsonb_set(extras, '{log,date}', to_jsonb(to_char(concluida_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) WHERE id = 'ex-don-05';

-- ---------------------------------------------------------------------
-- 8. DESCARTES (o gatilho cria a transação de descarte e o item)
-- ---------------------------------------------------------------------
INSERT INTO registros_descarte (id, loja_id, destino_id, alimento_id, descricao_item, categoria, quantidade, kg, tipo_destinacao, motivo, responsavel_nome, tipo_assinatura, certificado, destinacao_confirmada_em, criado_em, extras)
VALUES ('ex-esg-02', 'ex-loja-pinhal-2', 'ex-desc-01', 'ex-food-pinhal-2-3', 'Bolo de Cenoura com Calda', 'doce', 2, 1.5, 'COMPOSTAGEM', 'Validade expirada', 'Responsável Técnico (exemplo)', 'certificado_digital', 'Certificado A1 (exemplo)', now() - interval '5 days', now() - interval '5 days', $j${"signatureName": "Doce Encanto Confeitaria"}$j$::jsonb);
INSERT INTO registros_descarte (id, loja_id, destino_id, alimento_id, descricao_item, categoria, quantidade, kg, tipo_destinacao, motivo, responsavel_nome, tipo_assinatura, certificado, destinacao_confirmada_em, criado_em, extras)
VALUES ('ex-esg-04', 'ex-loja-floripa-1', 'ex-desc-02', 'ex-food-floripa-1-4', 'Sonho de Creme', 'doce', 5, 0.8, 'BIODIGESTOR', 'Validade expirada', 'Responsável Técnico (exemplo)', 'certificado_digital', 'Certificado A1 (exemplo)', now() - interval '20 days', now() - interval '20 days', $j${"signatureName": "Padoca da Ilha"}$j$::jsonb);
INSERT INTO registros_descarte (id, loja_id, destino_id, alimento_id, descricao_item, categoria, quantidade, kg, tipo_destinacao, motivo, responsavel_nome, tipo_assinatura, certificado, destinacao_confirmada_em, criado_em, extras)
VALUES ('ex-esg-07', 'ex-loja-chape-2', 'ex-desc-01', 'ex-food-chape-2-2', 'Muffin de Mirtilo', 'doce', 6, 2.2, 'COMPOSTAGEM', 'Validade expirada', 'Responsável Técnico (exemplo)', 'certificado_digital', 'Certificado A1 (exemplo)', now() - interval '40 days', now() - interval '40 days', $j${"signatureName": "Café & Cia Efapi"}$j$::jsonb);

-- ---------------------------------------------------------------------
-- 9. CHAMADOS DE SUPORTE
-- ---------------------------------------------------------------------
INSERT INTO suporte_chamados (id, dados, criado_por, criado_em)
VALUES ('ex-tkt-01', $j${"userId": "user-ex-cli-03", "userName": "Carla Menegatti", "userEmail": "carla.menegatti.saveall@gmail.com", "userRole": "client", "subject": "Pontos não apareceram", "message": "Fiz um pedido ontem e os pontos ainda não entraram no meu saldo.", "status": "open", "priority": "medium"}$j$::jsonb || jsonb_build_object('criadoEm', to_char((now() - interval '5 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), 'user-ex-cli-03', now() - interval '5 hours');
INSERT INTO suporte_chamados (id, dados, criado_por, criado_em)
VALUES ('ex-tkt-02', $j${"userId": "user-ex-loja-chape-2", "userName": "Café & Cia Efapi", "userEmail": "loja.chape2.saveall@gmail.com", "userRole": "store", "subject": "Como cadastrar taxa por CEP?", "message": "Quero cobrar frete diferente para o bairro Efapi.", "status": "answered", "priority": "low", "response": "Nas Configurações da loja, toque em \"Configurar Taxas de Entrega\" e adicione a faixa de CEP.", "respondedBy": "admin"}$j$::jsonb || jsonb_build_object('criadoEm', to_char((now() - interval '30 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), 'user-ex-loja-chape-2', now() - interval '30 hours');
INSERT INTO suporte_chamados (id, dados, criado_por, criado_em)
VALUES ('ex-tkt-03', $j${"userId": "user-ex-loja-floripa-2", "userName": "Sabor Lagoa Salgaderia", "userEmail": "loja.floripa2.saveall@gmail.com", "userRole": "store", "subject": "Contestação de suspensão", "message": "Gostaria de contestar a suspensão da loja; trocamos o fornecedor.", "status": "open", "priority": "high"}$j$::jsonb || jsonb_build_object('criadoEm', to_char((now() - interval '12 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), 'user-ex-loja-floripa-2', now() - interval '12 hours');

COMMIT;

-- Conferência rápida
SELECT 'usuarios' AS tabela, count(*) FROM usuarios WHERE id LIKE 'user-ex-%'
UNION ALL SELECT 'lojas', count(*) FROM lojas WHERE id LIKE 'ex-%'
UNION ALL SELECT 'alimentos', count(*) FROM alimentos WHERE id LIKE 'ex-%'
UNION ALL SELECT 'pedidos', count(*) FROM pedidos WHERE extras ? 'codigoExemplo'
UNION ALL SELECT 'entidades', count(*) FROM entidades_sociais WHERE id LIKE 'ex-%'
UNION ALL SELECT 'doacoes', count(*) FROM doacoes WHERE id LIKE 'ex-%'
UNION ALL SELECT 'descartes', count(*) FROM registros_descarte WHERE id LIKE 'ex-%'
UNION ALL SELECT 'transacoes', count(*) FROM transacoes WHERE loja_id LIKE 'ex-loja-%';

-- =====================================================================
-- Contas para testar (senha 123456):
--   Cliente ....... ana.rocha.saveall@gmail.com (Pinhalzinho) | isabela.nakamura.saveall@gmail.com (São Paulo)
--   Loja .......... loja.pinhal1.saveall@gmail.com | loja.chape1.saveall@gmail.com | loja.floripa1.saveall@gmail.com
--   Loja suspensa . loja.floripa2.saveall@gmail.com (o login é bloqueado de propósito)
--   Entidade ...... entidade01.saveall@gmail.com (Instituto Mãos que Alimentam)
--   Descarte ...... descarte01.saveall@gmail.com (Compostagem Terra Viva)
-- Link público de doação aguardando resposta: /#/confirmar-doacao?id=tok-ex-7f3k9q2a
-- =====================================================================
