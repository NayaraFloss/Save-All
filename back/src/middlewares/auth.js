import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { consultar } from "../config/db.js";
import { ErroHttp, assincrono } from "../utils/erros.js";

// A sessão fica num cookie httpOnly: o JavaScript do navegador não consegue ler
// o token, então nada de login precisa ficar no localStorage.
export const NOME_COOKIE = "saveall_sessao";

export const gerarToken = (usuario) =>
  jwt.sign({ perfil: usuario.perfil }, env.jwtSecret, {
    subject: usuario.id,
    expiresIn: env.jwtExpira,
  });

const opcoesCookie = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.producao,
  path: "/",
});

// Grava o cookie de sessão com a mesma validade do token.
export function iniciarSessao(res, usuario) {
  const token = gerarToken(usuario);
  const { exp } = jwt.decode(token);
  res.cookie(NOME_COOKIE, token, {
    ...opcoesCookie(),
    maxAge: Math.max(0, exp * 1000 - Date.now()),
  });
}

export function encerrarSessao(res) {
  res.clearCookie(NOME_COOKIE, opcoesCookie());
}

const lerCookie = (req, nome) => {
  for (const parte of (req.headers.cookie || "").split(";")) {
    const [chave, ...valor] = parte.trim().split("=");
    if (chave === nome) return decodeURIComponent(valor.join("="));
  }
  return null;
};

// Aceita o cookie de sessão ou, para testes (Postman/Insomnia), "Authorization: Bearer <token>".
const lerToken = (req) => {
  const cabecalho = req.headers.authorization || "";
  if (cabecalho.startsWith("Bearer ")) return cabecalho.slice(7);
  return lerCookie(req, NOME_COOKIE);
};

// Exige sessão válida e usuário ainda ativo.
export const exigirLogin = assincrono(async (req, res, next) => {
  const token = lerToken(req);
  if (!token) throw new ErroHttp(401, "Não autorizado.");

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    encerrarSessao(res);
    throw new ErroHttp(401, "Sessão expirada. Faça login novamente.");
  }

  const { rows } = await consultar(
    "SELECT id, perfil, nome, suspenso, motivo_desvinculo FROM usuarios WHERE id = $1",
    [payload.sub],
  );
  const usuario = rows[0];
  if (!usuario) {
    encerrarSessao(res);
    throw new ErroHttp(401, "Não autorizado.");
  }
  if (usuario.suspenso) {
    throw new ErroHttp(
      403,
      `Acesso suspenso pela administração: ${usuario.motivo_desvinculo || "Entre em contato com o suporte."}`,
    );
  }
  req.usuario = { id: usuario.id, perfil: usuario.perfil, nome: usuario.nome };
  next();
});

export const exigirPerfil =
  (...perfis) =>
  (req, _res, next) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      return next(new ErroHttp(403, "Você não tem permissão para esta ação."));
    }
    next();
  };

// Lê a sessão sem exigir login (rotas públicas que mudam a resposta para quem está logado).
// Devolve { id, perfil } ou null. Não consulta o banco.
export const lerSessaoOpcional = (req) => {
  const token = lerToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return { id: payload.sub, perfil: payload.perfil };
  } catch {
    return null;
  }
};
