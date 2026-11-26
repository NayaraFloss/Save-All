<script setup>
// Painel master > Itens: todos os itens lançados pelas lojas, para o master editar ou excluir.
// Lista: GET /master/alimentos. Edição: PUT /foods/:id. Exclusão: DELETE /foods/:id.
import { ref, computed, onMounted } from "vue";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { useAppStore } from "../../stores/estadoApp";
import { IMAGES } from "src/assets/images";
import { prepararImagemQuadrada } from "src/utils/imagens";

const $q = useQuasar();
const appStore = useAppStore();

const itens = ref([]);
const carregando = ref(false);
const busca = ref("");
const filtroLoja = ref(null);
const filtroCategoria = ref(null);
const filtroSituacao = ref("todos");

const CATEGORIAS = [
  { label: "Salgado", value: "salgado" },
  { label: "Doce", value: "doce" },
  { label: "Misto", value: "misto" }
];
// No cadastro/edição só existem Salgado e Doce; "Misto" é apenas uma opção do sorteio (filtro continua para itens antigos)
const CATEGORIAS_CADASTRO = CATEGORIAS.filter((c) => c.value !== "misto");
const STATUS = [
  { label: "Na vitrine", value: "active" },
  { label: "Pausado", value: "inactive" },
  { label: "Esgotado", value: "sold_out" }
];
const SITUACOES = [
  { label: "Todos", value: "todos" },
  { label: "Na vitrine", value: "active" },
  { label: "Pausados / esgotados", value: "parados" },
  { label: "Vencidos", value: "vencidos" },
  { label: "Vencem hoje", value: "hoje" }
];

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dia = (v) => String(v || "").slice(0, 10);
const dataBr = (v) => (dia(v) ? dia(v).split("-").reverse().join("/") : "—");
const dinheiro = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nomeCategoria = (v) => CATEGORIAS.find((c) => c.value === v)?.label || v || "—";
const nomeStatus = (v) => STATUS.find((s) => s.value === v)?.label || v || "—";
const corStatus = (v) => ({ active: "positive", inactive: "grey-7", sold_out: "orange-8" }[v] || "grey-7");
const imagem = (item) => item.image || IMAGES.alimento01;

const situacaoValidade = (item) => {
  const v = dia(item.dataValidade);
  if (!v) return { texto: "Sem validade", cor: "grey-6" };
  if (item.vencido || v < hoje()) return { texto: "Vencido", cor: "negative" };
  if (v === hoje()) return { texto: "Vence hoje", cor: "deep-orange" };
  return { texto: `Até ${dataBr(v)}`, cor: "grey-8" };
};

const carregar = async () => {
  carregando.value = true;
  try {
    const { data } = await api.get("/master/alimentos");
    itens.value = data;
  } catch (erro) {
    appStore.triggerNotification(erro.response?.data?.message || "Não foi possível carregar os itens.", "error");
  } finally {
    carregando.value = false;
  }
};
onMounted(carregar);

const opcoesLoja = computed(() => {
  const mapa = new Map();
  itens.value.forEach((i) => mapa.set(i.lojaId, i.nomeLoja || i.lojaId));
  return [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
});

const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase();
  return itens.value.filter((i) => {
    if (filtroLoja.value && i.lojaId !== filtroLoja.value) return false;
    if (filtroCategoria.value && i.category !== filtroCategoria.value) return false;
    const v = dia(i.dataValidade);
    if (filtroSituacao.value === "active" && i.status !== "active") return false;
    if (filtroSituacao.value === "parados" && i.status === "active") return false;
    if (filtroSituacao.value === "vencidos" && !(i.vencido || (v && v < hoje()))) return false;
    if (filtroSituacao.value === "hoje" && v !== hoje()) return false;
    if (!termo) return true;
    return [i.name, i.nomeLoja, i.description, i.cidadeLoja].some((t) => String(t || "").toLowerCase().includes(termo));
  });
});

const contagem = computed(() => ({
  total: itens.value.length,
  vencidos: itens.value.filter((i) => i.vencido || (dia(i.dataValidade) && dia(i.dataValidade) < hoje())).length,
  parados: itens.value.filter((i) => i.status !== "active").length
}));

// Depois de editar/excluir, a vitrine dos clientes também é atualizada
const atualizarVitrine = () => appStore.recarregarCatalogo?.();

// ----- Edição -----
const mostrarEdicao = ref(false);
const salvando = ref(false);
const edicao = ref(null);

const abrirEdicao = (item) => {
  const lotes = (item.lotes || []).map((l) => ({
    quantity: l.quantity ?? 0,
    dataFabricacao: dia(l.dataFabricacao),
    dataValidade: dia(l.dataValidade)
  }));
  edicao.value = {
    id: item.id,
    nomeLoja: item.nomeLoja,
    name: item.name || "",
    image: item.image || "",
    imagemNova: false,
    category: ["salgado", "doce"].includes(item.category) ? item.category : "",
    description: item.description || "",
    precoOriginal: Number(item.precoOriginal || 0),
    precoComDesconto: Number(item.precoComDesconto ?? item.precoOriginal ?? 0),
    status: item.status || "active",
    lotes: lotes.length
      ? lotes
      : [{ quantity: item.quantity ?? 0, dataFabricacao: dia(item.dataFabricacao), dataValidade: dia(item.dataValidade) }]
  };
  mostrarEdicao.value = true;
};

// Foto do item: escolhe um arquivo, encaixa num quadrado e comprime antes de salvar
const campoImagem = ref(null);
const lendoImagem = ref(false);
const escolherImagem = () => campoImagem.value?.click();
const imagemEscolhida = async (evento) => {
  const arquivo = evento.target.files?.[0];
  evento.target.value = "";
  if (!arquivo || !edicao.value) return;
  lendoImagem.value = true;
  try {
    edicao.value.image = await prepararImagemQuadrada(arquivo, 480, 0.85);
    edicao.value.imagemNova = true;
  } catch (erro) {
    appStore.triggerNotification(erro.message || "Não foi possível usar essa imagem.", "error");
  } finally {
    lendoImagem.value = false;
  }
};

const adicionarLote = () => edicao.value.lotes.push({ quantity: 1, dataFabricacao: hoje(), dataValidade: hoje() });
const removerLote = (indice) => edicao.value.lotes.splice(indice, 1);

const erroEdicao = computed(() => {
  const e = edicao.value;
  if (!e) return "";
  if (!e.name.trim()) return "Informe o nome do item.";
  if (!["salgado", "doce"].includes(e.category)) return "Escolha a categoria do item: Salgado ou Doce.";
  if (!(e.precoOriginal > 0)) return "O preço original precisa ser maior que zero.";
  if (e.precoComDesconto < 0 || e.precoComDesconto > e.precoOriginal) return "O preço com desconto deve ficar entre zero e o preço original.";
  for (const l of e.lotes) {
    if (l.quantity < 0) return "A quantidade não pode ser negativa.";
    if (!l.dataValidade) return "Informe a validade de cada lote.";
    if (l.dataFabricacao && l.dataFabricacao > l.dataValidade) return "A fabricação não pode ser depois da validade.";
  }
  return "";
});

const salvarEdicao = async () => {
  if (erroEdicao.value) return;
  const e = edicao.value;
  salvando.value = true;
  try {
    const { data } = await api.put(`/foods/${encodeURIComponent(e.id)}`, {
      name: e.name.trim(),
      // A imagem só é enviada quando foi trocada (evita reenviar a foto atual sem necessidade)
      ...(e.imagemNova ? { image: e.image } : {}),
      category: e.category,
      description: e.description.trim(),
      precoOriginal: Number(e.precoOriginal),
      precoComDesconto: Number(e.precoComDesconto),
      status: e.status,
      lotes: e.lotes.map((l) => ({
        quantity: Number(l.quantity) || 0,
        dataFabricacao: l.dataFabricacao || null,
        dataValidade: l.dataValidade
      }))
    });
    appStore.triggerNotification(`Item "${data.name}" atualizado.`, "success");
    mostrarEdicao.value = false;
    await carregar();
    atualizarVitrine();
  } catch (erro) {
    appStore.triggerNotification(erro.response?.data?.message || "Não foi possível salvar o item.", "error");
  } finally {
    salvando.value = false;
  }
};

// ----- Exclusão -----
const excluir = (item) => {
  $q.dialog({
    title: "Excluir item",
    message: `Excluir "${item.name}" de ${item.nomeLoja}? O item sai da vitrine e esta ação não pode ser desfeita.`,
    cancel: { label: "Cancelar", flat: true, noCaps: true },
    ok: { label: "Excluir", color: "negative", unelevated: true, noCaps: true },
    persistent: true
  }).onOk(async () => {
    try {
      await api.delete(`/foods/${encodeURIComponent(item.id)}`);
      itens.value = itens.value.filter((i) => i.id !== item.id);
      appStore.triggerNotification(`Item "${item.name}" excluído.`, "success");
      atualizarVitrine();
    } catch (erro) {
      appStore.triggerNotification(erro.response?.data?.message || "Não foi possível excluir o item.", "error");
    }
  });
};
</script>

<template>
  <div class="column q-gutter-y-sm">
    <div class="row items-center justify-between q-col-gutter-sm">
      <div>
        <div class="text-h6 text-weight-bold">Itens Lançados pelas Lojas</div>
        <div class="text-caption text-grey-7">
          {{ contagem.total }} itens · {{ contagem.vencidos }} vencidos · {{ contagem.parados }} fora da vitrine
        </div>
      </div>
      <q-btn outline no-caps color="grey-8" icon="refresh" label="Atualizar" :loading="carregando" @click="carregar" />
    </div>

    <!-- Filtros -->
    <div class="itens-filtros">
      <q-input v-model="busca" outlined dense clearable placeholder="Buscar por item, loja, descrição ou cidade..." class="itens-busca">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select v-model="filtroLoja" :options="opcoesLoja" emit-value map-options clearable outlined dense label="Loja" />
      <q-select v-model="filtroCategoria" :options="CATEGORIAS" emit-value map-options clearable outlined dense label="Categoria" />
    </div>
    <div class="row q-gutter-xs">
      <q-btn
        v-for="s in SITUACOES"
        :key="s.value"
        no-caps
        unelevated
        :outline="filtroSituacao !== s.value"
        :color="filtroSituacao === s.value ? 'orange-8' : 'grey-7'"
        :label="s.label"
        class="text-weight-bold"
        @click="filtroSituacao = s.value"
      />
    </div>

    <!-- Lista -->
    <q-card v-if="!carregando && !filtrados.length" flat bordered class="q-pa-lg text-center text-grey-7">
      <q-icon name="inventory_2" size="40px" color="grey-5" />
      <div class="q-mt-sm">Nenhum item encontrado com esses filtros.</div>
    </q-card>

    <div class="itens-grade">
      <q-card v-for="item in filtrados" :key="item.id" flat bordered class="item-card">
        <q-card-section class="row no-wrap q-gutter-x-sm items-start q-pa-sm">
          <q-avatar rounded size="56px" class="item-foto"><img :src="imagem(item)" alt="" /></q-avatar>
          <div class="col" style="min-width: 0">
            <div class="text-subtitle2 text-weight-bold ellipsis">{{ item.name }}</div>
            <div class="text-caption text-grey-7 ellipsis">
              <q-icon name="storefront" size="14px" /> {{ item.nomeLoja }}
              <span v-if="item.cidadeLoja"> · {{ item.cidadeLoja }}</span>
              <q-badge v-if="!item.lojaComDono" color="grey-5" class="q-ml-xs">loja sem conta</q-badge>
            </div>
            <div class="row q-gutter-xs q-mt-xs">
              <q-badge outline color="primary">{{ nomeCategoria(item.category) }}</q-badge>
              <q-badge :color="corStatus(item.status)">{{ nomeStatus(item.status) }}</q-badge>
              <q-badge outline :color="situacaoValidade(item).cor">{{ situacaoValidade(item).texto }}</q-badge>
            </div>
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="row items-center justify-between q-pa-sm">
          <div class="text-caption">
            <span class="text-grey-6" style="text-decoration: line-through">{{ dinheiro(item.precoOriginal) }}</span>
            <span class="text-weight-bold text-positive q-ml-xs">{{ dinheiro(item.precoVigente ?? item.precoComDesconto) }}</span>
            <span class="text-grey-7"> · {{ item.quantity ?? 0 }} un.</span>
            <span v-if="(item.lotes || []).length > 1" class="text-grey-7"> · {{ item.lotes.length }} lotes</span>
          </div>
          <div class="row q-gutter-xs">
            <q-btn dense unelevated no-caps color="orange-8" icon="edit" label="Editar" class="q-px-sm" @click="abrirEdicao(item)" />
            <q-btn dense flat round color="negative" icon="delete" @click="excluir(item)">
              <q-tooltip>Excluir item</q-tooltip>
            </q-btn>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Janela de edição -->
    <q-dialog v-model="mostrarEdicao">
      <q-card v-if="edicao" class="edicao-card">
        <q-card-section class="row items-center no-wrap">
          <q-icon name="edit" color="orange-8" size="22px" class="q-mr-sm" />
          <div class="col">
            <div class="text-subtitle1 text-weight-bold">Editar item</div>
            <div class="text-caption text-grey-7">{{ edicao.nomeLoja }}</div>
          </div>
          <q-btn flat round dense icon="close" @click="mostrarEdicao = false" />
        </q-card-section>
        <q-separator />
        <q-card-section class="edicao-corpo q-gutter-y-md">
          <!-- Foto do item -->
          <div class="row items-center no-wrap q-gutter-x-md">
            <q-avatar rounded size="72px" class="item-foto">
              <img :src="edicao.image || IMAGES.alimento01" alt="Foto do item" />
            </q-avatar>
            <div class="col">
              <div class="text-caption text-weight-bold text-grey-8 text-uppercase">Imagem do item</div>
              <input
                ref="campoImagem"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="hidden"
                @change="imagemEscolhida"
              />
              <q-btn
                id="btn-master-trocar-imagem"
                outline
                dense
                no-caps
                color="orange-8"
                icon="photo_camera"
                :label="edicao.imagemNova ? 'Escolher outra imagem' : edicao.image ? 'Trocar imagem' : 'Adicionar imagem'"
                :loading="lendoImagem"
                class="q-mt-xs q-px-sm"
                @click="escolherImagem"
              />
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ edicao.imagemNova ? 'Nova imagem selecionada: será salva ao clicar em "Salvar alterações".' : 'PNG, JPG ou WEBP, até 5 MB.' }}
              </div>
            </div>
          </div>
          <q-input v-model="edicao.name" outlined dense label="Nome do item" maxlength="160" />
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-select v-model="edicao.category" :options="CATEGORIAS_CADASTRO" emit-value map-options outlined dense label="Categoria" />
            </div>
            <div class="col-12 col-sm-6">
              <q-select v-model="edicao.status" :options="STATUS" emit-value map-options outlined dense label="Situação" />
            </div>
            <div class="col-6">
              <q-input v-model.number="edicao.precoOriginal" type="number" min="0" step="0.01" outlined dense prefix="R$" label="Preço original" />
            </div>
            <div class="col-6">
              <q-input v-model.number="edicao.precoComDesconto" type="number" min="0" step="0.01" outlined dense prefix="R$" label="Preço com desconto" />
            </div>
          </div>
          <q-input v-model="edicao.description" type="textarea" autogrow outlined dense label="Descrição" maxlength="1000" />

          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-weight-bold text-grey-8 text-uppercase">Estoque por lote</div>
              <q-btn flat dense no-caps color="primary" icon="add" label="Lote" @click="adicionarLote" />
            </div>
            <div v-for="(lote, i) in edicao.lotes" :key="i" class="row q-col-gutter-sm items-center q-mb-xs">
              <div class="col-12 col-sm-3">
                <q-input v-model.number="lote.quantity" type="number" min="0" outlined dense label="Qtd." />
              </div>
              <div class="col-6 col-sm-4">
                <q-input v-model="lote.dataFabricacao" type="date" outlined dense stack-label label="Fabricação" />
              </div>
              <div class="col-6 col-sm-4">
                <q-input v-model="lote.dataValidade" type="date" outlined dense stack-label label="Validade" />
              </div>
              <div class="col-12 col-sm-1 text-right">
                <q-btn v-if="edicao.lotes.length > 1" flat round dense color="negative" icon="close" @click="removerLote(i)" />
              </div>
            </div>
            <div class="text-caption text-grey-6">Lote com quantidade 0 é retirado do estoque.</div>
          </div>
          <div v-if="erroEdicao" class="text-caption text-negative">{{ erroEdicao }}</div>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps color="grey-7" label="Cancelar" @click="mostrarEdicao = false" />
          <q-btn
            unelevated
            no-caps
            color="orange-8"
            icon="check"
            label="Salvar alterações"
            class="text-weight-bold"
            :loading="salvando"
            :disable="!!erroEdicao"
            @click="salvarEdicao"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.itens-filtros {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 900px) {
  .itens-filtros {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  }
}
// Cartões compactos e juntos: cada um tem só a altura do próprio conteúdo (sem esticar até o fim da tela)
.itens-grade {
  display: grid;
  gap: 8px;
  align-items: start;
  align-content: start;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
}
@media (max-width: 400px) {
  .itens-grade {
    grid-template-columns: minmax(0, 1fr);
  }
}
.item-card {
  border-radius: 12px;
}
.item-foto {
  background: rgba(128, 128, 128, 0.08);
  img {
    object-fit: cover;
  }
}
.edicao-card {
  width: 640px;
  max-width: 94vw;
  border-radius: 16px;
}
.edicao-corpo {
  max-height: 70vh;
  overflow-y: auto;
}
</style>