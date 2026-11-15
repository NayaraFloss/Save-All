// Criptografa, no banco, certificados digitais que ainda estejam em texto puro
// (cadastrados antes da criptografia ser ativada). Pode rodar mais de uma vez.
// Uso: npm run banco:criptografar
import { pool } from '../src/config/db.js'
import { CAMPOS_SENSIVEIS, estaCriptografado, protegerExtras } from '../src/utils/criptografia.js'

try {
  const { rows } = await pool.query('SELECT id, extras FROM usuarios')
  let alterados = 0
  for (const u of rows) {
    const pendente = CAMPOS_SENSIVEIS.some((c) => typeof u.extras?.[c] === 'string' && u.extras[c] !== '' && !estaCriptografado(u.extras[c]))
    if (!pendente) continue
    await pool.query('UPDATE usuarios SET extras = $1::jsonb WHERE id = $2', [JSON.stringify(protegerExtras(u.extras)), u.id])
    alterados++
  }
  console.log(`OK: ${alterados} usuário(s) atualizado(s).`)
} catch (e) {
  console.error('Falha:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
