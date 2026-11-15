# Estoque por lote (validade)

1. Rode `banco/migracao_lotes.sql` no pgAdmin (uma vez). Itens atuais viram um lote único.
2. Copie as pastas `src/` deste pacote por cima do seu projeto
   (backend: controladores/alimentos.js, controladores/pedidos.js, utils/estoque.js (novo), utils/mapeadores.js;
    frontend: pages/AdicionarItemLoja.vue, stores/estadoApp.js, components/store/PublishedInventory.vue).
3. Reinicie a API.
