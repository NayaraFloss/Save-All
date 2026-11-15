import { consultar } from '../config/db.js'
import { ErroHttp } from '../utils/erros.js'
import { limpar, extrasSem, textoOu, numeroOu, momentoOu, validacaoParaBanco, validacaoParaFront, traduzir, montarInsert, montarUpdate } from './comum.js'

// Unidades de descarte do front (saveall_disposal_partners) <-> tabela destinos_descarte
export const TRATAMENTOS = ['ATERRO_SANITARIO_CONTROLADO', 'COMPOSTAGEM', 'BIODIGESTOR', 'LIXO_ORGANICO', 'OUTRO']
export const tratamentoParaBanco = (v) => {
  const s = String(v || '').toUpperCase()
  if (TRATAMENTOS.includes(s)) return s
  if (s.includes('BIODIG')) return 'BIODIGESTOR'
  if (s.includes('COMPOST')) return 'COMPOSTAGEM'
  if (s.includes('ATERRO')) return 'ATERRO_SANITARIO_CONTROLADO'
  if (s.includes('ORGAN') || s.includes('ORGÂN') || s.includes('LIXO')) return 'LIXO_ORGANICO'
  return 'OUTRO'
}
const MAPEADOS = [
  'name', 'cnpj', 'treatmentType', 'environmentalLicense', 'address', 'city', 'state', 'postalCode', 'contactPerson', 'email',
  'whatsapp', 'dailyCapacityKg', 'operatingHours', 'isMunicipalUnit', 'municipalAuthority', 'validationStatus', 'validatedAt',
  'active', 'notes'
]
const MENSAGENS = {
  duplicado: 'Já existe uma unidade de descarte com este CNPJ.',
  vinculado: 'Esta unidade tem descartes registrados. Desative em vez de excluir.'
}

export const destinoParaFront = (r) =>
  limpar({
    ...(r.extras || {}),
    id: r.id,
    name: r.nome,
    cnpj: r.cnpj,
    treatmentType: r.tipo_tratamento,
    environmentalLicense: r.licenca_ambiental,
    address: r.endereco,
    city: r.cidade,
    state: r.uf ? String(r.uf).trim() : null,
    postalCode: r.cep,
    contactPerson: r.responsavel,
    email: r.email,
    whatsapp: r.whatsapp,
    dailyCapacityKg: r.capacidade_diaria_kg,
    operatingHours: r.horario_funcionamento,
    isMunicipalUnit: r.unidade_municipal,
    municipalAuthority: r.autoridade_municipal,
    validationStatus: validacaoParaFront(r.status_validacao),
    validatedAt: r.validado_em,
    active: r.ativo,
    notes: r.observacoes
  })

function colunasDeDestino(d) {
  const nome = textoOu(d.name, null, 160)
  if (!nome) throw new ErroHttp(400, 'Informe o nome da unidade de descarte.')
  const cnpj = textoOu(d.cnpj, null, 30)
  if (!cnpj) throw new ErroHttp(400, 'Informe o CNPJ da unidade de descarte.')
  const capacidade = numeroOu(d.dailyCapacityKg)
  const status = validacaoParaBanco(d.validationStatus)
  const extras = extrasSem(d, MAPEADOS)
  if (d.treatmentType && tratamentoParaBanco(d.treatmentType) === 'OUTRO' && d.treatmentType !== 'OUTRO') extras.treatmentTypeOriginal = d.treatmentType
  return {
    nome,
    cnpj,
    tipo_tratamento: tratamentoParaBanco(d.treatmentType),
    licenca_ambiental: textoOu(d.environmentalLicense, null, 120),
    endereco: textoOu(d.address, 'Não informado', 255),
    cidade: textoOu(d.city, 'Pinhalzinho', 120),
    uf: textoOu(d.state, 'SC', 2).toUpperCase(),
    cep: textoOu(d.postalCode, null, 12),
    responsavel: textoOu(d.contactPerson, null, 160),
    email: textoOu(d.email, null, 160),
    whatsapp: textoOu(d.whatsapp, null, 30),
    capacidade_diaria_kg: capacidade && capacidade > 0 ? capacidade : null,
    horario_funcionamento: textoOu(d.operatingHours, null, 200),
    unidade_municipal: !!d.isMunicipalUnit,
    autoridade_municipal: textoOu(d.municipalAuthority, null, 200),
    status_validacao: status,
    validado_em: momentoOu(d.validatedAt) || (status === 'validated' ? new Date().toISOString() : null),
    ativo: status === 'unlinked' ? false : d.active !== false,
    observacoes: textoOu(d.notes, null, 2000),
    extras
  }
}

export const adaptadorDestinos = {
  // Só a administração (master) cadastra aterros e destinos, vinculando cada um a uma cidade
  podeEscrever: ['master'],
  podeRemover: ['master'],

  async listar() {
    const { rows } = await consultar('SELECT * FROM destinos_descarte ORDER BY criado_em, id')
    return rows.map(destinoParaFront)
  },

  async salvar(_req, id, corpo) {
    const colunas = colunasDeDestino(corpo)
    try {
      const { rows: existe } = await consultar('SELECT id FROM destinos_descarte WHERE id = $1', [id])
      const q = existe[0] ? montarUpdate('destinos_descarte', id, colunas) : montarInsert('destinos_descarte', { id, ...colunas })
      const { rows } = await consultar(q.sql, q.valores)
      return destinoParaFront(rows[0])
    } catch (erro) {
      throw traduzir(erro, MENSAGENS)
    }
  },

  async remover(_req, id) {
    try {
      await consultar('DELETE FROM destinos_descarte WHERE id = $1', [id])
    } catch (erro) {
      throw traduzir(erro, MENSAGENS)
    }
  }
}
