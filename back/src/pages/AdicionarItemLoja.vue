<script setup>
import FundoSustentavel from "components/FundoSustentavel.vue";
import { useRouter } from "vue-router";
import { IMAGES } from 'src/assets/images'
import { ref, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
const router = useRouter();
// Ao salvar ou voltar, sempre retorna ao catálogo de itens.
const voltarAoPainel = () => {
  router.push({ name: "PainelLoja", query: { aba: "published" } });
};
const appStore = useAppStore();
const { usuarioAtual, modoEscuro, editingFood, foods } = storeToRefs(appStore);
const { addNewFoodItem, updateFoodItem, triggerNotification, setEditingFood } = appStore;
const isEditing = ref(false);
const name = ref("");
const category = ref("salgado");
const quantity = ref(5);
const precoOriginal = ref(null);
const selectedImage = ref(IMAGES.lojaSelecao);
const dataFabricacao = ref(todayIso());
const dataValidade = ref("");
const fileInputRef = ref(null);
const uploadedImageName = ref("");
// Edição: lista de lotes do item (cada lote = quantidade + validade).
const lotes = ref([]);

const normalizar = (t) =>
  String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const novoLote = () => ({ quantity: 1, dataFabricacao: todayIso(), dataValidade: "" });
const dia = (v) => (v ? String(v).slice(0, 10) : "");
const formatarData = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Cadastro novo com o nome de um item que a loja já tem: o lote é somado nesse item.
const itemExistente = computed(() => {
  if (isEditing.value || !name.value.trim()) return null;
  const lojaId = usuarioAtual.value?.id?.replace("user-", "");
  return (
    (foods.value || []).find(
      (f) => f.lojaId === lojaId && normalizar(f.name) === normalizar(name.value)
    ) || null
  );
});
const totalLotes = computed(() => lotes.value.reduce((s, l) => s + (Number(l.quantity) || 0), 0));

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

onMounted(() => {
  if (editingFood.value) {
    isEditing.value = true;
    name.value = editingFood.value.name;
    category.value = editingFood.value.category || "salgado";
    quantity.value = editingFood.value.quantity ?? 5;
    precoOriginal.value = Number(editingFood.value.precoOriginal) || null;
    selectedImage.value = editingFood.value.image || selectedImage.value;
    dataFabricacao.value = editingFood.value.dataFabricacao
      ? String(editingFood.value.dataFabricacao).slice(0, 10)
      : todayIso();
    dataValidade.value = editingFood.value.dataValidade
      ? String(editingFood.value.dataValidade).slice(0, 10)
      : "";
    lotes.value = (editingFood.value.lotes?.length
      ? editingFood.value.lotes
      : [{ quantity: editingFood.value.quantity ?? 0, dataFabricacao: editingFood.value.dataFabricacao, dataValidade: editingFood.value.dataValidade }]
    ).map((l) => ({ quantity: l.quantity, dataFabricacao: dia(l.dataFabricacao), dataValidade: dia(l.dataValidade) }));
  } else {
    isEditing.value = false;
  }
});

// Abre o explorador de arquivos do computador ao clicar no ícone da sacola.
const openFileExplorer = () => {
  fileInputRef.value?.click();
};

const handleFileSelected = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    triggerNotification("A imagem precisa estar em formato JPEG ou PNG.", "error");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedImage.value = e.target.result;
    uploadedImageName.value = file.name;
  };
  reader.readAsDataURL(file);
  event.target.value = "";
};

const handleSaveAndPublish = async () => {
  if (!name.value.trim()) {
    triggerNotification("Por favor, informe o nome do item.", "error");
    return;
  }
  const price = Number(precoOriginal.value);
  if (!(price > 0)) {
    triggerNotification("Informe o preço do item.", "error");
    return;
  }
  if (isEditing.value) {
    for (const l of lotes.value) {
      if (!(Number(l.quantity) >= 0)) {
        triggerNotification("Quantidade de lote inválida.", "error");
        return;
      }
      if (!l.dataValidade) {
        triggerNotification("Informe a data de validade de cada lote.", "error");
        return;
      }
      if (l.dataFabricacao && l.dataValidade < l.dataFabricacao) {
        triggerNotification("A validade de um lote não pode ser anterior à fabricação.", "error");
        return;
      }
    }
  } else if (!(Number(quantity.value) >= 1)) {
    triggerNotification("Informe quantas unidades deste lote foram produzidas.", "error");
    return;
  }
  if (!isEditing.value && !dataFabricacao.value) {
    triggerNotification("Informe a data de fabricação do item.", "error");
    return;
  }
  if (!isEditing.value && !dataValidade.value) {
    triggerNotification("Informe a data de validade do item.", "error");
    return;
  }
  if (!isEditing.value && dataValidade.value < dataFabricacao.value) {
    triggerNotification("A data de validade não pode ser anterior à data de fabricação.", "error");
    return;
  }
  let salvou = false;
  if (isEditing.value && editingFood.value) {
    salvou = await updateFoodItem(editingFood.value.id, {
      name: name.value,
      category: category.value,
      image: selectedImage.value,
      lotes: lotes.value.map((l) => ({
        quantity: Number(l.quantity) || 0,
        dataFabricacao: l.dataFabricacao || null,
        dataValidade: l.dataValidade
      })),
      precoOriginal: price,
      precoComDesconto: price
    });
  } else {
    const payload = {
      name: name.value,
      lojaId: usuarioAtual.value?.id.replace("user-", ""),
      nomeLoja: usuarioAtual.value?.name,
      category: category.value,
      dataFabricacao: dataFabricacao.value,
      dataValidade: dataValidade.value,
      precoOriginal: price,
      precoComDesconto: price,
      image: selectedImage.value,
      quantity: quantity.value
    };
    salvou = await addNewFoodItem(payload);
  }
  // Só volta ao painel se o servidor realmente salvou; senão fica no formulário com o erro à vista.
  if (!salvou) return;
  setEditingFood(null);
  voltarAoPainel();
};
const handleBack = () => {
  setEditingFood(null);
  voltarAoPainel();
};
const handleClear = () => {
  name.value = "";
  quantity.value = 5;
  precoOriginal.value = null;
  category.value = "salgado";
  dataFabricacao.value = todayIso();
  dataValidade.value = "";
  selectedImage.value = IMAGES.lojaSelecao;
  uploadedImageName.value = "";
  triggerNotification("Formul\xE1rio limpo!", "success");
};
</script>

<template>
  <q-page class="item-page column no-wrap" :class="{ 'is-dark': modoEscuro }">
    <FundoSustentavel />
    <!-- Header -->
    <div class="page-bar row items-center justify-between no-wrap q-px-md q-py-sm">
      <div class="row items-center no-wrap">
        <q-btn id="btn-add-item-back" flat round dense icon="arrow_back" @click="handleBack" />
        <span class="q-ml-sm text-caption text-weight-bold text-uppercase text-grey-6 font-display gt-xs">Painel da Loja</span>
      </div>
      <div class="col text-center ellipsis q-px-sm text-subtitle2 text-weight-bold text-uppercase font-display">
        {{ isEditing ? 'Edição do Item' : 'Cadastro de Item' }}
      </div>
      <span class="text-caption text-weight-bold text-uppercase text-orange font-display">
        {{ isEditing ? 'Editar Item' : 'Novo Item' }}
      </span>
    </div>

    <!-- Formulário -->
    <div class="col q-px-md q-pt-sm q-pb-sm">
      <div class="form-wrap q-mx-auto">
        <div class="form-grid">
        <!-- Nome -->
        <div class="span-2">
          <div class="text-caption text-weight-bold text-uppercase text-grey-7 q-mb-xs">Nome do item</div>
          <q-input
            id="input-add-item-name"
            v-model="name"
            outlined
            dense
            :dark="modoEscuro"
            hide-bottom-space
            placeholder="Ex: Pão de Queijo"
          />
        </div>

        <!-- Categoria -->
        <div class="span-2">
          <div class="text-caption text-weight-bold text-uppercase text-grey-7 q-mb-xs">Categoria do Item</div>
          <div class="row q-col-gutter-sm">
            <div class="col-4">
              <q-btn
                id="sub-category-salgado"
                no-caps
                unelevated
                :outline="category !== 'salgado'"
                :color="category === 'salgado' ? 'positive' : 'grey-7'"
                class="full-width category-btn"
                @click="category = 'salgado'"
              >
                <div class="column items-center">
                  <span class="text-h6">🥐</span>
                  <span class="text-caption text-weight-bold text-uppercase">Salgado</span>
                </div>
              </q-btn>
            </div>
            <div class="col-4">
              <q-btn
                id="sub-category-doce"
                no-caps
                unelevated
                :outline="category !== 'doce'"
                :color="category === 'doce' ? 'warning' : 'grey-7'"
                class="full-width category-btn"
                @click="category = 'doce'"
              >
                <div class="column items-center">
                  <span class="text-h6">🍩</span>
                  <span class="text-caption text-weight-bold text-uppercase">Doce</span>
                </div>
              </q-btn>
            </div>
            <div class="col-4">
              <q-btn
                id="sub-category-misto"
                no-caps
                unelevated
                :outline="category !== 'misto'"
                :color="category === 'misto' ? 'teal' : 'grey-7'"
                class="full-width category-btn"
                @click="category = 'misto'"
              >
                <div class="column items-center">
                  <span class="text-h6">🥐🍩</span>
                  <span class="text-caption text-weight-bold text-uppercase">Misto</span>
                </div>
              </q-btn>
            </div>
          </div>
        </div>

        <!-- Preço (o desconto é aplicado automaticamente pela validade) -->
        <div class="span-2">
          <div class="text-caption text-weight-bold text-uppercase text-grey-7 q-mb-xs">Preço do item</div>
          <q-input
            id="input-add-original-price"
            v-model.number="precoOriginal"
            type="number"
            min="0"
            step="0.5"
            prefix="R$"
            outlined
            dense
            :dark="modoEscuro"
            placeholder="Ex: 12,50"
            hint="Preço cheio. O desconto é aplicado automaticamente conforme a validade."
          />
        </div>

        <!-- Aviso: o nome já existe na loja, então o cadastro soma estoque no mesmo item -->
        <div v-if="itemExistente" class="span-2">
          <q-banner dense rounded class="bg-blue-1 text-blue-9">
            <template #avatar><q-icon name="info" color="blue" /></template>
            Você já tem <b>{{ itemExistente.name }}</b> (estoque atual: {{ itemExistente.quantity ?? 0 }}).
            Este lote será <b>somado ao mesmo item</b>, com a própria validade. A loja vende sempre primeiro o lote que vence antes.
          </q-banner>
        </div>

        <!-- Cadastro novo: um lote (fabricação, validade e quantidade) -->
        <template v-if="!isEditing">
          <div>
            <div class="text-caption text-weight-bold text-uppercase text-grey-7 q-mb-xs">Data de fabricação</div>
            <q-input
              id="input-add-fabrication-date"
              v-model="dataFabricacao"
              type="date"
              outlined
              dense
              :dark="modoEscuro"
              :max="dataValidade || undefined"
            />
          </div>
          <div>
            <div class="text-caption text-weight-bold text-uppercase text-grey-7 q-mb-xs">Data de validade</div>
            <q-input
              id="input-add-expiration-date"
              v-model="dataValidade"
              type="date"
              outlined
              dense
              :dark="modoEscuro"
              :min="dataFabricacao || undefined"
              hint="Usada para calcular o desconto automático"
            />
          </div>
          <div class="span-2">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7 q-mb-xs">
              {{ itemExistente ? 'Quantidade deste novo lote' : 'Quantidade disponível deste item' }}
            </div>
            <q-input
              id="input-add-quantity"
              v-model.number="quantity"
              type="number"
              min="1"
              outlined
              dense
              :dark="modoEscuro"
              hide-bottom-space
              placeholder="Ex: 5"
            />
          </div>
        </template>

        <!-- Edição: lotes do item (cada validade com a sua quantidade) -->
        <div v-else class="span-2">
          <div class="row items-center justify-between q-mb-xs">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7">Lotes em estoque</div>
            <q-badge color="positive" class="text-weight-bold">Total: {{ totalLotes }}</q-badge>
          </div>
          <div class="text-caption text-grey-6 q-mb-sm">
            Os pedidos descontam sempre do lote que vence primeiro. Quando ele acabar, a promoção do próximo lote passa a valer.
          </div>
          <q-card v-for="(lote, i) in lotes" :key="i" flat bordered :dark="modoEscuro" class="q-mb-sm">
            <q-card-section class="q-pa-sm">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-caption text-weight-bold">
                  Lote {{ i + 1 }}<span v-if="lote.dataValidade"> · vence {{ formatarData(lote.dataValidade) }}</span>
                  <q-badge v-if="i === 0 && lotes.length > 1" color="orange" class="q-ml-xs">sai primeiro</q-badge>
                </span>
                <q-btn flat round dense size="sm" icon="delete" color="negative" @click="lotes.splice(i, 1)" />
              </div>
              <div class="row q-col-gutter-xs">
                <div class="col-4">
                  <q-input v-model.number="lote.quantity" type="number" min="0" outlined dense :dark="modoEscuro" label="Qtd." />
                </div>
                <div class="col-4">
                  <q-input v-model="lote.dataFabricacao" type="date" outlined dense :dark="modoEscuro" label="Fabricação" stack-label />
                </div>
                <div class="col-4">
                  <q-input v-model="lote.dataValidade" type="date" outlined dense :dark="modoEscuro" label="Validade" stack-label />
                </div>
              </div>
            </q-card-section>
          </q-card>
          <q-btn outline no-caps dense color="primary" icon="add" label="Adicionar lote" @click="lotes.push(novoLote())" />
        </div>

        <!-- Imagem -->
        <q-card flat bordered :dark="modoEscuro" class="span-2">
          <q-card-section class="q-gutter-y-sm">
            <div class="text-caption text-weight-bold text-uppercase text-grey-7">Selecione uma imagem representativa</div>

            <!-- input de arquivo escondido, acionado pelo ícone da sacola -->
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png"
              class="hidden-file-input"
              @change="handleFileSelected"
            />

            <q-item
              id="btn-upload-image"
              clickable
              v-ripple
              dense
              class="rounded-borders bordered-box"
              @click="openFileExplorer"
            >
              <q-item-section avatar>
                <q-avatar v-if="uploadedImageName" size="40px" rounded>
                  <img :src="selectedImage" alt="Prévia da foto enviada" />
                </q-avatar>
                <q-avatar v-else size="40px" color="grey-3" text-color="grey-7" icon="photo_camera" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-caption text-weight-medium">
                  {{ uploadedImageName || 'Foto da vitrine' }}
                </q-item-label>
                <q-item-label caption class="font-mono">
                  {{ uploadedImageName ? 'Toque para trocar a imagem' : 'Formato jpeg/png' }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge
                  id="btn-open-file-explorer"
                  color="positive"
                  outline
                  class="font-mono cursor-pointer"
                >
                  <q-icon name="shopping_bag" size="14px" class="q-mr-xs" />
                  Sacola
                </q-badge>
              </q-item-section>
            </q-item>
          </q-card-section>
        </q-card>
        </div>
      </div>
    </div>

    <!-- Ações -->
    <div class="page-footer q-px-md q-py-sm">
      <div class="footer-wrap q-mx-auto row q-col-gutter-sm">
        <div class="col-6">
          <q-btn
            id="btn-add-item-remove"
            unelevated
            no-caps
            color="grey-7"
            outline
            class="full-width text-weight-bold text-uppercase"
            label="Limpar"
            @click="handleClear"
          />
        </div>
        <div class="col-6">
          <q-btn
            id="btn-add-item-save"
            unelevated
            no-caps
            color="positive"
            class="full-width text-weight-bold text-uppercase"
            :label="(isEditing ? 'Salvar Alterações' : 'Publicar Item') + ' ✓'"
            @click="handleSaveAndPublish"
          />
        </div>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.item-page {
  min-height: 100%;
  background: #f5f7f8;

  &.is-dark {
    background: #040c13;
    color: #fff;
  }
}

.page-bar,
.page-footer {
  background: #fff;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}

.page-footer {
  position: sticky;
  bottom: 0;
  z-index: 5;
  border-bottom: 0;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}

.is-dark .page-bar,
.is-dark .page-footer {
  background: #08121e;
}

.form-wrap {
  max-width: 448px;
  width: 100%;
}

.footer-wrap {
  max-width: 448px;
  width: 100%;
}

@media (min-width: 960px) {
  .footer-wrap {
    max-width: 520px;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.span-2 {
  grid-column: 1 / -1;
}

.hidden-file-input {
  display: none;
}

// A partir de telas de computador, o formulário ocupa a tela inteira
// em duas colunas, em vez do layout estreito de celular.
@media (min-width: 960px) {
  .form-wrap {
    max-width: 100%;
  }

  .form-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
  }
}

.category-btn {
  padding: 8px 4px;
}

.bordered-box {
  border: 1px solid rgba(128, 128, 128, 0.25);
}

.text-orange {
  color: #ff9800;
}
</style>