// Todas as telas ficam dentro do LayoutPrincipal.
// meta.requiresAuth -> exige usuário logado
// meta.role         -> perfil necessário (client, store, institution, disposal, master)
// meta.wide         -> tela larga (painéis administrativos)
// meta.entry        -> telas de entrada (boas-vindas, login, cadastro): largura total
// (sem wide/entry   -> tela fluida: celular, tablet e notebook)
// meta.hideHeader   -> esconde a barra superior (telas de entrada)
const page = (path, name, file, meta = {}) => ({
  path,
  name,
  component: () => import(`pages/${file}.vue`),
  meta,
})

const routes = [
  {
    path: '/',
    component: () => import('layouts/LayoutPrincipal.vue'),
    children: [
      page('', 'BemVindo', 'BemVindo', { hideHeader: true, entry: true }),
      page('login', 'Login', 'Login', { hideHeader: true, entry: true }),
      page('cadastro', 'Cadastro', 'Cadastro', { hideHeader: true, entry: true }),

      // Cliente
      page('painel-consumidor', 'PainelConsumidor', 'PainelConsumidor', {
        requiresAuth: true,
        role: 'client',
      }),
      page('status-pedido', 'StatusPedido', 'StatusPedido', { requiresAuth: true, role: 'client' }),
      // Pedido por sorteio: o cliente escolhe só a categoria e o valor; o sistema sorteia o estabelecimento
      page('pedido-customizado', 'PedidoCustomizado', 'PedidoCustomizado', {
        requiresAuth: true,
        role: 'client',
      }),
      // A antiga escolha de estabelecimento foi substituída pelo sorteio: links antigos caem na tela de pedido
      {
        path: 'lista-lojas',
        name: 'ListaLojas',
        redirect: { name: 'PedidoCustomizado' },
        meta: { requiresAuth: true, role: 'client' },
      },
      page('lista-alimentos', 'ListaAlimentos', 'ListaAlimentos', {
        requiresAuth: true,
        role: 'client',
      }),
      page('selecao-endereco', 'SelecaoEndereco', 'SelecaoEndereco', {
        requiresAuth: true,
        role: 'client',
      }),
      page('finalizar-pedido', 'FinalizarPedido', 'FinalizarPedido', {
        requiresAuth: true,
        role: 'client',
      }),

      // Estabelecimento
      page('painel-loja', 'PainelLoja', 'PainelLoja', { requiresAuth: true, role: 'store' }),
      page('adicionar-item-loja', 'AdicionarItemLoja', 'AdicionarItemLoja', {
        requiresAuth: true,
        role: 'store',
      }),

      // Demais perfis
      page('painel-entidade', 'PainelEntidade', 'PainelEntidade', {
        requiresAuth: true,
        role: 'institution',
      }),
      page('painel-descarte', 'PainelDescarte', 'PainelDescarte', {
        requiresAuth: true,
        role: 'disposal',
      }),
      page('painel-master', 'PainelMaster', 'PainelMaster', {
        requiresAuth: true,
        role: 'master',
        wide: true,
      }),

      // Públicas
      page('confirmar-doacao', 'ConfirmarDoacao', 'ConfirmarDoacao', {
        hideHeader: true,
        wide: true,
      }),
      page('avaliar-doacao', 'AvaliarDoacao', 'AvaliarDoacao', {
        hideHeader: true,
        wide: true,
      }),
      page('credenciamento-entidade', 'CredenciamentoEntidade', 'CredenciamentoEntidade', {
        hideHeader: true,
        wide: true,
      }),
    ],
  },

  // Always leave this as last one
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErroNaoEncontrado.vue'),
  },
]

export default routes
