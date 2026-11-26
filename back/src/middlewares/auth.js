// =====================================================================
// middlewares/auth.js — LOGIN, SESSÃO E PERMISSÕES
// "Middleware" é uma função que roda ANTES da rota, como um porteiro.
// Aqui ficam: criação do token, cookie de sessão e as checagens de
// "está logado?" e "tem o perfil certo?".
// =====================================================================

// Importa a biblioteca que cria e confere tokens JWT (o "crachá digital" do usuário)
import jwt from "jsonwebtoken";
// Importa as configurações (chave secreta, validade do token, se é produção)
import { env } from "../config/env.js";
// Importa a função que faz consultas no banco
import { consultar } from "../config/db.js";
// Importa a classe de erro com código HTTP e o "embrulho" para funções assíncronas
import { ErroHttp, assincrono } from "../utils/erros.js";

// A sessão fica num cookie httpOnly: o JavaScript do navegador não consegue ler
// o token, então nada de login precisa ficar no localStorage.
// Nome do cookie que guarda o token no navegador
export const NOME_COOKIE = "saveall_sessao";

// Função que cria um token para o usuário
export const gerarToken = (usuario) =>
  // Assina o token guardando o perfil dentro dele, usando a chave secreta
  jwt.sign({ perfil: usuario.perfil }, env.jwtSecret, {
    // "subject" = de quem é o token: o id do usuário
    subject: usuario.id,
    // Por quanto tempo o token vale (ex.: 7 dias)
    expiresIn: env.jwtExpira,
  // Fecha as opções e a chamada
  });

// Função que devolve as opções padrão do cookie
const opcoesCookie = () => ({
  // httpOnly: o JavaScript da página não consegue ler o cookie (protege contra roubo)
  httpOnly: true,
  // sameSite "lax": o cookie não é enviado em pedidos vindos de outros sites (protege contra ataques CSRF)
  sameSite: "lax",
  // secure: em produção, só envia o cookie por HTTPS
  secure: env.producao,
  // O cookie vale para todas as páginas do site
  path: "/",
// Fecha o objeto
});

// Grava o cookie de sessão com a mesma validade do token.
// Função chamada quando o usuário faz login com sucesso
export function iniciarSessao(res, usuario) {
  // Gera o token do usuário
  const token = gerarToken(usuario);
  // Lê dentro do token a data de expiração ("exp", em segundos)
  const { exp } = jwt.decode(token);
  // Coloca o cookie na resposta
  res.cookie(NOME_COOKIE, token, {
    // Usa as opções padrão
    ...opcoesCookie(),
    // Tempo de vida do cookie em milissegundos (exp em ms menos agora); nunca negativo
    maxAge: Math.max(0, exp * 1000 - Date.now()),
  // Fecha as opções e a chamada
  });
// Fecha a função
}

// Função de logout: apaga o cookie de sessão
export function encerrarSessao(res) {
  // Manda o navegador remover o cookie (precisa das mesmas opções para funcionar)
  res.clearCookie(NOME_COOKIE, opcoesCookie());
// Fecha a função
}

// Função que procura um cookie pelo nome dentro da requisição
const lerCookie = (req, nome) => {
  // Pega o texto de cookies ("a=1; b=2"), separa por ";" e olha cada parte
  for (const parte of (req.headers.cookie || "").split(";")) {
    // Separa nome e valor pelo "=" (o valor pode ter "=" também, por isso o "...valor")
    const [chave, ...valor] = parte.trim().split("=");
    // Se o nome bater, junta o valor de volta, decodifica e devolve
    if (chave === nome) return decodeURIComponent(valor.join("="));
  // Fecha o for
  }
  // Se não achou, devolve null (nada)
  return null;
// Fecha a função
};

// Aceita o cookie de sessão ou, para testes (Postman/Insomnia), "Authorization: Bearer <token>".
// Função que descobre o token da requisição
const lerToken = (req) => {
  // Pega o cabeçalho Authorization (ou texto vazio)
  const cabecalho = req.headers.authorization || "";
  // Se começar com "Bearer ", devolve o que vem depois (o token em si; 7 = tamanho de "Bearer ")
  if (cabecalho.startsWith("Bearer ")) return cabecalho.slice(7);
  // Se não, procura o token no cookie
  return lerCookie(req, NOME_COOKIE);
// Fecha a função
};

// Exige sessão válida e usuário ainda ativo.
// "Porteiro" que só deixa passar quem está logado
export const exigirLogin = assincrono(async (req, res, next) => {
  // Lê o token
  const token = lerToken(req);
  // Sem token = não está logado: erro 401
  if (!token) throw new ErroHttp(401, "Não autorizado.");

  // Variável que vai guardar o conteúdo do token
  let payload;
  // Tenta conferir o token
  try {
    // Verifica assinatura e validade; se ok, devolve o conteúdo
    payload = jwt.verify(token, env.jwtSecret);
  // Se o token for falso ou estiver vencido
  } catch {
    // Apaga o cookie velho
    encerrarSessao(res);
    // Responde 401 pedindo novo login
    throw new ErroHttp(401, "Sessão expirada. Faça login novamente.");
  // Fecha o catch
  }

  // Busca no banco o usuário dono do token
  const { rows } = await consultar(
    // SQL: pega id, perfil, nome, se está suspenso e o motivo, do usuário com aquele id
    "SELECT id, perfil, nome, suspenso, motivo_desvinculo FROM usuarios WHERE id = $1",
    // $1 é trocado pelo id que estava no token ("sub")
    [payload.sub],
  // Fecha a consulta
  );
  // Pega a primeira linha encontrada (ou undefined se não achou)
  const usuario = rows[0];
  // Se o usuário não existe mais (foi apagado)
  if (!usuario) {
    // Apaga o cookie
    encerrarSessao(res);
    // Responde 401
    throw new ErroHttp(401, "Não autorizado.");
  // Fecha o if
  }
  // Se o usuário foi suspenso pela administração
  if (usuario.suspenso) {
    // Responde 403 (proibido) com o motivo
    throw new ErroHttp(
      // Código 403
      403,
      // Mensagem com o motivo; se não houver motivo, uma frase padrão
      `Acesso suspenso pela administração: ${usuario.motivo_desvinculo || "Entre em contato com o suporte."}`,
    // Fecha o erro
    );
  // Fecha o if
  }
  // Guarda os dados do usuário na requisição para as próximas funções usarem
  req.usuario = { id: usuario.id, perfil: usuario.perfil, nome: usuario.nome };
  // Libera a passagem para a rota
  next();
// Fecha a função e o embrulho "assincrono"
});

// "Porteiro" que só deixa passar perfis específicos (ex.: exigirPerfil("loja", "master"))
export const exigirPerfil =
  // Recebe a lista de perfis permitidos
  (...perfis) =>
  // Devolve o middleware de verdade
  (req, _res, next) => {
    // Se não há usuário logado ou o perfil dele não está na lista
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) {
      // Passa um erro 403 adiante
      return next(new ErroHttp(403, "Você não tem permissão para esta ação."));
    // Fecha o if
    }
    // Perfil permitido: libera
    next();
  // Fecha o middleware
  };

// Lê a sessão sem exigir login (rotas públicas que mudam a resposta para quem está logado).
// Devolve { id, perfil } ou null. Não consulta o banco.
export const lerSessaoOpcional = (req) => {
  // Lê o token
  const token = lerToken(req);
  // Sem token: visitante anônimo
  if (!token) return null;
  // Tenta conferir
  try {
    // Verifica o token
    const payload = jwt.verify(token, env.jwtSecret);
    // Devolve id e perfil
    return { id: payload.sub, perfil: payload.perfil };
  // Token inválido
  } catch {
    // Trata como visitante anônimo
    return null;
  // Fecha o catch
  }
// Fecha a função
};
