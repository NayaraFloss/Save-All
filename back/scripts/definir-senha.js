// Define uma nova senha para uma conta existente.
// Uso:  npm run senha:definir -- usuario@email.com
//       (a senha é pedida no terminal sem aparecer na tela; mínimo de 10 caracteres)
// Em automação, use a variável NOVA_SENHA.

// Importa o leitor de linhas do terminal (para perguntar a senha)
import readline from 'node:readline'
// Importa o bcrypt, que transforma a senha num "hash" (embaralhamento sem volta)
import bcrypt from 'bcryptjs'
// Importa o pool de conexões com o banco
import { pool } from '../src/config/db.js'

// Função que faz uma pergunta no terminal escondendo o que é digitado
const perguntarOculto = (pergunta) =>
  // Devolve uma promessa que termina quando a pessoa aperta Enter
  new Promise((resolve) => {
    // Cria a interface de leitura ligada ao teclado e à tela
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // Substitui a escrita na tela: se estiver em modo "mudo", mostra "*" no lugar de cada letra
    rl._writeToOutput = (texto) => rl.output.write(rl.stdoutMuted ? '*' : texto)
    // Faz a pergunta e espera a resposta
    rl.question(pergunta, (resposta) => {
      // Fecha a interface
      rl.close()
      // Pula uma linha na tela
      console.log()
      // Entrega a resposta
      resolve(resposta)
    // Fecha o callback da pergunta
    })
    // Liga o modo "mudo" (depois que a pergunta já foi escrita)
    rl.stdoutMuted = true
  // Fecha a promessa
  })

// Tenta executar
try {
  // Pega o e-mail digitado no comando, tira espaços e deixa minúsculo
  const email = (process.argv[2] || '').trim().toLowerCase()
  // Se não informou e-mail, para com uma explicação
  if (!email) throw new Error('Informe o e-mail. Ex.: npm run senha:definir -- camila@email.com')

  // Usa a senha da variável NOVA_SENHA ou pergunta no terminal
  const senha = process.env.NOVA_SENHA || (await perguntarOculto('Nova senha: '))
  // Exige pelo menos 10 caracteres
  if (senha.length < 10) throw new Error('A senha precisa ter pelo menos 10 caracteres.')
  // Se foi digitada, pede para repetir e confere se é igual
  if (!process.env.NOVA_SENHA && senha !== (await perguntarOculto('Repita a senha: '))) throw new Error('As senhas não conferem.')

  // Atualiza a senha: pelo e-mail, ou (caso especial) "admin" atualiza a conta master
  const { rowCount } = await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE lower(email) = $2 OR (perfil = $4 AND $2 = $3::text)', [
    // $1 = hash da senha (10 = "força" do embaralhamento), $2 = e-mail, $3 = 'admin', $4 = 'master'
    await bcrypt.hash(senha, 10), email, 'admin', 'master'
  // Fecha a lista e a consulta
  ])
  // Se nenhuma linha foi alterada, o e-mail não existe
  if (!rowCount) throw new Error(`Nenhum usuário com o e-mail ${email}.`)
  // Avisa que deu certo
  console.log(`OK: senha de ${email} atualizada.`)
// Se deu erro
} catch (e) {
  // Mostra o motivo
  console.error('Falha:', e.message)
  // Marca falha
  process.exitCode = 1
// Sempre, no final
} finally {
  // Fecha as conexões
  await pool.end()
// Fecha o finally
}
