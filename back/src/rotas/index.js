import { Router } from "express";
import rateLimit from "express-rate-limit";
import { assincrono } from "../utils/erros.js";
import { exigirLogin, exigirPerfil } from "../middlewares/auth.js";
import * as auth from "../controladores/auth.js";
import * as lojas from "../controladores/lojas.js";
import * as alimentos from "../controladores/alimentos.js";
import * as pedidos from "../controladores/pedidos.js";
import * as colecoes from "../controladores/colecoes.js";
import * as dadosUsuario from "../controladores/dadosUsuario.js";
import * as publico from "../controladores/publico.js";
import * as master from "../controladores/master.js";

const rotas = Router();

// Limita tentativas de login/cadastro por IP (proteção contra força bruta).
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
});

// Formulários públicos (sem login): limite mais folgado que o do login, mas ainda protegido.
const limitePublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
});

rotas.get("/saude", (_req, res) => res.json({ ok: true }));

// Autenticação
rotas.post("/auth/login", limiteAuth, assincrono(auth.login));
rotas.post("/auth/signup", limiteAuth, assincrono(auth.cadastrar));
rotas.get("/auth/me", exigirLogin, assincrono(auth.eu));
rotas.put(
  "/auth/update-profile",
  exigirLogin,
  assincrono(auth.atualizarPerfil),
);
rotas.post("/auth/logout", assincrono(auth.sair));
rotas.get(
  "/auth/disponibilidade",
  limitePublico,
  assincrono(auth.disponibilidade),
);

// Preferências e estado de tela do usuário logado (modo escuro, cidade, mensagens lidas...)
rotas.get("/me/dados", exigirLogin, assincrono(dadosUsuario.listar));
rotas.put("/me/dados/:chave", exigirLogin, assincrono(dadosUsuario.salvar));

// Lojas e alimentos: leitura pública, escrita só para estabelecimentos (e master)
rotas.get("/stores", assincrono(lojas.listar));
rotas.get("/foods", assincrono(alimentos.listar));
// Painel master: todos os itens lançados (editar/excluir usam PUT/DELETE /foods/:id)
rotas.get(
  "/master/alimentos",
  exigirLogin,
  exigirPerfil("master"),
  assincrono(alimentos.listarTodos),
);
// RN02: monta um pedido sorteando itens de todas as lojas por valor informado pelo cliente.
rotas.get("/foods/sortear-por-valor", assincrono(alimentos.sortearPorValor));
rotas.post(
  "/foods",
  exigirLogin,
  exigirPerfil("loja", "master"),
  assincrono(alimentos.criar),
);
rotas.put(
  "/foods/:id",
  exigirLogin,
  exigirPerfil("loja", "master"),
  assincrono(alimentos.atualizar),
);
rotas.delete(
  "/foods/:id",
  exigirLogin,
  exigirPerfil("loja", "master"),
  assincrono(alimentos.remover),
);

// Pedidos
rotas.get("/orders", exigirLogin, assincrono(pedidos.listar));
rotas.post(
  "/orders",
  exigirLogin,
  exigirPerfil("cliente"),
  assincrono(pedidos.criar),
);
rotas.patch("/orders/:id", exigirLogin, assincrono(pedidos.atualizar));

// Coleções que ficavam no localStorage: parceiros-sociais, parceiros-descarte,
// ofertas-doacao, registros-descarte e chamados-suporte (regras em controladores/colecoes.js)
rotas.get("/dados/:colecao", exigirLogin, assincrono(colecoes.listar));
rotas.put("/dados/:colecao/:id", exigirLogin, assincrono(colecoes.salvar));
rotas.delete("/dados/:colecao/:id", exigirLogin, assincrono(colecoes.remover));

// Rotas públicas: portal de credenciamento e link de confirmação de doação
rotas.get(
  "/publico/parceiros-sociais",
  limitePublico,
  assincrono(publico.listarParceirosSociais),
);
rotas.post(
  "/publico/parceiros-sociais",
  limitePublico,
  assincrono(publico.credenciarEntidade),
);
rotas.get(
  "/publico/ofertas-doacao/:chave",
  limitePublico,
  assincrono(publico.buscarOferta),
);
rotas.post(
  "/publico/ofertas-doacao/:chave/resposta",
  limitePublico,
  assincrono(publico.responderOferta),
);

rotas.post(
  "/publico/ofertas-doacao/:chave/avaliacao",
  limitePublico,
  assincrono(publico.avaliarOferta),
);

// Painel master
const somenteMaster = [exigirLogin, exigirPerfil("master")];
rotas.get(
  "/master/usuarios",
  ...somenteMaster,
  assincrono(master.listarUsuarios),
);
rotas.put(
  "/master/usuarios/:id",
  ...somenteMaster,
  assincrono(master.salvarUsuario),
);
rotas.delete(
  "/master/usuarios/:id",
  ...somenteMaster,
  assincrono(master.removerUsuario),
);
rotas.get("/master/lojas", ...somenteMaster, assincrono(master.listarLojas));
rotas.put("/master/lojas/:id", ...somenteMaster, assincrono(master.salvarLoja));
rotas.delete(
  "/master/lojas/:id",
  ...somenteMaster,
  assincrono(master.removerLoja),
);
rotas.put(
  "/master/credenciais",
  ...somenteMaster,
  assincrono(master.atualizarCredenciais),
);

export default rotas;
