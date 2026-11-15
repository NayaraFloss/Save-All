// Cálculo do frete a partir da configuração do estabelecimento.
// deliveryConfig = { defaultFee: 10, zones: [{ id, type: "bairro" | "cep", value, fee }] }
export const DEFAULT_DELIVERY_FEE = 10;

const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const formatCep = (v) => {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

export const isCepValido = (v) => soDigitos(v).length === 8;

// Extrai um CEP de um endereço em texto (ex.: "... CEP 89870-000 - Pinhalzinho/SC")
export const extractCep = (address) => {
  const m = String(address || "").match(/(\d{5})-?(\d{3})/);
  return m ? `${m[1]}-${m[2]}` : "";
};

export const formatMoney = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

// Prioridade: CEP (o mais específico primeiro) > bairro > taxa padrão
export const calculateDeliveryFee = (config, { cep = "", neighborhood = "" } = {}) => {
  const parsedDefault = Number(config?.defaultFee);
  const defaultFee = Number.isFinite(parsedDefault) && config?.defaultFee !== "" && config?.defaultFee != null
    ? parsedDefault
    : DEFAULT_DELIVERY_FEE;
  const zones = Array.isArray(config?.zones) ? config.zones : [];
  const cepDigits = soDigitos(cep);
  const bairro = normalizar(neighborhood);

  if (cepDigits.length === 8) {
    const porCep = zones
      .filter((z) => z.type === "cep" && soDigitos(z.value).length >= 5)
      .sort((a, b) => soDigitos(b.value).length - soDigitos(a.value).length)
      .find((z) => cepDigits.startsWith(soDigitos(z.value)));
    if (porCep) {
      return { fee: Number(porCep.fee) || 0, source: "cep", label: `CEP ${formatCep(porCep.value)}` };
    }
  }
  if (bairro) {
    const porBairro = zones.find((z) => z.type === "bairro" && normalizar(z.value) === bairro);
    if (porBairro) {
      return { fee: Number(porBairro.fee) || 0, source: "bairro", label: `Bairro ${porBairro.value}` };
    }
  }
  return { fee: defaultFee, source: "padrao", label: "Taxa padrão" };
};
