/*
 * Conversa com a Web API do Dataverse.
 *
 * Este arquivo monta caminhos, filtros e corpos; quem faz a chamada HTTP e a
 * plataforma (a casca Android, ou o simulador no navegador). Assim o token
 * nunca passa pelo JavaScript e nao dependemos de o Dataverse aceitar CORS
 * vindo do WebView. Nomes de coluna saem todos de entidades.js.
 */

import { TABELA, Campo, Opcao } from "./entidades.js";
import { inicioDoDia } from "./pesquisa.js";

export class ErroDoCrm extends Error {
  /*
   * tipo:
   *   "rede"          sem conexao; tentar de novo quando voltar
   *   "autenticacao"  o tablet precisa entrar de novo na conta
   *   "configuracao"  a instalacao esta incompleta (ex.: sem id do Entra)
   *   "transitorio"   o CRM recusou agora (429, 5xx); tentar de novo
   *   "definitivo"    o pedido esta errado (400, 404...); repetir nao adianta
   */
  constructor(mensagem, tipo, status = null, corpo = null) {
    super(mensagem);
    this.tipo = tipo;
    this.status = status;
    this.corpo = corpo;
  }
}

const COLUNAS_DA_CONSULTA = Object.freeze([
  TABELA.CHAVE,
  Campo.SENHA,
  Campo.MESA,
  Campo.CHAMADO_EM,
]);


// ---------------------------------------------------------------------------
// Montagem (puro, testado)
// ---------------------------------------------------------------------------

/*
 * As mesas vao entre parenteses. No fluxo antigo da Mesa 3 e 4 o filtro era
 * "... and mesa eq 4 or mesa eq 3", que o OData le como
 * "(... and mesa eq 4) or (mesa eq 3)": a Mesa 3 ignorava todas as outras
 * condicoes.
 */
export function montarFiltroDePendentes(mesas, desde) {
  if (!mesas.length) throw new Error("Nenhuma mesa configurada.");
  const porMesa = mesas.map((numero) => {
    const codigo = Opcao.MESA[numero];
    if (codigo === undefined) throw new Error("Mesa desconhecida: " + numero);
    return `${Campo.MESA} eq ${codigo}`;
  });

  return [
    `${Campo.GERA_SENHA} eq true`,
    `${Campo.PRESENCIAL} eq true`,
    `${Campo.SENHA} ne null`,
    `${Campo.INICIAR_PESQUISA} eq ${Opcao.INICIAR_PESQUISA_SIM}`,
    `(${porMesa.join(" or ")})`,
    `${Campo.REALIZADA_EM} eq null`,
    `${Campo.CHAMADO_EM} ne null`,
    `${Campo.CRIADO_EM} ge ${desde.toISOString()}`,
  ].join(" and ");
}

export function montarConsultaDePendentes(mesas, agora, { fuso, limite }) {
  const parametros = [
    ["$select", COLUNAS_DA_CONSULTA.join(",")],
    ["$filter", montarFiltroDePendentes(mesas, inicioDoDia(agora, fuso))],
    // Mais recente primeiro: e ela que vai para a tela. Se houver mais
    // pendentes que o limite, as que sobrarem saem nas proximas consultas.
    ["$orderby", `${Campo.CHAMADO_EM} desc`],
    ["$top", String(limite)],
  ];
  return TABELA.CONJUNTO + "?" + parametros
    .map(([k, v]) => k + "=" + encodeURIComponent(v))
    .join("&");
}

export function lerPendente(linha) {
  return {
    id: linha[TABELA.CHAVE],
    senha: linha[Campo.SENHA],
    mesa: numeroDaMesa(linha[Campo.MESA]),
    chamadoEm: new Date(linha[Campo.CHAMADO_EM]),
  };
}

function numeroDaMesa(codigo) {
  for (const [numero, valor] of Object.entries(Opcao.MESA)) {
    if (valor === codigo) return Number(numero);
  }
  return null;
}

export function montarCorpoDaGravacao(registro) {
  return {
    [Campo.NOTA_ATENDIMENTO]: registro.notaAtendimento,
    [Campo.NOTA_DOMINIO]: registro.notaDominio,
    [Campo.NECESSIDADE]: registro.necessidade,
    [Campo.SITUACAO_DA_PESQUISA]: registro.situacao,
    // Em UTC. A coluna e "Local do usuario": o CRM guarda UTC e converte na
    // exibicao. O fluxo antigo subtraia 3 horas antes de gravar e por isso o
    // historico aparece 3 horas adiantado.
    [Campo.REALIZADA_EM]: registro.realizadaEm.toISOString(),
  };
}

export function classificarResposta(status, corpo) {
  if (status >= 200 && status < 300) return null;
  const detalhe = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  if (status === 401 || status === 403) {
    return new ErroDoCrm("O CRM recusou o acesso deste tablet.", "autenticacao", status, detalhe);
  }
  if (status === 429 || status >= 500) {
    return new ErroDoCrm("O CRM esta indisponivel no momento.", "transitorio", status, detalhe);
  }
  return new ErroDoCrm("O CRM recusou o pedido.", "definitivo", status, detalhe);
}


// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export class Crm {
  /*
   * transporte.requisitar({ metodo, caminho, corpo, cabecalhos }) devolve
   * { status, corpo } ou rejeita com { tipo: "rede" | "autenticacao", mensagem }.
   */
  constructor(transporte, { fuso, limite }) {
    this._transporte = transporte;
    this._fuso = fuso;
    this._limite = limite;
  }

  async buscarPendentes(mesas, agora) {
    const caminho = montarConsultaDePendentes(mesas, agora,
      { fuso: this._fuso, limite: this._limite });
    const resposta = await this._chamar({ metodo: "GET", caminho });
    return (resposta.corpo.value || []).map(lerPendente);
  }

  async gravar(id, registro) {
    await this._chamar({
      metodo: "PATCH",
      caminho: `${TABELA.CONJUNTO}(${id})`,
      corpo: montarCorpoDaGravacao(registro),
      // Sem If-Match o PATCH vira upsert e criaria um registro se o id nao
      // existisse mais.
      cabecalhos: { "If-Match": "*" },
    });
  }

  async _chamar(pedido) {
    let resposta;
    try {
      resposta = await this._transporte.requisitar(pedido);
    } catch (erro) {
      // "configuracao" e a casca dizendo que falta o registro do Entra.
      const tipo = erro && (erro.tipo === "autenticacao" || erro.tipo === "configuracao")
        ? erro.tipo : "rede";
      throw new ErroDoCrm((erro && erro.mensagem) || String(erro), tipo);
    }
    const erro = classificarResposta(resposta.status, resposta.corpo);
    if (erro) throw erro;
    return resposta;
  }
}
