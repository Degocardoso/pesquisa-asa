/*
 * Regras da pesquisa, sem tela e sem rede.
 *
 * Tudo aqui e funcao pura: recebe o que aconteceu e devolve o que gravar ou o
 * que mostrar. E o que permite testar as cinco formas de encerramento sem
 * tablet e sem CRM (npm test).
 */

import { Opcao, NOTA_NAO_RESPONDIDA } from "./entidades.js";

const SITUACAO = Opcao.SITUACAO_DA_PESQUISA;

export const Encerramento = Object.freeze({
  ENVIADA: "enviada",           // tocou em Enviar
  CLIENTE: "cliente",           // tocou em "Prefiro nao responder"
  TEMPO: "tempo",               // passou do prazo desde a chamada da senha
  NOVA_SENHA: "nova_senha",     // estava na tela e chegou outra pesquisa
});

export const PERGUNTAS = Object.freeze(["atendimento", "dominio", "necessidade"]);

export const RESPOSTAS_DA_NECESSIDADE = Object.freeze({
  sim: Opcao.NECESSIDADE.SIM,
  aguardando: Opcao.NECESSIDADE.AGUARDANDO_RETORNO,
  nao: Opcao.NECESSIDADE.NAO,
});


// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export function respostasEmBranco() {
  return { atendimento: null, dominio: null, necessidade: null };
}

export function respostaValida(pergunta, valor) {
  if (pergunta === "atendimento" || pergunta === "dominio") {
    return Number.isInteger(valor) && valor >= 1 && valor <= 5;
  }
  if (pergunta === "necessidade") {
    return Object.prototype.hasOwnProperty.call(RESPOSTAS_DA_NECESSIDADE, valor);
  }
  return false;
}

export function quantasRespondidas(respostas) {
  return PERGUNTAS.filter((p) => respostas[p] !== null).length;
}

export function algoMarcado(respostas) {
  return quantasRespondidas(respostas) > 0;
}


// ---------------------------------------------------------------------------
// Encerramento
// ---------------------------------------------------------------------------

export function situacaoDoEncerramento(respostas, encerramento) {
  switch (encerramento) {
    case Encerramento.ENVIADA: {
      const respondidas = quantasRespondidas(respostas);
      if (respondidas === PERGUNTAS.length) return SITUACAO.RESPONDIDA;
      // Enviar tudo em branco equivale a recusar. Pela tela nao acontece (o
      // botao so aparece depois da primeira marcacao), mas a regra nao pode
      // depender disso.
      if (respondidas === 0) return SITUACAO.CANCELADA_PELO_CLIENTE;
      return SITUACAO.RESPONDIDA_PARCIALMENTE;
    }
    case Encerramento.CLIENTE: return SITUACAO.CANCELADA_PELO_CLIENTE;
    case Encerramento.TEMPO: return SITUACAO.CANCELADA_POR_TEMPO;
    case Encerramento.NOVA_SENHA: return SITUACAO.CANCELADA_POR_NOVA_SENHA;
    default: throw new Error("Encerramento desconhecido: " + encerramento);
  }
}

/*
 * O que vai para o CRM. Toda forma de encerramento grava, inclusive as
 * canceladas: e assim que se mede a taxa de resposta. O que o cliente marcou
 * e sempre gravado; o motivo do fim vai so na situacao.
 */
export function montarRegistro(respostas, encerramento, agora) {
  return {
    notaAtendimento: respostas.atendimento ?? NOTA_NAO_RESPONDIDA,
    notaDominio: respostas.dominio ?? NOTA_NAO_RESPONDIDA,
    necessidade: respostas.necessidade === null
      ? Opcao.NECESSIDADE.NAO_RESPONDIDA
      : RESPOSTAS_DA_NECESSIDADE[respostas.necessidade],
    situacao: situacaoDoEncerramento(respostas, encerramento),
    realizadaEm: new Date(agora.getTime()),
  };
}


// ---------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------

// O prazo conta da chamada da senha, nao de quando a pesquisa apareceu no
// tablet: o cliente que esperou a pesquisa chegar ja saiu da mesa ha tempo.
export function venceEm(pesquisa, minutosParaVencer) {
  return new Date(pesquisa.chamadoEm.getTime() + minutosParaVencer * 60000);
}

export function estaVencida(pesquisa, agora, minutosParaVencer) {
  return agora.getTime() >= venceEm(pesquisa, minutosParaVencer).getTime();
}

/*
 * Meia-noite de hoje no fuso informado, como instante UTC.
 *
 * So as senhas do dia interessam. Sem esse corte, a consulta acharia todo o
 * historico: o app antigo nunca voltava "Iniciar Pesquisa?" para Nao nem
 * preenchia a data de realizacao de quem nao respondeu, e o tablet gravaria
 * meses de registros como "Cancelada por tempo" com a data de hoje.
 *
 * O deslocamento e lido do proprio fuso em vez de fixar -3, para continuar
 * certo se o horario de verao voltar.
 */
export function inicioDoDia(agora, fuso) {
  const partes = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(agora).forEach((p) => { partes[p.type] = p.value; });

  const meiaNoiteComoSeFosseUtc = Date.UTC(
    Number(partes.year), Number(partes.month) - 1, Number(partes.day));
  const deslocamento = deslocamentoEmMinutos(new Date(meiaNoiteComoSeFosseUtc), fuso);
  return new Date(meiaNoiteComoSeFosseUtc - deslocamento * 60000);
}

function deslocamentoEmMinutos(instante, fuso) {
  const nome = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, timeZoneName: "longOffset",
  }).formatToParts(instante).find((p) => p.type === "timeZoneName").value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome);
  if (!m) return 0; // "GMT" puro
  const minutos = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutos : minutos;
}


// ---------------------------------------------------------------------------
// Triagem do que veio do CRM
// ---------------------------------------------------------------------------

/*
 * Decide, a partir das pendentes de uma consulta, qual pesquisa merece a tela
 * e quais devem ser encerradas sem aparecer.
 *
 *   pendentes   o que a consulta devolveu: { id, chamadoEm, ... }
 *   emTela      a pesquisa que esta na tela agora, ou null
 *   ignorar     ids ja encerrados neste tablet (a gravacao pode ainda estar
 *               a caminho, e uma consulta que saiu antes dela ainda os traz)
 *
 * Regras:
 *   - vencida nunca aparece: grava como "Cancelada por tempo";
 *   - entre as validas, so a chamada mais recente e candidata;
 *   - as outras nunca chegaram a ser vistas por ninguem e tambem saem como
 *     "Cancelada por tempo". "Nova senha" fica reservada para quem tinha a
 *     pesquisa na frente e a perdeu para a seguinte;
 *   - uma pendente chamada antes da que esta na tela nao a substitui.
 *
 * Devolve { candidata, encerrarJa: [{ pesquisa, encerramento }] }.
 */
export function triar(pendentes, { emTela, agora, minutosParaVencer, ignorar }) {
  const encerrarJa = [];
  const validas = [];

  for (const p of pendentes) {
    if (ignorar.has(p.id) || (emTela && p.id === emTela.id)) continue;
    if (estaVencida(p, agora, minutosParaVencer)) {
      encerrarJa.push({ pesquisa: p, encerramento: Encerramento.TEMPO });
    } else {
      validas.push(p);
    }
  }

  validas.sort((a, b) => b.chamadoEm - a.chamadoEm);
  let candidata = validas.shift() || null;
  validas.forEach((p) => encerrarJa.push({ pesquisa: p, encerramento: Encerramento.TEMPO }));

  if (candidata && emTela && candidata.chamadoEm <= emTela.chamadoEm) {
    encerrarJa.push({ pesquisa: candidata, encerramento: Encerramento.TEMPO });
    candidata = null;
  }

  return { candidata, encerrarJa };
}
