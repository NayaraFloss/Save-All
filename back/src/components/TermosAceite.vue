<script setup>
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
import { formatCPF, formatCNPJ } from "src/utils/formatadores";
const props = defineProps({ role: String });
const emit = defineEmits(["accepted"]);
const appStore = useAppStore();
const { usuarioAtual, modoEscuro } = storeToRefs(appStore);
const { updateProfile, triggerNotification } = appStore;
const razaoSocial = ref(usuarioAtual.value?.name || "");
const cnpj = ref(formatCNPJ(usuarioAtual.value?.cpfCnpj || ""));
const responsavelLegal = ref(usuarioAtual.value?.legalRepresentativeName || usuarioAtual.value?.name || "");
const responsavelCpf = ref(formatCPF(usuarioAtual.value?.legalRepresentativeCpf || ""));
const endereco = ref(usuarioAtual.value?.address || "");
const inscricaoAlvara = ref(usuarioAtual.value?.stateRegistration || "");
const nomeCompleto = ref(usuarioAtual.value?.name || "");
const clienteCpf = ref(formatCPF(usuarioAtual.value?.cpfCnpj || ""));
const email = ref(usuarioAtual.value?.email || "");
const dataNascimento = ref(usuarioAtual.value?.dataNascimento || "");
const acceptedCheckbox = ref(false);
const isSubmitting = ref(false);
const isFormValid = computed(() => {
  if (!acceptedCheckbox.value) return false;
  if (props.role === "store") {
    return razaoSocial.value.trim() !== "" && cnpj.value.trim() !== "" && responsavelLegal.value.trim() !== "" && responsavelCpf.value.trim() !== "" && endereco.value.trim() !== "" && inscricaoAlvara.value.trim() !== "";
  } else {
    return nomeCompleto.value.trim() !== "" && clienteCpf.value.trim() !== "" && email.value.trim() !== "" && dataNascimento.value.trim() !== "";
  }
});
const handleAccept = async () => {
  if (!isFormValid.value) {
    triggerNotification("Por favor, preencha todos os campos obrigat\xF3rios e aceite o termo.", "warning");
    return;
  }
  isSubmitting.value = true;
  try {
    if (props.role === "store") {
      await updateProfile({
        name: razaoSocial.value,
        cpfCnpj: cnpj.value,
        legalRepresentativeName: responsavelLegal.value,
        legalRepresentativeCpf: responsavelCpf.value,
        address: endereco.value,
        stateRegistration: inscricaoAlvara.value,
        termosAceitos: true
      });
      triggerNotification("Termo de ades\xE3o assinado eletronicamente com sucesso!", "success");
    } else {
      await updateProfile({
        name: nomeCompleto.value,
        cpfCnpj: clienteCpf.value,
        email: email.value,
        dataNascimento: dataNascimento.value,
        termosAceitos: true
      });
      triggerNotification("Termos de uso aceitos com sucesso! Boas compras.", "success");
    }
    emit("accepted");
  } catch {
    triggerNotification("Erro ao registrar aceita\xE7\xE3o. Tente novamente.", "error");
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <q-dialog :model-value="true" persistent maximized-on-mobile>
    <q-card :dark="modoEscuro" class="termos-card column no-wrap" :class="modoEscuro ? 'bg-dark text-grey-4' : 'bg-white text-grey-9'">
      <!-- Cabeçalho -->
      <q-card-section class="row items-center justify-between no-wrap" :class="modoEscuro ? 'bg-black' : 'bg-grey-2'">
        <div class="row items-center no-wrap q-gutter-x-md">
          <q-avatar :color="modoEscuro ? 'green-10' : 'green-1'" :text-color="modoEscuro ? 'primary' : 'green-9'" icon="verified_user" size="48px" />
          <div>
            <div class="text-caption text-primary text-weight-bold text-uppercase mono">Conformidade Legal & Segurança</div>
            <div class="text-h6 text-weight-bolder" :class="modoEscuro ? 'text-white' : 'text-grey-10'">
              {{ role === 'store' ? 'Termo de Adesão — Estabelecimento' : 'Termo de Uso — Consumidor' }}
            </div>
          </div>
        </div>
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-badge class="gt-xs mono text-weight-bold" :color="modoEscuro ? 'grey-9' : 'grey-3'" :text-color="modoEscuro ? 'grey-5' : 'grey-8'" label="PLATAFORMA SAVEALL 🌱" />
        </div>
      </q-card-section>

      <q-separator :dark="modoEscuro" />

      <!-- Conteúdo -->
      <q-card-section class="col scroll q-gutter-y-lg">
        <!-- Introdução -->
        <q-banner rounded :dark="modoEscuro" class="intro-banner">
          <div class="text-caption text-primary text-weight-bold text-uppercase q-mb-xs">
            <span>🌱</span> O Projeto SaveAll e Consumo Consciente
          </div>
          <div class="text-caption">
            O <strong>SaveAll</strong> é um ecossistema sustentável focado no combate ao desperdício de alimentos. Conectamos estabelecimentos a clientes para resgatar alimentos que estão em <strong>perfeitas condições de consumo, mas próximos ao prazo de validade</strong>.
            Antes de utilizar nosso aplicativo, precisamos formalizar o entendimento das diretrizes de segurança alimentar, responsabilidade compartilhada e conformidade jurídica (Lei Federal nº 14.016/2020).
          </div>
        </q-banner>

        <!-- Identificação -->
        <div>
          <div class="row items-center q-gutter-x-sm q-mb-md text-caption text-weight-bold text-uppercase text-grey-6">
            <q-icon name="person" color="primary" size="18px" />
            <span>1. Identificação de Cadastro</span>
          </div>

          <div v-if="role === 'store'" class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input
              v-model="razaoSocial"
              label="Razão Social / Nome da Loja"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              placeholder="Razão Social"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              :model-value="cnpj"
              @update:model-value="(v) => (cnpj = formatCNPJ(v))"
              maxlength="18"
              label="CNPJ"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              input-class="mono"
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="responsavelLegal"
              label="Responsável Legal"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              placeholder="Nome Completo do Responsável"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              :model-value="responsavelCpf"
              @update:model-value="(v) => (responsavelCpf = formatCPF(v))"
              maxlength="14"
              label="CPF do Responsável"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              input-class="mono"
              placeholder="000.000.000-00"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="endereco"
              label="Endereço Completo"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              placeholder="Rua, Número, Bairro, Cidade/UF"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="inscricaoAlvara"
              label="Inscrição Estadual / Alvará Sanitário"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              input-class="mono"
              placeholder="Ex: IS-902348 / Alvará nº 1042/2026"
            />
          </div>
          </div>

          <div v-else class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input
              v-model="nomeCompleto"
              label="Nome Completo"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              placeholder="Seu nome completo"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              :model-value="clienteCpf"
              @update:model-value="(v) => (clienteCpf = formatCPF(v))"
              maxlength="14"
              label="CPF"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              input-class="mono"
              placeholder="000.000.000-00"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="email"
              type="email"
              label="E-mail"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              placeholder="seu@email.com"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="dataNascimento"
              type="date"
              label="Data de Nascimento"
              stack-label
              :dark="modoEscuro"
              outlined
              dense
              input-class="mono"
            />
          </div>
          </div>
        </div>

        <q-separator :dark="modoEscuro" />

        <!-- Cláusulas -->
        <div>
          <div class="row items-center q-gutter-x-sm q-mb-md text-caption text-weight-bold text-uppercase text-grey-5">
            <q-icon name="description" color="primary" size="18px" />
            <span>2. Cláusulas do Instrumento Legal</span>
          </div>

          <div v-if="role === 'store'" class="q-gutter-y-md text-caption">
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 1 — Objeto e Propósito Socioambiental</div>
            <div class="text-caption text-weight-light">
              O presente Termo de Adesão regula a adesão do Estabelecimento à plataforma SaveAll, sistema digital focado no combate ao desperdício de alimentos, viabilizando a comercialização de excedentes com desconto e a doação de insumos próprios para consumo, alinhado à Lei Federal nº 14.016/2020 e aos Objetivos de Desenvolvimento Sustentável (ODS 2 e ODS 12) da Agenda 2030 da ONU.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 2 — Identificação, Licenciamento Sanitário e Declarações</div>
            <div class="text-caption text-weight-light">
              O Estabelecimento declara, sob as penas da lei, possuir Inscrição Estadual/Municipal, CNPJ ativo e <strong>Alvará/Licença Sanitária vigentes</strong> emitidos pelos órgãos competentes (Vigilância Sanitária Local e ANVISA). Declara ainda que todos os produtos inseridos na plataforma possuem procedência lícita e se encontram rigorosamente dentro do prazo de validade e próprios para consumo humano.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula clausula-alerta">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-warning">Cláusula 3 — Regimes Jurídicos Distintos: Comercialização vs. Doação Gratuita</div>
            <div class="text-caption text-weight-light">
              <strong>3.1 Venda Comercial com Desconto (CDC):</strong> Na comercialização ou resgate pago de alimentos com desconto, aplica-se integralmente o <strong>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong>. O Estabelecimento é responsável único, direto e exclusivo pela qualidade, higiene, embalagem, rotulagem, acondicionamento e conformidade dos produtos comercializados ao Consumidor Final.
            </div>
            <div class="text-caption text-weight-light">
              <strong>3.2 Doação Gratuita (Lei nº 14.016/2020):</strong> Exclusivamente nas operações de doação direta e gratuita efetuadas sem qualquer contraprestação financeira a entidades beneficentes, recipientes ou pessoas em vulnerabilidade, aplica-se o regime do <strong>Art. 3º da Lei Federal nº 14.016/2020</strong>, o qual isenta o doador de responsabilidade civil por eventuais danos resultantes dos alimentos doados, desde que não comprovados o dolo ou a culpa grave.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 4 — Obrigações de Segurança Alimentar e Penalidades</div>
            <div class="text-caption text-weight-light">
              É estritamente vedado ao Estabelecimento disponibilizar alimentos vencidos, deteriorados, sem identificação de lote ou fracionados em desconformidade com as normas sanitárias. O descumprimento, a inserção de dados falsos de validade ou a reincidência em reclamações de segurança alimentar ensejará a <strong>suspensão imediata ou o cancelamento definitivo da conta</strong> no SaveAll, sem prejuízo das sanções administrativas e civis cabíveis.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 5 — Modelo Econômico e Taxas Operacionais</div>
            <div class="text-caption text-weight-light">
              O SaveAll opera como intermediador tecnológico. As taxas operacionais, comissões ou repasses decorrentes das vendas transacionadas na plataforma observarão as condições comerciais pactuadas na central de configurações do Estabelecimento, garantindo transparência no repasse financeiro.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 6 — Vigência, Rescisão e Desvinculação</div>
            <div class="text-caption text-weight-light">
              Este instrumento vigora por prazo indeterminado a partir da assinatura digital do aceite. Qualquer das partes poderá rescindir o presente Termo a qualquer momento, sem incidência de multa ou ônus rescisório, mediante comunicação prévia formal ou solicitação de encerramento da conta de Estabelecimento.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 7 — Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018)</div>
            <div class="text-caption text-weight-light">
              Os dados corporativos do Estabelecimento e os dados pessoais do Responsável Legal (CNPJ, CPF, Razão Social, endereço e contatos) serão coletados e armazenados estritamente para a execução deste contrato, emissão de atestados ambientais/ESG, conciliação de doações e cumprimento de obrigações legais, conforme a Lei Geral de Proteção de Dados.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 8 — Foro de Eleição</div>
            <div class="text-caption text-weight-light">
              Para dirimir eventuais controvérsias oriundas do presente instrumento, as partes elegem o foro do domicílio do Estabelecimento aderente, com renúncia expressa a qualquer outro por mais privilegiado que seja.
            </div>
          </q-card-section>
        </q-card>
          </div>

          <div v-else class="q-gutter-y-md text-caption">
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 1 — Sobre o Ecossistema SaveAll</div>
            <div class="text-caption text-weight-light">
              O SaveAll é uma plataforma tecnológica que conecta estabelecimentos comerciais a consumidores e organizações sociais para resgate de alimentos com validade próxima ao vencimento por preços acessíveis ou doação gratuita de excedentes. A iniciativa promove a economia circular e atende aos ODS 2 e 12 da ONU.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 2 — Natureza dos Produtos Comercializados e Aplicação do CDC</div>
            <div class="text-caption text-weight-light">
              O Consumidor declara ciência de que os produtos comercializados possuem preço reduzido por estarem próximos à data de vencimento. As compras efetuadas mediante pagamento são regidas pelo <strong>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong>, sendo o Estabelecimento vendedor integralmente responsável pela validade, integridade e higiene do item no momento da entrega/retirada. Recomenda-se o consumo imediato ou dentro do prazo indicado na embalagem.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 3 — Recebimento sob Modalidade de Doação (Lei nº 14.016/2020)</div>
            <div class="text-caption text-weight-light">
              No caso de recebimento de alimentos sob a modalidade de doação gratuita (sem cobrança), aplica-se o regime da Lei nº 14.016/2020. Cabe ao receptor inspecionar os itens recebidos antes do consumo, observando os cuidados de conservação e refrigeração recomendados.
            </div>
          </q-card-section>
        </q-card>
        <q-card flat bordered :dark="modoEscuro" class="clausula">
          <q-card-section class="q-pa-sm q-gutter-y-xs">
            <div class="text-weight-bold text-primary">Cláusula 4 — Proteção de Dados (LGPD - Lei nº 13.709/2018)</div>
            <div class="text-caption text-weight-light">
              Ao utilizar o aplicativo, o Consumidor aceita integralmente estes termos e autoriza o tratamento mínimo de seus dados pessoais (nome, CPF, e-mail e localização) para fins de operacionalização de pedidos, comunicação de status e geração de métricas ambientais sustentáveis.
            </div>
          </q-card-section>
        </q-card>
          </div>
        </div>

        <q-separator :dark="modoEscuro" />

        <!-- Aceite -->
        <q-card flat bordered :dark="modoEscuro" :class="modoEscuro ? 'bg-black' : 'bg-grey-1'">
          <q-card-section class="q-pa-sm">
            <q-checkbox
              id="checkbox-accept-terms"
              v-model="acceptedCheckbox"
              :dark="modoEscuro"
              color="primary"
              class="aceite-check"
              label="Declaro que li, compreendi e aceito integralmente todas as cláusulas e condições estabelecidas no presente instrumento de Aceite de Cadastro da plataforma SaveAll, assinando-o eletronicamente para fins de conformidade e boa-fé."
            />
          </q-card-section>
        </q-card>

        <!-- Metadados da assinatura -->
        <div class="row items-center justify-between q-col-gutter-sm text-grey-6 text-caption mono">
          <div class="row items-center no-wrap q-gutter-x-xs text-primary">
            <q-icon name="lock" size="14px" />
            <span>Assinatura Digital Eletrônica Ativa via IP/Log</span>
          </div>
          <div class="row items-center no-wrap q-gutter-x-xs">
            <q-icon name="schedule" size="14px" />
            <span>Ateste gerado em: {{ new Date().toLocaleString('pt-BR') }}</span>
          </div>
        </div>
      </q-card-section>

      <q-separator :dark="modoEscuro" />

      <!-- Rodapé -->
      <q-card-actions align="right" :class="modoEscuro ? 'bg-black' : 'bg-grey-2'" class="q-pa-md q-gutter-sm">
        <q-btn
          unelevated
          no-caps
          color="primary"
          :text-color="modoEscuro ? 'black' : 'white'"
          class="text-weight-bold"
          label="Assinar e Concordar Eletronicamente"
          icon-right="check"
          :loading="isSubmitting"
          :disable="!isFormValid || isSubmitting"
          @click="handleAccept"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.termos-card {
  width: 100%;
  max-width: 672px;
  max-height: 90vh;
}
.intro-banner {
  background: rgba(67, 160, 71, 0.08);
  border: 1px solid rgba(67, 160, 71, 0.2);
  color: #1b5e20;
}
.body--dark .intro-banner {
  color: inherit;
}
.clausula {
  background: rgba(0, 0, 0, 0.04);
}
.body--dark .clausula {
  background: rgba(0, 0, 0, 0.4);
}
.clausula-alerta {
  border-left: 4px solid var(--q-warning);
}
.mono,
:deep(.mono) {
  font-family: var(--font-mono);
}
.aceite-check {
  font-size: 12px;
}
</style>
