// =====================================================================
// controladores/auth.js — LOGIN, CADASTRO, LOGOUT E PERFIL
// "Controlador" é quem faz o trabalho de verdade de cada rota.
// =====================================================================

// Importa o bcrypt: embaralha senhas e compara senha digitada com a guardada
import bcrypt from "bcryptjs";
// Importa o módulo de criptografia do Node (usado para gerar ids aleatórios)
import crypto from "node:crypto";
// Importa as funções de consulta e de transação ("tudo ou nada") do banco
import { consultar, transacao } from "../config/db.js";
// Importa o erro com código HTTP
import { ErroHttp } from "../utils/erros.js";
// Importa o tradutor de usuário (banco -> front)
import { usuarioParaFront } from "../utils/mapeadores.js";
// Importa a função que descobre a cidade a partir do endereço
import { cidadeDoEndereco } from "../utils/endereco.js";
// Importa as funções que verificam nome/CPF/CNPJ repetidos
import { buscarDuplicidade, garantirSemDuplicidade } from "../utils/duplicidade.js";
// Importa o validador de texto e o separador de campos extras
import { texto, extrasDe } from "../utils/validacao.js";
// Importa as funções que criam e apagam o cookie de sessão
import { iniciarSessao, encerrarSessao, lerSessaoOpcional, NOME_COOKIE } from "../middlewares/auth.js";
// Importa a função que criptografa os campos sensíveis
import { protegerExtras } from "../utils/criptografia.js";
// Importa o tradutor de perfil (front -> banco)
import { perfilDoFront } from "../utils/perfis.js";

// Perfis que podem se cadastrar sozinhos
const PERFIS_CADASTRO = ["cliente", "loja", "entidade", "descarte"]; // "master" nunca se cadastra pela API
// Um hash de mentira, usado quando o e-mail não existe, para a resposta demorar o mesmo tempo
const HASH_FALSO = bcrypt.hashSync("saveall-sem-usuario", 10); // iguala o tempo de resposta quando o e-mail não existe
// Expressão regular que confere o formato de e-mail: algo@algo.algo, sem espaços
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /auth/login
export async function login(req, res) {
  // Pega o e-mail (ou "username") enviado, transforma em texto
  const identificador = String(req.body.email ?? req.body.username ?? "")
    // Tira espaços do começo e do fim
    .trim()
    // Deixa tudo minúsculo
    .toLowerCase();
  // Pega a senha enviada como texto
  const senha = String(req.body.password ?? "");
  // Se faltar e-mail ou senha
  if (!identificador || !senha)
    // Erro 400
    throw new ErroHttp(400, "Informe e-mail e senha.");

  // O master também pode entrar com o usuário "admin".
  // Procura o usuário no banco
  const { rows } = await consultar(
    // SQL: usuário com aquele e-mail, OU o master se digitou "admin"; no máximo 1 resultado
    `SELECT * FROM usuarios WHERE lower(email) = $1 OR (perfil = 'master' AND $1 = 'admin') LIMIT 1`,
    // $1 = o que foi digitado
    [identificador],
  // Fecha a consulta
  );
  // Pega o usuário encontrado (ou undefined)
  const usuario = rows[0];
  // Confere a senha
  const ok = usuario
    // Se o usuário existe: compara a senha digitada com o hash guardado
    ? await bcrypt.compare(senha, usuario.senha_hash)
    // Se não existe: compara com o hash falso (só para gastar o mesmo tempo e não revelar que o e-mail não existe)
    : await bcrypt.compare(senha, HASH_FALSO);
  // Se não achou usuário ou a senha está errada: erro 401 (mensagem igual nos dois casos, por segurança)
  if (!usuario || !ok) throw new ErroHttp(401, "Usuário ou senha incorretos.");
  // Se a conta está suspensa
  if (usuario.suspenso) {
    // Erro 403 com o motivo
    throw new ErroHttp(
      // Código
      403,
      // Mensagem
      `Acesso suspenso pela administração: ${usuario.motivo_desvinculo || "Entre em contato com o suporte."}`,
    // Fecha o erro
    );
  // Fecha o if
  }
  // Tudo certo: grava o cookie de sessão
  iniciarSessao(res, usuario);
  // Responde com os dados do usuário no formato do front
  res.json({ user: usuarioParaFront(usuario) });
// Fecha a função
}

// Campos do cadastro que já têm tratamento próprio (o resto vira "extras")
const COLUNAS_SIGNUP = [
  // Nome
  "username",
  // E-mail
  "email",
  // Senha
  "password",
  // Tipo de conta
  "role",
  // Endereço
  "address",
  // CPF/CNPJ
  "cpfCnpj",
// Fecha a lista
];

// POST /auth/signup — cria uma conta
export async function cadastrar(req, res) {
  // Pega o corpo da requisição (ou objeto vazio)
  const corpo = req.body || {};
  // Valida o nome
  const nome = texto(corpo.username, {
    // Nome do campo para a mensagem de erro
    campo: "nome",
    // Mínimo de 2 caracteres
    min: 2,
    // Máximo de 120
    max: 120,
    // É obrigatório
    obrigatorio: true,
  // Fecha a validação
  });
  // Valida o e-mail
  const email = texto(corpo.email, {
    // Nome do campo
    campo: "e-mail",
    // Máximo de 160
    max: 160,
    // Obrigatório
    obrigatorio: true,
  // Fecha a validação e deixa minúsculo
  }).toLowerCase();
  // Se o formato do e-mail estiver errado: erro 400
  if (!EMAIL.test(email)) throw new ErroHttp(400, "E-mail inválido.");
  // Pega a senha
  const senha = String(corpo.password ?? "");
  // Se tiver menos de 6 caracteres
  if (senha.length < 6)
    // Erro 400
    throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
  // Traduz o tipo de conta do front para o banco (se não veio, considera cliente)
  const perfil = perfilDoFront(corpo.role || "client");
  // Se o perfil não existe ou não pode se cadastrar
  if (!perfil || !PERFIS_CADASTRO.includes(perfil))
    // Erro 400
    throw new ErroHttp(400, "Tipo de conta inválido.");
  // Valida o endereço
  const endereco =
    // Endereço opcional com no máximo 255 caracteres
    texto(corpo.address, { campo: "endereço", max: 255 }) ||
    // Se veio vazio, usa um endereço padrão
    "Av. Brasil, 100 - Centro";
  // Valida o CPF/CNPJ (opcional, máximo 30)
  const cpfCnpj = texto(corpo.cpfCnpj, { campo: "CPF/CNPJ", max: 30 });

  // Separa os demais campos enviados como "extras"
  const extras = extrasDe(corpo, COLUNAS_SIGNUP);
  // Se não informou tipo de assinatura: "digital" se enviou certificado (??= só preenche se estiver vazio)
  extras.signatureType ??= corpo.pfxFileName ? "digital" : undefined;
  // Liga a assinatura automática se enviou certificado (!! transforma em verdadeiro/falso)
  extras.autoSignEnabled ??= !!corpo.pfxFileName;

  // Nome e CPF/CNPJ não podem repetir os de outra conta
  await garantirSemDuplicidade({ nome, cpfCnpj });

  // Gera um id único para o usuário, ex.: "user-1b2c..."
  const id = `user-${crypto.randomUUID()}`;
  // Embaralha a senha (nunca guardamos a senha de verdade)
  const hash = await bcrypt.hash(senha, 10);
  // Guarda se é cliente (verdadeiro/falso)
  const cliente = perfil === "cliente";

  // Abre uma transação: grava o usuário (e a loja, se for o caso) juntos
  const usuario = await transacao(async (db) => {
    // Variável para o resultado do INSERT
    let r;
    // Tenta inserir
    try {
      // Insere o usuário
      r = await consultar(
        `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, verificado, nota, qtd_avaliacoes, suspenso, extras) -- colunas a preencher
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,FALSE,$11::jsonb) RETURNING *`, // valores na mesma ordem; devolve a linha criada
        // Lista de valores ($1 a $11)
        [
          // $1 id
          id,
          // $2 nome
          nome,
          // $3 e-mail
          email,
          // $4 senha embaralhada
          hash,
          // $5 perfil
          perfil,
          // $6 pontos iniciais
          0,
          // $7 endereço
          endereco,
          // $8 CPF/CNPJ
          cpfCnpj,
          // $9 verificado: verdadeiro se informou documento
          !!cpfCnpj,
          // $10 nota inicial: cliente não tem nota; os outros começam com 5
          cliente ? null : 5,
          // $11 extras com campos sensíveis criptografados, em JSON
          JSON.stringify(protegerExtras(extras)),
        // Fecha a lista
        ],
        // Usa a conexão da transação
        db,
      // Fecha a consulta
      );
    // Se o INSERT falhou
    } catch (e) {
      // Nome repetido (regra única "ux_usuarios_nome")
      if (e.code === "23505" && e.constraint === "ux_usuarios_nome") throw new ErroHttp(409, "Já existe uma conta com este nome. Escolha outro nome.");
      // Documento repetido
      if (e.code === "23505" && e.constraint === "ux_usuarios_documento") throw new ErroHttp(409, "Já existe uma conta cadastrada com este CPF/CNPJ.");
      // Qualquer outra duplicidade: e-mail
      if (e.code === "23505") throw new ErroHttp(409, "E-mail já cadastrado.");
      // Outros erros: repassa
      throw e;
    // Fecha o catch
    }
    // Se for uma loja, cria também o estabelecimento
    if (perfil === "loja") {
      // Convenção do front: id da loja = id do usuário sem o prefixo "user-".
      // Insere a loja
      await consultar(
        `INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade, telefone) -- colunas
         VALUES ($1,$2,$3,'lojaKiuda','Café & Alimentação',5,$4,$5,$6)`, // logo, categoria e nota padrão
        // A cidade sai do endereço: é por ela que a loja aparece no seletor de cidades e no sorteio
        // Valores
        [
          // $1 id da loja (id do usuário sem "user-")
          id.replace("user-", ""),
          // $2 dono
          id,
          // $3 nome
          nome,
          // $4 endereço
          endereco,
          // $5 cidade tirada do endereço
          cidadeDoEndereco(endereco),
          // $6 telefone só com números (ou null se vazio)
          String(corpo.whatsapp || "").replace(/\D/g, "") || null,
        // Fecha a lista
        ],
        // Mesma transação
        db,
      // Fecha a consulta
      );
    // Fecha o if
    }
    // Devolve o usuário criado
    return r.rows[0];
  // Fecha a transação
  });

  // Já deixa o usuário logado
  iniciarSessao(res, usuario);
  // Responde 201 (criado) com o usuário
  res.status(201).json({ user: usuarioParaFront(usuario) });
// Fecha a função
}

// Consulta usada no cadastro para avisar, antes de enviar, que o nome ou o CPF/CNPJ já existe
// GET /auth/disponibilidade
export async function disponibilidade(req, res) {
  // Procura conflitos
  const conflitos = await buscarDuplicidade({
    // Nome vindo da URL (?nome=...), limitado a 160 caracteres
    nome: String(req.query.nome || "").slice(0, 160),
    // CPF/CNPJ vindo da URL, limitado a 30
    cpfCnpj: String(req.query.cpfCnpj || "").slice(0, 30),
  // Fecha a busca
  });
  // Responde se cada um está livre, junto com as mensagens de conflito
  res.json({ nomeLivre: !conflitos.nome, cpfCnpjLivre: !conflitos.cpfCnpj, ...conflitos });
// Fecha a função
}

// POST /auth/logout
export async function sair(_req, res) {
  // Apaga o cookie
  encerrarSessao(res);
  // Responde sucesso
  res.json({ success: true });
// Fecha a função
}

// GET /auth/me — dados de quem está logado
// Visitante sem sessão (ex.: entidade abrindo o link público de confirmação) recebe 200 com
// null em vez de 401: assim o navegador não mostra "Failed to load resource: 401" no console.
export async function eu(req, res) {
  // Lê a sessão do cookie/cabeçalho sem exigir login
  const sessao = lerSessaoOpcional(req);
  // Sem sessão (ou token vencido/inválido): ninguém logado
  if (!sessao?.id) {
    // Se havia um cookie inválido, apaga para não reenviar
    if (req.headers.cookie?.includes(NOME_COOKIE)) encerrarSessao(res);
    return res.json(null);
  }
  // Busca o usuário pelo id da sessão
  const { rows } = await consultar("SELECT * FROM usuarios WHERE id = $1", [sessao.id]);
  // Usuário apagado: encerra a sessão e responde que ninguém está logado
  if (!rows[0]) {
    encerrarSessao(res);
    return res.json(null);
  }
  // Conta suspensa continua bloqueada (mesma regra do exigirLogin)
  if (rows[0].suspenso) {
    throw new ErroHttp(
      403,
      `Acesso suspenso pela administração: ${rows[0].motivo_desvinculo || "Entre em contato com o suporte."}`,
    );
  }
  // Responde no formato do front
  res.json(usuarioParaFront(rows[0]));
// Fecha a função
}

// Campo do front -> coluna do banco
const CAMPOS_PERFIL = {
  // name -> nome
  name: "nome",
  // address -> endereco
  address: "endereco",
  // urlAvatar -> avatar_url
  urlAvatar: "avatar_url",
  // cpfCnpj -> cpf_cnpj
  cpfCnpj: "cpf_cnpj",
  // dataNascimento -> data_nascimento
  dataNascimento: "data_nascimento",
  // termosAceitos -> termos_aceitos
  termosAceitos: "termos_aceitos",
  // whatsapp -> telefone
  whatsapp: "telefone",
// Fecha o objeto
};
// Nunca podem ser alterados pelo próprio usuário.
// (assim ninguém consegue, por exemplo, se dar pontos ou virar master)
const PROTEGIDOS = [
  // Identificador
  "id",
  // Número sequencial
  "idNumerico",
  // Data de criação
  "criadoEm",
  // Perfil
  "role",
  // Pontos
  "points",
  // Economia acumulada
  "valorTotalEconomizado",
  // Lucro acumulado
  "lucroAcumulado",
  // Nota
  "rating",
  // Qtd. de avaliações
  "qtdAvaliacoes",
  // Qtd. de reclamações
  "qtdReclamacoes",
  // Suspensão
  "suspenso",
  // Motivo da suspensão
  "motivoDesvinculo",
  // Verificado
  "verificado",
  // Hash da senha
  "passwordHash",
  // E-mail
  "email",
  // Senha (tratada à parte)
  "password",
  // Id de usuário
  "userId",
// Fecha a lista
];

// PUT /auth/update-profile — atualiza o próprio perfil
export async function atualizarPerfil(req, res) {
  // Pega o corpo da requisição
  const corpo = req.body || {};
  // Se está mudando o nome ou o documento
  if (corpo.name !== undefined || corpo.cpfCnpj) {
    // Garante que não ficam repetidos (ignorando a própria conta)
    await garantirSemDuplicidade({ nome: corpo.name, cpfCnpj: corpo.cpfCnpj, usuarioId: req.usuario.id });
  // Fecha o if
  }
  // Lista de pedaços "coluna = $n" do UPDATE
  const sets = [];
  // Lista de valores correspondentes
  const valores = [];
  // Função auxiliar que adiciona uma coluna e seu valor
  const add = (coluna, valor) => {
    // Guarda o valor
    valores.push(valor);
    // Guarda "coluna = $posição" (a posição é o tamanho atual da lista)
    sets.push(`${coluna} = $${valores.length}`);
  // Fecha a função
  };

  // Passa por cada campo editável
  for (const [campo, coluna] of Object.entries(CAMPOS_PERFIL)) {
    // Se o campo não foi enviado, pula
    if (corpo[campo] === undefined) continue;
    // Se for o nome
    if (campo === "name")
      // Adiciona com validação
      add(
        // Coluna
        coluna,
        // Valida o texto
        texto(corpo[campo], {
          // Nome do campo
          campo: "nome",
          // Mínimo 2
          min: 2,
          // Máximo 120
          max: 120,
          // Obrigatório
          obrigatorio: true,
        // Fecha a validação
        }),
      // Fecha o add
      );
    // Se for o aceite dos termos: grava verdadeiro/falso
    else if (campo === "termosAceitos") add(coluna, !!corpo[campo]);
    // Se for data de nascimento
    else if (campo === "dataNascimento")
      // Grava só os 10 primeiros caracteres (AAAA-MM-DD) ou null
      add(coluna, corpo[campo] ? String(corpo[campo]).slice(0, 10) : null);
    // Se for WhatsApp
    else if (campo === "whatsapp")
      // Adiciona
      add(
        // Coluna
        coluna,
        // Transforma em texto
        String(corpo[campo] || "")
          // Remove tudo que não é número
          .replace(/\D/g, "")
          // Limita a 15 dígitos; se vazio, null
          .slice(0, 15) || null,
      // Fecha o add
      );
    // Qualquer outro campo
    else
      // Adiciona
      add(
        // Coluna
        coluna,
        // Valida o texto
        texto(corpo[campo], {
          // Nome do campo
          campo,
          // A foto pode ser grande (2 milhões de caracteres); o resto, até 255
          max: campo === "urlAvatar" ? 2_000_000 : 255,
        // Fecha a validação
        }),
      // Fecha o add
      );
  // Fecha o for
  }
  // Se informou documento, marca a conta como verificada
  if (corpo.cpfCnpj) sets.push("verificado = TRUE");

  // Se está trocando a senha
  if (corpo.password !== undefined) {
    // Pega a nova senha
    const nova = String(corpo.password);
    // Se for curta
    if (nova.length < 6)
      // Erro 400
      throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
    // Adiciona o novo hash
    add("senha_hash", await bcrypt.hash(nova, 10));
  // Fecha o if
  }

  // Separa os campos que não são colunas nem protegidos (vão para "extras")
  const extras = extrasDe(corpo, [
    // Ignora os campos editáveis (já tratados)
    ...Object.keys(CAMPOS_PERFIL),
    // Ignora os protegidos
    ...PROTEGIDOS,
  // Fecha a chamada
  ]);
  // Se sobrou algum extra
  if (Object.keys(extras).length) {
    // Adiciona o JSON dos extras (com segredos criptografados)
    valores.push(JSON.stringify(protegerExtras(extras)));
    // "extras || novo" junta o JSON antigo com o novo (o novo sobrescreve chaves iguais)
    sets.push(`extras = extras || $${valores.length}::jsonb`);
  // Fecha o if
  }
  // Se nada mudou
  if (!sets.length) {
    // Busca o usuário atual
    const { rows } = await consultar("SELECT * FROM usuarios WHERE id = $1", [
      // $1 = id do usuário logado
      req.usuario.id,
    // Fecha a consulta
    ]);
    // Responde com os dados atuais e encerra a função
    return res.json(usuarioParaFront(rows[0]));
  // Fecha o if
  }

  // Adiciona o id do usuário como último valor (usado no WHERE)
  valores.push(req.usuario.id);
  // Executa o UPDATE montado dinamicamente
  const { rows } = await consultar(
    `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${valores.length} RETURNING *`, // junta os "coluna = $n" com vírgula e filtra pelo usuário
    // Valores
    valores,
  // Fecha a consulta
  );
  // Se nenhuma linha voltou: 404
  if (!rows[0]) throw new ErroHttp(404, "Usuário não encontrado.");
  // O estabelecimento exibido para os clientes acompanha o nome/endereço do perfil da loja.
  // Se é loja e mudou nome, endereço ou WhatsApp
  if (
    // É loja
    rows[0].perfil === "loja" &&
    // Mudou o nome
    (corpo.name !== undefined ||
      // ou o endereço
      corpo.address !== undefined ||
      // ou o WhatsApp
      corpo.whatsapp !== undefined)
  // Fecha a condição
  ) {
    // Atualiza também a tabela de lojas
    await consultar(
      // SQL: COALESCE mantém o valor antigo se o novo for nulo
      "UPDATE lojas SET nome = $1, endereco = $2, telefone = COALESCE($3, telefone), cidade = COALESCE($4, cidade) WHERE usuario_id = $5",
      // Valores
      [
        // $1 nome
        rows[0].nome,
        // $2 endereço
        rows[0].endereco,
        // $3 telefone
        rows[0].telefone,
        // $4 cidade tirada do endereço
        cidadeDoEndereco(rows[0].endereco),
        // $5 dono
        rows[0].id,
      // Fecha a lista
      ],
    // Fecha a consulta
    );
  // Fecha o if
  }
  // A foto da loja que os clientes veem fica em lojas.logo: acompanha a foto enviada no perfil.
  // Se é loja e mudou a foto
  if (rows[0].perfil === "loja" && corpo.urlAvatar !== undefined) {
    // Atualiza o logo
    await consultar(
      // SQL: NULLIF transforma '' em nulo; COALESCE mantém o logo antigo se a foto vier vazia
      "UPDATE lojas SET logo = COALESCE(NULLIF($1, ''), logo) WHERE usuario_id = $2",
      // $1 foto, $2 dono
      [rows[0].avatar_url, rows[0].id],
    // Fecha a consulta
    );
  // Fecha o if
  }
  // Responde com o usuário atualizado
  res.json(usuarioParaFront(rows[0]));
// Fecha a função
}
