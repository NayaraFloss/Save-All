<script setup>
// Seção "WhatsApp" das configurações (loja e master). Os envios são por mensagem pronta:
// o WhatsApp abre com o número e o texto preenchidos e a pessoa só confirma o envio.
import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "../stores/estadoApp";
import { configWhatsapp, normalizarTelefone, formatarTelefone, abrirWhatsapp } from "../utils/whatsapp";

const props = defineProps({
  // Loja: mostra a opção de abrir a mensagem ao avançar cada pedido
  mostrarAvisoPedidos: { type: Boolean, default: false }
});

const appStore = useAppStore();
const { usuarioAtual } = storeToRefs(appStore);

const numero = ref("");
const abrirEm = ref("app");
const assinatura = ref("");
const avisarStatus = ref(true);

const carregar = (usuario) => {
  const cfg = configWhatsapp(usuario);
  numero.value = usuario?.whatsapp ? formatarTelefone(usuario.whatsapp) : "";
  abrirEm.value = cfg.abrirEm;
  assinatura.value = cfg.assinatura;
  avisarStatus.value = cfg.avisarStatus;
};
watch(usuarioAtual, carregar, { immediate: true });

const numeroInvalido = computed(() => !!numero.value.trim() && !normalizarTelefone(numero.value));
const conectado = computed(() => !!normalizarTelefone(usuarioAtual.value?.whatsapp));

const montarDados = () => ({
  whatsapp: normalizarTelefone(numero.value),
  whatsappConfig: {
    abrirEm: abrirEm.value,
    assinatura: assinatura.value.trim().slice(0, 200),
    avisarStatus: avisarStatus.value
  }
});

const alterado = computed(() => {
  const atual = usuarioAtual.value || {};
  const novo = montarDados();
  return (
    novo.whatsapp !== (normalizarTelefone(atual.whatsapp) || "") ||
    JSON.stringify(novo.whatsappConfig) !== JSON.stringify(configWhatsapp(atual))
  );
});

// Chamado pelo botão "Confirmar/Salvar" da tela que usa este componente
const salvar = async () => {
  if (numeroInvalido.value) {
    appStore.triggerNotification("Número de WhatsApp inválido. Use DDD + número, ex.: (49) 99999-9999.", "warning");
    return false;
  }
  if (!alterado.value) return true;
  await appStore.updateProfile(montarDados());
  return true;
};
defineExpose({ salvar });

// Abre uma conversa com o próprio número para conferir se está tudo certo
const testar = () => {
  const destino = normalizarTelefone(numero.value);
  if (!destino) {
    appStore.triggerNotification("Informe o seu número de WhatsApp para testar.", "warning");
    return;
  }
  const ok = abrirWhatsapp(
    destino,
    "Teste de conexão do Save All: as mensagens prontas estão funcionando.",
    { whatsappConfig: montarDados().whatsappConfig }
  );
  if (!ok) appStore.triggerNotification("O navegador bloqueou a nova aba. Permita pop-ups para este site.", "warning");
};
</script>

<template>
  <div class="q-gutter-y-sm">
    <div class="row items-center justify-between no-wrap">
      <div class="row items-center no-wrap q-gutter-x-sm">
        <q-icon name="chat" color="positive" size="20px" />
        <div class="text-subtitle2 text-weight-bold text-uppercase text-positive">WhatsApp</div>
      </div>
      <q-chip dense :color="conectado ? 'green-1' : 'grey-3'" :text-color="conectado ? 'green-9' : 'grey-8'" size="sm" :icon="conectado ? 'check_circle' : 'link_off'">
        {{ conectado ? "Conectado" : "Sem número" }}
      </q-chip>
    </div>
    <div class="text-caption text-grey-6">
      As mensagens abrem prontas no WhatsApp, com o número e o texto preenchidos. É só tocar em enviar.
    </div>

    <q-input
      v-model="numero"
      outlined
      dense
      label="Seu número de WhatsApp"
      placeholder="(49) 99999-9999"
      inputmode="tel"
      :error="numeroInvalido"
      error-message="Use DDD + número, ex.: (49) 99999-9999"
      hint="Clientes e estabelecimentos usam este número para falar com você"
      @blur="numero = numero && !numeroInvalido ? formatarTelefone(numero) : numero"
    >
      <template #prepend><q-icon name="phone_iphone" color="positive" size="18px" /></template>
    </q-input>

    <div>
      <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">Abrir as mensagens no</div>
      <q-btn-toggle
        v-model="abrirEm"
        spread
        no-caps
        unelevated
        dense
        toggle-color="positive"
        color="grey-2"
        text-color="grey-8"
        :options="[
          { label: 'Aplicativo', value: 'app', icon: 'smartphone' },
          { label: 'WhatsApp Web', value: 'web', icon: 'computer' }
        ]"
      />
    </div>

    <q-input
      v-model="assinatura"
      outlined
      dense
      maxlength="200"
      label="Assinatura (opcional)"
      placeholder="Ex.: Equipe Padaria Kiuda"
      hint="Vai no fim de cada mensagem"
    />

    <q-toggle
      v-if="props.mostrarAvisoPedidos"
      v-model="avisarStatus"
      color="positive"
      label="Abrir a mensagem para o cliente ao avançar cada pedido"
    />

    <q-btn
      outline
      no-caps
      dense
      color="positive"
      icon="send"
      label="Testar no meu WhatsApp"
      class="full-width"
      type="button"
      @click="testar"
    />
  </div>
</template>