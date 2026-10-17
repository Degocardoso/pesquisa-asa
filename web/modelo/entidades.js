/*
 * Mapeamento entre o Dataverse e a pesquisa.
 *
 * ESTE E O UNICO ARQUIVO QUE VOCE PRECISA EDITAR se algum campo for renomeado
 * no CRM. Nenhum nome logico de coluna nem codigo de opcao aparece em outro
 * lugar do projeto.
 *
 * Os nomes vieram do pacote do app de canvas antigo (APLICATIVODECSATMESA01),
 * dos fluxos "Pega ultimo atendimento" e "Manda resposta NPS", e dos valores
 * informados para as duas colunas novas.
 */

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

export const TABELA = Object.freeze({
  NOME_LOGICO: "ret_relacionamento",
  CONJUNTO: "ret_relacionamentos", // usado na URL da Web API
  CHAVE: "ret_relacionamentoid",
});


// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

export const Campo = Object.freeze({
  // Os filtros que definem "esta senha e do atendimento presencial"
  GERA_SENHA: "fecap_gerarsenha",
  PRESENCIAL: "fecap_atendimentonopresencial",
  // So existe em senha tirada no totem, e e o que garante que a hora da
  // chamada esta preenchida: quem a preenche e um fluxo do sistema que roda
  // para toda senha do totem.
  SENHA: "fecap_senhanopresencial",

  MESA: "fecap_mesaasa",                        // rotulo: "Mesa ASA"
  INICIAR_PESQUISA: "fecap_iniciarpesquisa",    // rotulo: "Iniciar Pesquisa?"
  CRIADO_EM: "createdon",
  CHAMADO_EM: "fecap_datadeatribuicao",         // rotulo: "Hora de Chamada"

  // Quando a pesquisa terminou, de qualquer uma das cinco formas. Vazio
  // significa pendente. Nao confundir com fecap_datadepesquisa, que no CRM
  // e "Data e hora que a pesquisa foi iniciada" e nunca foi gravada pelo
  // app antigo.
  REALIZADA_EM: "fecap_datarealizacaopesquisa",

  // Pergunta 1. Inteiro de 0 a 10 no CRM; o rotulo "De 0 a 10" e herdado.
  NOTA_ATENDIMENTO: "crdd3_avalieoatendimentoprestadopeloagente",
  // Pergunta 2. O nome guardava "avaliacao do sistema de senhas", pergunta
  // que saiu. O nome logico nao muda; o rotulo no CRM sera renomeado.
  NOTA_DOMINIO: "fecap_avaliacaosistemadesenhas",
  // Pergunta 3. Substitui fecap_seuproblemafoiresolvido (Sim/Nao) do app antigo.
  NECESSIDADE: "fecap_necessidaderesolvida",
  // Por que a pesquisa terminou. Separado da resposta de proposito: a
  // pergunta 3 guarda so o que o cliente disse.
  SITUACAO_DA_PESQUISA: "fecap_situacaodapesquisa",
});


// ---------------------------------------------------------------------------
// Conjuntos de opcoes
// ---------------------------------------------------------------------------

export const Opcao = Object.freeze({
  INICIAR_PESQUISA_SIM: 254930001,

  // Chave e o numero da mesa como as pessoas falam.
  MESA: Object.freeze({
    1: 254930000,
    2: 254930001,
    3: 254930002,
    4: 254930003,
  }),

  NECESSIDADE: Object.freeze({
    SIM: 254930000,
    AGUARDANDO_RETORNO: 254930001,
    NAO: 254930002,
    NAO_RESPONDIDA: 254930003,
  }),

  SITUACAO_DA_PESQUISA: Object.freeze({
    RESPONDIDA: 254930000,
    RESPONDIDA_PARCIALMENTE: 254930001,
    CANCELADA_PELO_CLIENTE: 254930002,
    CANCELADA_POR_TEMPO: 254930003,
    CANCELADA_POR_NOVA_SENHA: 254930004,
  }),
});

// Pergunta de 1 a 5 sem resposta. Os graficos so consideram de 1 a 5, entao o
// zero nunca entra numa media.
export const NOTA_NAO_RESPONDIDA = 0;
