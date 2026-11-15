import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { consultar, transacao } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";
import { usuarioParaFront } from "../utils/mapeadores.js";
import { cidadeDoEndereco } from "../utils/endereco.js";
import { buscarDuplicidade, garantirSemDuplicidade } from "../utils/duplicidade.js";
import { texto, extrasDe } from "../utils/validacao.js";
import { iniciarSessao, encerrarSessao } from "../middlewares/auth.js";
import { protegerExtras } from "../utils/criptografia.js";
import { perfilDoFront } from "../utils/perfis.js";

const PERFIS_CADASTRO = ["cliente", "loja", "entidade", "descarte"]; // "master" nunca se cadastra pela API
const HASH_FALSO = bcrypt.hashSync("saveall-sem-usuario", 10); // iguala o tempo de resposta quando o e-mail não existe
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(req, res) {
  const identificador = String(req.body.email ?? req.body.username ?? "")
    .trim()
    .toLowerCase();
  const senha = String(req.body.password ?? "");
  if (!identificador || !senha)
    throw new ErroHttp(400, "Informe e-mail e senha.");

  // O master também pode entrar com o usuário "admin".
  const { rows } = await consultar(
    `SELECT * FROM usuarios WHERE lower(email) = $1 OR (perfil = 'master' AND $1 = 'admin') LIMIT 1`,
    [identificador],
  );
  const usuario = rows[0];
  const ok = usuario
    ? await bcrypt.compare(senha, usuario.senha_hash)
    : await bcrypt.compare(senha, HASH_FALSO);
  if (!usuario || !ok) throw new ErroHttp(401, "Usuário ou senha incorretos.");
  if (usuario.suspenso) {
    throw new ErroHttp(
      403,
      `Acesso suspenso pela administração: ${usuario.motivo_desvinculo || "Entre em contato com o suporte."}`,
    );
  }
  iniciarSessao(res, usuario);
  res.json({ user: usuarioParaFront(usuario) });
}

const COLUNAS_SIGNUP = [
  "username",
  "email",
  "password",
  "role",
  "address",
  "cpfCnpj",
];

export async function cadastrar(req, res) {
  const corpo = req.body || {};
  const nome = texto(corpo.username, {
    campo: "nome",
    min: 2,
    max: 120,
    obrigatorio: true,
  });
  const email = texto(corpo.email, {
    campo: "e-mail",
    max: 160,
    obrigatorio: true,
  }).toLowerCase();
  if (!EMAIL.test(email)) throw new ErroHttp(400, "E-mail inválido.");
  const senha = String(corpo.password ?? "");
  if (senha.length < 6)
    throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
  const perfil = perfilDoFront(corpo.role || "client");
  if (!perfil || !PERFIS_CADASTRO.includes(perfil))
    throw new ErroHttp(400, "Tipo de conta inválido.");
  const endereco =
    texto(corpo.address, { campo: "endereço", max: 255 }) ||
    "Av. Brasil, 100 - Centro";
  const cpfCnpj = texto(corpo.cpfCnpj, { campo: "CPF/CNPJ", max: 30 });

  const extras = extrasDe(corpo, COLUNAS_SIGNUP);
  extras.signatureType ??= corpo.pfxFileName ? "digital" : undefined;
  extras.autoSignEnabled ??= !!corpo.pfxFileName;

  // Nome e CPF/CNPJ não podem repetir os de outra conta
  await garantirSemDuplicidade({ nome, cpfCnpj });

  const id = `user-${crypto.randomUUID()}`;
  const hash = await bcrypt.hash(senha, 10);
  const cliente = perfil === "cliente";

  const usuario = await transacao(async (db) => {
    let r;
    try {
      r = await consultar(
        `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, verificado, nota, qtd_avaliacoes, suspenso, extras)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,FALSE,$11::jsonb) RETURNING *`,
        [
          id,
          nome,
          email,
          hash,
          perfil,
          0,
          endereco,
          cpfCnpj,
          !!cpfCnpj,
          cliente ? null : 5,
          JSON.stringify(protegerExtras(extras)),
        ],
        db,
      );
    } catch (e) {
      if (e.code === "23505" && e.constraint === "ux_usuarios_nome") throw new ErroHttp(409, "Já existe uma conta com este nome. Escolha outro nome.");
      if (e.code === "23505" && e.constraint === "ux_usuarios_documento") throw new ErroHttp(409, "Já existe uma conta cadastrada com este CPF/CNPJ.");
      if (e.code === "23505") throw new ErroHttp(409, "E-mail já cadastrado.");
      throw e;
    }
    if (perfil === "loja") {
      // Convenção do front: id da loja = id do usuário sem o prefixo "user-".
      await consultar(
        `INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade, telefone)
         VALUES ($1,$2,$3,'lojaKiuda','Café & Alimentação',5,$4,$5,$6)`,
        // A cidade sai do endereço: é por ela que a loja aparece no seletor de cidades e no sorteio
        [
          id.replace("user-", ""),
          id,
          nome,
          endereco,
          cidadeDoEndereco(endereco),
          String(corpo.whatsapp || "").replace(/\D/g, "") || null,
        ],
        db,
      );
    }
    return r.rows[0];
  });

  iniciarSessao(res, usuario);
  res.status(201).json({ user: usuarioParaFront(usuario) });
}

// Consulta usada no cadastro para avisar, antes de enviar, que o nome ou o CPF/CNPJ já existe
export async function disponibilidade(req, res) {
  const conflitos = await buscarDuplicidade({
    nome: String(req.query.nome || "").slice(0, 160),
    cpfCnpj: String(req.query.cpfCnpj || "").slice(0, 30),
  });
  res.json({ nomeLivre: !conflitos.nome, cpfCnpjLivre: !conflitos.cpfCnpj, ...conflitos });
}

export async function sair(_req, res) {
  encerrarSessao(res);
  res.json({ success: true });
}

export async function eu(req, res) {
  const { rows } = await consultar("SELECT * FROM usuarios WHERE id = $1", [
    req.usuario.id,
  ]);
  if (!rows[0]) throw new ErroHttp(401, "Não autorizado.");
  res.json(usuarioParaFront(rows[0]));
}

// Campo do front -> coluna do banco
const CAMPOS_PERFIL = {
  name: "nome",
  address: "endereco",
  urlAvatar: "avatar_url",
  cpfCnpj: "cpf_cnpj",
  dataNascimento: "data_nascimento",
  termosAceitos: "termos_aceitos",
  whatsapp: "telefone",
};
// Nunca podem ser alterados pelo próprio usuário.
const PROTEGIDOS = [
  "id",
  "idNumerico",
  "criadoEm",
  "role",
  "points",
  "valorTotalEconomizado",
  "lucroAcumulado",
  "rating",
  "qtdAvaliacoes",
  "qtdReclamacoes",
  "suspenso",
  "motivoDesvinculo",
  "verificado",
  "passwordHash",
  "email",
  "password",
  "userId",
];

export async function atualizarPerfil(req, res) {
  const corpo = req.body || {};
  if (corpo.name !== undefined || corpo.cpfCnpj) {
    await garantirSemDuplicidade({ nome: corpo.name, cpfCnpj: corpo.cpfCnpj, usuarioId: req.usuario.id });
  }
  const sets = [];
  const valores = [];
  const add = (coluna, valor) => {
    valores.push(valor);
    sets.push(`${coluna} = $${valores.length}`);
  };

  for (const [campo, coluna] of Object.entries(CAMPOS_PERFIL)) {
    if (corpo[campo] === undefined) continue;
    if (campo === "name")
      add(
        coluna,
        texto(corpo[campo], {
          campo: "nome",
          min: 2,
          max: 120,
          obrigatorio: true,
        }),
      );
    else if (campo === "termosAceitos") add(coluna, !!corpo[campo]);
    else if (campo === "dataNascimento")
      add(coluna, corpo[campo] ? String(corpo[campo]).slice(0, 10) : null);
    else if (campo === "whatsapp")
      add(
        coluna,
        String(corpo[campo] || "")
          .replace(/\D/g, "")
          .slice(0, 15) || null,
      );
    else
      add(
        coluna,
        texto(corpo[campo], {
          campo,
          max: campo === "urlAvatar" ? 2_000_000 : 255,
        }),
      );
  }
  if (corpo.cpfCnpj) sets.push("verificado = TRUE");

  if (corpo.password !== undefined) {
    const nova = String(corpo.password);
    if (nova.length < 6)
      throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
    add("senha_hash", await bcrypt.hash(nova, 10));
  }

  const extras = extrasDe(corpo, [
    ...Object.keys(CAMPOS_PERFIL),
    ...PROTEGIDOS,
  ]);
  if (Object.keys(extras).length) {
    valores.push(JSON.stringify(protegerExtras(extras)));
    sets.push(`extras = extras || $${valores.length}::jsonb`);
  }
  if (!sets.length) {
    const { rows } = await consultar("SELECT * FROM usuarios WHERE id = $1", [
      req.usuario.id,
    ]);
    return res.json(usuarioParaFront(rows[0]));
  }

  valores.push(req.usuario.id);
  const { rows } = await consultar(
    `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${valores.length} RETURNING *`,
    valores,
  );
  if (!rows[0]) throw new ErroHttp(404, "Usuário não encontrado.");
  // O estabelecimento exibido para os clientes acompanha o nome/endereço do perfil da loja.
  if (
    rows[0].perfil === "loja" &&
    (corpo.name !== undefined ||
      corpo.address !== undefined ||
      corpo.whatsapp !== undefined)
  ) {
    await consultar(
      "UPDATE lojas SET nome = $1, endereco = $2, telefone = COALESCE($3, telefone), cidade = COALESCE($4, cidade) WHERE usuario_id = $5",
      [
        rows[0].nome,
        rows[0].endereco,
        rows[0].telefone,
        cidadeDoEndereco(rows[0].endereco),
        rows[0].id,
      ],
    );
  }
  // A foto da loja que os clientes veem fica em lojas.logo: acompanha a foto enviada no perfil.
  if (rows[0].perfil === "loja" && corpo.urlAvatar !== undefined) {
    await consultar(
      "UPDATE lojas SET logo = COALESCE(NULLIF($1, ''), logo) WHERE usuario_id = $2",
      [rows[0].avatar_url, rows[0].id],
    );
  }
  res.json(usuarioParaFront(rows[0]));
}
