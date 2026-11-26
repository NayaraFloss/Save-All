// =====================================================================
// rotas/index.js — MAPA DE ENDEREÇOS DA API
// Cada linha "rotas.get/post/put/patch/delete" diz: quando chegar um
// pedido NESTE endereço, passe por ESTES porteiros e chame ESTA função.
// =====================================================================

// Importa o "Router" do Express, que agrupa rotas
import { Router } from "express";
// Importa o limitador de tentativas (bloqueia quem faz pedidos demais)
import rateLimit from "express-rate-limit";
// Importa o embrulho que encaminha erros de funções assíncronas
import { assincrono } from "../utils/erros.js";
// Importa os porteiros "precisa estar logado" e "precisa ter tal perfil"
import { exigirLogin, exigirPerfil } from "../middlewares/auth.js";
// Importa todas as funções de autenticação (login, cadastro...) com o apelido "auth"
import * as auth from "../controladores/auth.js";
// Importa as funções de lojas
import * as lojas from "../controladores/lojas.js";
// Importa as funções de alimentos
import * as alimentos from "../controladores/alimentos.js";
// Importa as funções de pedidos
import * as pedidos from "../controladores/pedidos.js";
// Importa as funções de coleções genéricas (parceiros, ofertas, registros...)
import * as colecoes from "../controladores/colecoes.js";
// Importa as funções de preferências do usuário
import * as dadosUsuario from "../controladores/dadosUsuario.js";
// Importa as funções das páginas públicas (sem login)
import * as publico from "../controladores/publico.js";
// Importa as funções do painel do administrador
import * as master from "../controladores/master.js";

// Cria o agrupador de rotas
const rotas = Router();

// Limita tentativas de login/cadastro por IP (proteção contra força bruta).
const limiteAuth = rateLimit({
  // Janela de tempo: 15 minutos (15 x 60 segundos x 1000 milissegundos)
  windowMs: 15 * 60 * 1000,
  // No máximo 30 tentativas por IP dentro dessa janela
  limit: 30,
  // Informa o limite nos cabeçalhos no formato moderno
  standardHeaders: "draft-7",
  // Não usa os cabeçalhos antigos (X-RateLimit-...)
  legacyHeaders: false,
  // Mensagem enviada quando o limite estoura
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
// Fecha a configuração
});

// Formulários públicos (sem login): limite mais folgado que o do login, mas ainda protegido.
const limitePublico = rateLimit({
  // Janela de 15 minutos
  windowMs: 15 * 60 * 1000,
  // No máximo 60 tentativas
  limit: 60,
  // Cabeçalhos modernos
  standardHeaders: "draft-7",
  // Sem cabeçalhos antigos
  legacyHeaders: false,
  // Mensagem de limite estourado
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
// Fecha a configuração
});

// GET /saude: rota de teste que só responde { ok: true } (serve para ver se a API está no ar)
rotas.get("/saude", (_req, res) => res.json({ ok: true }));

// Autenticação
// POST /auth/login: faz login (com limite de tentativas)
rotas.post("/auth/login", limiteAuth, assincrono(auth.login));
// POST /auth/signup: cria uma conta nova (com limite de tentativas)
rotas.post("/auth/signup", limiteAuth, assincrono(auth.cadastrar));
// GET /auth/me: devolve os dados de quem está logado
// Sem login responde null (200), para visitantes de links públicos não gerarem erro 401
rotas.get("/auth/me", assincrono(auth.eu));
// PUT /auth/update-profile: atualiza o perfil de quem está logado
rotas.put(
  // Endereço
  "/auth/update-profile",
  // Precisa estar logado
  exigirLogin,
  // Função que faz o trabalho
  assincrono(auth.atualizarPerfil),
// Fecha a rota
);
// POST /auth/logout: sai da conta (apaga o cookie)
rotas.post("/auth/logout", assincrono(auth.sair));
// GET /auth/disponibilidade: verifica se e-mail/CPF/CNPJ já estão em uso
rotas.get(
  // Endereço
  "/auth/disponibilidade",
  // Limite de tentativas público
  limitePublico,
  // Função que faz o trabalho
  assincrono(auth.disponibilidade),
// Fecha a rota
);

// Preferências e estado de tela do usuário logado (modo escuro, cidade, mensagens lidas...)
// GET /me/dados: lista todas as preferências do usuário
rotas.get("/me/dados", exigirLogin, assincrono(dadosUsuario.listar));
// PUT /me/dados/:chave: salva uma preferência (":chave" é uma parte variável do endereço)
rotas.put("/me/dados/:chave", exigirLogin, assincrono(dadosUsuario.salvar));

// Lojas e alimentos: leitura pública, escrita só para estabelecimentos (e master)
// GET /stores: lista as lojas (qualquer pessoa pode ver)
rotas.get("/stores", assincrono(lojas.listar));
// GET /foods: lista os alimentos à venda (qualquer pessoa pode ver)
rotas.get("/foods", assincrono(alimentos.listar));
// Painel master: todos os itens lançados (editar/excluir usam PUT/DELETE /foods/:id)
// GET /master/alimentos: lista TODOS os alimentos (só administrador)
rotas.get(
  // Endereço
  "/master/alimentos",
  // Precisa estar logado
  exigirLogin,
  // Precisa ser master
  exigirPerfil("master"),
  // Função
  assincrono(alimentos.listarTodos),
// Fecha a rota
);
// RN02: monta um pedido sorteando itens de todas as lojas por valor informado pelo cliente.
// GET /foods/sortear-por-valor: sorteia itens até chegar no valor pedido
rotas.get("/foods/sortear-por-valor", assincrono(alimentos.sortearPorValor));
// POST /foods: cadastra um alimento novo
rotas.post(
  // Endereço
  "/foods",
  // Precisa estar logado
  exigirLogin,
  // Só loja ou master
  exigirPerfil("loja", "master"),
  // Função
  assincrono(alimentos.criar),
// Fecha a rota
);
// PUT /foods/:id: altera um alimento existente (":id" é o código do alimento)
rotas.put(
  // Endereço
  "/foods/:id",
  // Precisa estar logado
  exigirLogin,
  // Só loja ou master
  exigirPerfil("loja", "master"),
  // Função
  assincrono(alimentos.atualizar),
// Fecha a rota
);
// Doar/descartar vencidos: remove só os lotes vencidos e mantém os lotes bons no estoque
// POST /foods/:id/baixar-vencidos
rotas.post(
  // Endereço
  "/foods/:id/baixar-vencidos",
  // Precisa estar logado
  exigirLogin,
  // Só loja ou master
  exigirPerfil("loja", "master"),
  // Função
  assincrono(alimentos.baixarVencidos),
// Fecha a rota
);
// DELETE /foods/:id: apaga um alimento
rotas.delete(
  // Endereço
  "/foods/:id",
  // Precisa estar logado
  exigirLogin,
  // Só loja ou master
  exigirPerfil("loja", "master"),
  // Função
  assincrono(alimentos.remover),
// Fecha a rota
);

// Pedidos
// GET /orders: lista os pedidos (cada perfil vê os seus)
rotas.get("/orders", exigirLogin, assincrono(pedidos.listar));
// POST /orders: cria um pedido novo
rotas.post(
  // Endereço
  "/orders",
  // Precisa estar logado
  exigirLogin,
  // Só cliente pode comprar
  exigirPerfil("cliente"),
  // Função
  assincrono(pedidos.criar),
// Fecha a rota
);
// PATCH /orders/:id: altera parte de um pedido (status, avaliação...)
rotas.patch("/orders/:id", exigirLogin, assincrono(pedidos.atualizar));

// Coleções que ficavam no localStorage: parceiros-sociais, parceiros-descarte,
// ofertas-doacao, registros-descarte e chamados-suporte (regras em controladores/colecoes.js)
// GET /dados/:colecao: lista os registros de uma coleção
rotas.get("/dados/:colecao", exigirLogin, assincrono(colecoes.listar));
// PUT /dados/:colecao/:id: cria ou atualiza um registro
rotas.put("/dados/:colecao/:id", exigirLogin, assincrono(colecoes.salvar));
// DELETE /dados/:colecao/:id: apaga um registro
rotas.delete("/dados/:colecao/:id", exigirLogin, assincrono(colecoes.remover));

// Rotas públicas: portal de credenciamento e link de confirmação de doação
// GET /publico/parceiros-sociais: lista entidades sociais (sem login)
rotas.get(
  // Endereço
  "/publico/parceiros-sociais",
  // Limite público
  limitePublico,
  // Função
  assincrono(publico.listarParceirosSociais),
// Fecha a rota
);
// POST /publico/parceiros-sociais: entidade pede credenciamento (sem login)
rotas.post(
  // Endereço
  "/publico/parceiros-sociais",
  // Limite público
  limitePublico,
  // Função
  assincrono(publico.credenciarEntidade),
// Fecha a rota
);
// GET /publico/ofertas-doacao/:chave: abre uma oferta de doação pelo link recebido
rotas.get(
  // Endereço (":chave" é o código secreto do link)
  "/publico/ofertas-doacao/:chave",
  // Limite público
  limitePublico,
  // Função
  assincrono(publico.buscarOferta),
// Fecha a rota
);
// POST /publico/ofertas-doacao/:chave/resposta: entidade aceita ou recusa a doação
rotas.post(
  // Endereço
  "/publico/ofertas-doacao/:chave/resposta",
  // Limite público
  limitePublico,
  // Função
  assincrono(publico.responderOferta),
// Fecha a rota
);

// POST /publico/ofertas-doacao/:chave/avaliacao: entidade avalia a doação recebida
rotas.post(
  // Endereço
  "/publico/ofertas-doacao/:chave/avaliacao",
  // Limite público
  limitePublico,
  // Função
  assincrono(publico.avaliarOferta),
// Fecha a rota
);

// Painel master
// Junta os dois porteiros numa lista para reaproveitar: logado + perfil master
const somenteMaster = [exigirLogin, exigirPerfil("master")];
// GET /master/usuarios: lista todos os usuários
rotas.get(
  // Endereço
  "/master/usuarios",
  // "..." espalha a lista: é o mesmo que escrever exigirLogin, exigirPerfil("master")
  ...somenteMaster,
  // Função
  assincrono(master.listarUsuarios),
// Fecha a rota
);
// PUT /master/usuarios/:id: cria ou edita um usuário
rotas.put(
  // Endereço
  "/master/usuarios/:id",
  // Só master
  ...somenteMaster,
  // Função
  assincrono(master.salvarUsuario),
// Fecha a rota
);
// DELETE /master/usuarios/:id: apaga um usuário
rotas.delete(
  // Endereço
  "/master/usuarios/:id",
  // Só master
  ...somenteMaster,
  // Função
  assincrono(master.removerUsuario),
// Fecha a rota
);
// GET /master/lojas: lista todas as lojas
rotas.get("/master/lojas", ...somenteMaster, assincrono(master.listarLojas));
// PUT /master/lojas/:id: cria ou edita uma loja
rotas.put("/master/lojas/:id", ...somenteMaster, assincrono(master.salvarLoja));
// DELETE /master/lojas/:id: apaga uma loja
rotas.delete(
  // Endereço
  "/master/lojas/:id",
  // Só master
  ...somenteMaster,
  // Função
  assincrono(master.removerLoja),
// Fecha a rota
);
// PUT /master/credenciais: o administrador troca o próprio login/senha
rotas.put(
  // Endereço
  "/master/credenciais",
  // Só master
  ...somenteMaster,
  // Função
  assincrono(master.atualizarCredenciais),
// Fecha a rota
);

// Exporta o agrupador para o app.js usar
export default rotas;
