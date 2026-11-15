// Define uma nova senha para uma conta existente.
// Uso:  npm run senha:definir -- usuario@email.com
//       (a senha é pedida no terminal sem aparecer na tela; mínimo de 10 caracteres)
// Em automação, use a variável NOVA_SENHA.
import readline from 'node:readline'
import bcrypt from 'bcryptjs'
import { pool } from '../src/config/db.js'

const perguntarOculto = (pergunta) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (texto) => rl.output.write(rl.stdoutMuted ? '*' : texto)
    rl.question(pergunta, (resposta) => {
      rl.close()
      console.log()
      resolve(resposta)
    })
    rl.stdoutMuted = true
  })

try {
  const email = (process.argv[2] || '').trim().toLowerCase()
  if (!email) throw new Error('Informe o e-mail. Ex.: npm run senha:definir -- camila@email.com')

  const senha = process.env.NOVA_SENHA || (await perguntarOculto('Nova senha: '))
  if (senha.length < 10) throw new Error('A senha precisa ter pelo menos 10 caracteres.')
  if (!process.env.NOVA_SENHA && senha !== (await perguntarOculto('Repita a senha: '))) throw new Error('As senhas não conferem.')

  const { rowCount } = await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE lower(email) = $2 OR (perfil = $4 AND $2 = $3::text)', [
    await bcrypt.hash(senha, 10), email, 'admin', 'master'
  ])
  if (!rowCount) throw new Error(`Nenhum usuário com o e-mail ${email}.`)
  console.log(`OK: senha de ${email} atualizada.`)
} catch (e) {
  console.error('Falha:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
