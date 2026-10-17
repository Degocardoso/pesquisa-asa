import { test } from "node:test";
import assert from "node:assert/strict";

import {
  montarFiltroDePendentes, montarConsultaDePendentes, montarCorpoDaGravacao,
  lerPendente, classificarResposta, Crm,
} from "../web/modelo/dataverse.js";

const DESDE = new Date("2026-10-17T03:00:00Z");

test("filtro da mesa 1 tem todas as condicoes", () => {
  assert.equal(montarFiltroDePendentes([1], DESDE),
    "fecap_gerarsenha eq true and fecap_atendimentonopresencial eq true"
    + " and fecap_senhanopresencial ne null and fecap_iniciarpesquisa eq 254930001"
    + " and (fecap_mesaasa eq 254930000) and fecap_datarealizacaopesquisa eq null"
    + " and fecap_datadeatribuicao ne null and createdon ge 2026-10-17T03:00:00.000Z");
});

test("mesas 3 e 4 ficam entre parenteses (o erro do fluxo antigo)", () => {
  const filtro = montarFiltroDePendentes([3, 4], DESDE);
  assert.match(filtro, / and \(fecap_mesaasa eq 254930002 or fecap_mesaasa eq 254930003\) and /);
  // Nenhum "or" fora dos parenteses.
  assert.equal(filtro.replace(/\([^)]*\)/g, "").includes(" or "), false);
});

test("mesa desconhecida falha em vez de consultar sem filtro", () => {
  assert.throws(() => montarFiltroDePendentes([5], DESDE), /Mesa desconhecida/);
  assert.throws(() => montarFiltroDePendentes([], DESDE), /Nenhuma mesa/);
});

test("consulta pede poucas colunas, mais recente primeiro e com limite", () => {
  const caminho = montarConsultaDePendentes([2], new Date("2026-10-17T15:00:00Z"),
    { fuso: "America/Sao_Paulo", limite: 5 });
  const [conjunto, consulta] = caminho.split("?");
  const p = new URLSearchParams(consulta);
  assert.equal(conjunto, "ret_relacionamentos");
  assert.equal(p.get("$select"),
    "ret_relacionamentoid,fecap_senhanopresencial,fecap_mesaasa,fecap_datadeatribuicao");
  assert.equal(p.get("$orderby"), "fecap_datadeatribuicao desc");
  assert.equal(p.get("$top"), "5");
  assert.match(p.get("$filter"), /createdon ge 2026-10-17T03:00:00.000Z$/);
});

test("le a linha do CRM", () => {
  assert.deepEqual(lerPendente({
    ret_relacionamentoid: "abc", fecap_senhanopresencial: "P012",
    fecap_mesaasa: 254930003, fecap_datadeatribuicao: "2026-10-17T14:00:00Z",
  }), { id: "abc", senha: "P012", mesa: 4, chamadoEm: new Date("2026-10-17T14:00:00Z") });
});

test("corpo da gravacao em UTC e nas colunas certas", () => {
  assert.deepEqual(montarCorpoDaGravacao({
    notaAtendimento: 5, notaDominio: 0, necessidade: 254930003, situacao: 254930001,
    realizadaEm: new Date("2026-10-17T17:00:00Z"),
  }), {
    crdd3_avalieoatendimentoprestadopeloagente: 5,
    fecap_avaliacaosistemadesenhas: 0,
    fecap_necessidaderesolvida: 254930003,
    fecap_situacaodapesquisa: 254930001,
    fecap_datarealizacaopesquisa: "2026-10-17T17:00:00.000Z",
  });
});

test("classifica as respostas do CRM", () => {
  assert.equal(classificarResposta(204, ""), null);
  assert.equal(classificarResposta(401, {}).tipo, "autenticacao");
  assert.equal(classificarResposta(429, {}).tipo, "transitorio");
  assert.equal(classificarResposta(503, {}).tipo, "transitorio");
  assert.equal(classificarResposta(400, {}).tipo, "definitivo");
  assert.equal(classificarResposta(404, {}).tipo, "definitivo");
});

test("gravar usa PATCH com If-Match para nunca criar registro", async () => {
  const pedidos = [];
  const crm = new Crm({ requisitar: async (p) => { pedidos.push(p); return { status: 204, corpo: "" }; } },
    { fuso: "America/Sao_Paulo", limite: 5 });
  await crm.gravar("abc", {
    notaAtendimento: 1, notaDominio: 2, necessidade: 254930000, situacao: 254930000,
    realizadaEm: new Date("2026-10-17T17:00:00Z"),
  });
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.equal(pedidos[0].caminho, "ret_relacionamentos(abc)");
  assert.deepEqual(pedidos[0].cabecalhos, { "If-Match": "*" });
});

test("falha do transporte vira erro de rede, e de login vira autenticacao", async () => {
  const opcoes = { fuso: "America/Sao_Paulo", limite: 5 };
  const semRede = new Crm({ requisitar: async () => { throw { tipo: "rede", mensagem: "sem wifi" }; } }, opcoes);
  await assert.rejects(semRede.buscarPendentes([1], new Date()), (e) => e.tipo === "rede");
  const semLogin = new Crm({ requisitar: async () => { throw { tipo: "autenticacao", mensagem: "x" }; } }, opcoes);
  await assert.rejects(semLogin.buscarPendentes([1], new Date()), (e) => e.tipo === "autenticacao");
});
