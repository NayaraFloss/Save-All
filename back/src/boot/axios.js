import { defineBoot } from "#q-app/wrappers";
import axios from "axios";
import { Notify } from "quasar";
import { IMAGES } from "src/assets/images";

// Instância única do axios usada por toda a aplicação (services/*).
const api = axios.create({
  baseURL: process.env.API_URL || "http://localhost:3001/v1",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
  // A sessão é um cookie httpOnly definido pelo back-end: o navegador o envia
  // sozinho em cada requisição e nenhum token fica guardado no localStorage.
  withCredentials: true,
});

// --- Imagens -------------------------------------------------------------
// O banco guarda um nome curto (ex.: "lojaKiuda"); o front usa a URL do arquivo
// em src/assets/images. Estas funções convertem nos dois sentidos.
const CAMPOS_IMAGEM = ["logo", "image", "urlAvatar"];
const urlParaChave = Object.fromEntries(
  Object.entries(IMAGES).map(([chave, url]) => [url, chave]),
);

function converterImagens(dado, mapa) {
  if (Array.isArray(dado)) return dado.map((d) => converterImagens(d, mapa));
  if (dado && typeof dado === "object") {
    const saida = {};
    for (const [k, v] of Object.entries(dado)) {
      saida[k] =
        CAMPOS_IMAGEM.includes(k) && typeof v === "string" && mapa[v]
          ? mapa[v]
          : converterImagens(v, mapa);
    }
    return saida;
  }
  return dado;
}

api.interceptors.request.use((config) => {
  if (config.data && typeof config.data === "object")
    config.data = converterImagens(config.data, urlParaChave);
  return config;
});

api.interceptors.response.use(
  (resposta) => {
    resposta.data = converterImagens(resposta.data, IMAGES);
    return resposta;
  },
  (erro) => {
    // Sessão vencida (401) numa ação de quem estava logado: o back-end já apagou o cookie.
    // Avisa e leva para o login, em vez de a tela seguir como se nada tivesse acontecido.
    const url = erro.config?.url || "";
    const rotaDeLogin =
      url.startsWith("/auth/me") ||
      url.startsWith("/auth/login") ||
      url.startsWith("/auth/signup");
    if (erro.response?.status === 401 && !rotaDeLogin && aoPerderSessao)
      aoPerderSessao();
    // Sem resposta nenhuma: a API está fora do ar (ou caiu). Avisa uma vez, em vez de a
    // tela aparecer "zerada" como se não houvesse dados.
    if (!erro.response && erro.code !== "ERR_CANCELED") avisarServidorFora();
    return Promise.reject(erro);
  },
);

let ultimoAvisoServidor = 0;
function avisarServidorFora() {
  if (Date.now() - ultimoAvisoServidor < 15000) return;
  ultimoAvisoServidor = Date.now();
  Notify.create({
    type: "negative",
    position: "top",
    timeout: 8000,
    icon: "cloud_off",
    message: "Sem conexão com o servidor (API).",
    caption:
      "Os dados não puderam ser carregados. Confira se a API está rodando e recarregue a página.",
    actions: [
      {
        label: "Recarregar",
        color: "white",
        handler: () => window.location.reload(),
      },
    ],
  });
}

let aoPerderSessao = null;
let avisandoSessao = false;

export default defineBoot(({ app, router }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
  aoPerderSessao = async () => {
    if (avisandoSessao) return;
    avisandoSessao = true;
    try {
      const { useAppStore } = await import("stores/estadoApp");
      const appStore = useAppStore();
      if (appStore.usuarioAtual) {
        appStore.triggerNotification(
          "Sua sessão expirou. Entre novamente para continuar.",
          "warning",
        );
        appStore.logout();
        router.push({ name: "Login" }).catch(() => {});
      }
    } finally {
      setTimeout(() => (avisandoSessao = false), 3000);
    }
  };
});

export { api };
