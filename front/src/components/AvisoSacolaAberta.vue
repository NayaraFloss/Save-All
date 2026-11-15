<script setup>
// Aviso de sacola em aberto: enquanto houver itens na sacola, não é possível iniciar outro pedido.
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from 'stores/estadoApp'
import { servicoSorteio } from '../services/servicoSorteio'

defineProps({
  // Oculta o botão "Ir para a sacola" quando o aviso já está na própria tela da sacola
  ocultarIrParaSacola: { type: Boolean, default: false },
  compacto: { type: Boolean, default: false },
})

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const { cart, cartStoreId } = storeToRefs(appStore)
const { clearCart, getCartSubtotal, triggerNotification } = appStore

const itens = computed(() => cart.value.reduce((total, item) => total + item.quantity, 0))
const total = computed(() => getCartSubtotal().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const confirmando = ref(false)

const irParaSacola = () => {
  if (route.name !== 'FinalizarPedido') router.push({ name: 'FinalizarPedido' })
}
const excluir = () => {
  const eraSurpresa = cart.value.length > 0 && cart.value.every((item) => item.surpresa)
  const lojaId = cartStoreId.value
  clearCart()
  // Sacola excluída sem pagar: a loja não "gasta" a vez dela no rodízio
  if (eraSurpresa && lojaId) servicoSorteio.devolverLojaAoRodizio(lojaId)
  confirmando.value = false
  triggerNotification('Sacola excluída. Escolha a categoria e um novo valor para sortear outra sacola.', 'success')
  // Na tela da sacola não sobra nada para ver: leva o cliente direto para escolher a nova sacola
  if (route.name === 'FinalizarPedido') router.push({ name: 'PedidoCustomizado' })
}
</script>

<template>
  <div v-if="itens > 0">
    <q-banner id="aviso-sacola-aberta" rounded dense class="aviso-sacola text-body2" :class="{ 'aviso-sacola--compacto': compacto }">
      <template #avatar>
        <q-icon name="shopping_bag" color="warning" />
      </template>
      <div class="text-weight-bold">Há uma sacola em aberto ({{ itens }} {{ itens === 1 ? 'item' : 'itens' }} · {{ total }})</div>
      <div class="text-caption">
        Para fazer um novo pedido, é necessário finalizar o pagamento da sacola atual ou excluí-la.
      </div>
      <template #action>
        <q-btn v-if="!ocultarIrParaSacola" id="btn-aviso-ir-sacola" flat dense no-caps color="primary" label="Ir para a sacola" @click="irParaSacola" />
        <q-btn id="btn-aviso-excluir-sacola" flat dense no-caps color="negative" label="Excluir sacola" @click="confirmando = true" />
      </template>
    </q-banner>

    <q-dialog v-model="confirmando">
      <q-card style="width: 100%; max-width: 360px">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold">Excluir sacola?</div>
          <div class="text-body2 q-mt-sm">Os itens da sacola atual serão removidos e esta ação não pode ser desfeita.</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancelar" v-close-popup />
          <q-btn id="btn-confirmar-excluir-sacola" unelevated no-caps color="negative" label="Excluir sacola" @click="excluir" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.aviso-sacola {
  background: #fff8e1;
  color: #5d4037;
  border: 1px solid #ffe082;
}
.body--dark .aviso-sacola {
  background: rgba(255, 193, 7, 0.12);
  color: #ffe9a8;
  border-color: rgba(255, 193, 7, 0.35);
}
</style>