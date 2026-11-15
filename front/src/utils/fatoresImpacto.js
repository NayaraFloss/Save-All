// Fatores usados nas estimativas de impacto ambiental da plataforma.
// Mantidos aqui para que a explicação exibida ao usuário (ExplicacaoImpacto.vue) use os mesmos números.

export const FATORES_IMPACTO = {
  // Fatores aplicados pelo sistema (kg de alimento -> impacto evitado)
  co2KgPorKg: 2.5,
  aguaLPorKg: 130,

  // Dados globais publicados pela FAO (2013), base dos fatores acima
  fao: {
    alimentoDesperdicadoGt: 1.3, // bilhões de toneladas (parte comestível)
    co2eGt: 3.3, // bilhões de toneladas de CO2 equivalente por ano
    aguaAzulKm3: 250, // km³ de água azul (superfícies e subsolo) por ano
  },
}

// 1 Gt = 1e12 kg e 1 km³ = 1e12 L, então as razões abaixo já saem em kg/kg e L/kg
export const co2FaoKgPorKg = FATORES_IMPACTO.fao.co2eGt / FATORES_IMPACTO.fao.alimentoDesperdicadoGt
export const aguaFaoLPorKg =
  FATORES_IMPACTO.fao.aguaAzulKm3 / FATORES_IMPACTO.fao.alimentoDesperdicadoGt

export const FONTES_IMPACTO = [
  {
    titulo:
      'FAO (2013) — Food Wastage Footprint: Impacts on Natural Resources (relatório oficial, PDF)',
    url: 'https://www.fao.org/3/i3347e/i3347e.pdf',
  },
  {
    titulo: 'Mesmo relatório na biblioteca da UNCCD (resumo dos números-chave)',
    url: 'https://www.unccd.int/resources/unccd-library/food-wastage-footprint-impacts-natural-resources-summary-report',
  },
]
