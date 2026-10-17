import { test } from "node:test";
import assert from "node:assert/strict";

import { Ciclo } from "../web/controlador/ciclo.js";
import { CrmFalso } from "../web/simulador/crm-falso.js";
import { Opcao } from "../web/modelo/entidades.js";
import { CONFIG, RelogioFalso, VisaoGravadora } from "./apoio.js";

const S = Opcao.SITUACAO_DA_PESQUISA;
const N = Opcao.NECESSIDADE;
const ABERTURA = new Date("2026-10-17T13:00:00Z"); // 10h em Brasilia

function montar(mesas = [1]) {
  const relogio = new RelogioFalso(ABERTURA);
  const crm = new CrmFalso({ fuso: CONFIG.fuso, limite: CONFIG.limite_da_consulta });
  const visao = new VisaoGravadora();
  const ciclo = new Ciclo({ crm, visao, relogio, config: CONFIG, mesas });
  const chamar = (mesa, minutosAtras = 0) =>
    crm.chamarSenha({ mesa, chamadoEm: new Date(relogio.t - minutosAtras * 60000) });
  ciclo.iniciar();
  return { relogio, crm, visao, ciclo, chamar };
}

const situacoes = (crm) => crm.gravacoes.map((g) => [g.senha, g.situacao]);

test("pesquisa aparece na proxima consulta e o envio grava Respondida", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar();
  await relogio.segundos(1);
  assert.equal(visao.tela, "descanso");

  const senha = chamar(1);
  await relogio.segundos(5);
  assert.equal(visao.tela, "pesquisa");
  assert.equal(visao.pesquisaNaTela.id, senha.id);

  ciclo.marcar("atendimento", 5);
  ciclo.marcar("dominio", 4);
  ciclo.marcar("necessidade", "sim");
  ciclo.enviar();
  await relogio.segundos(0);

  assert.equal(visao.tela, "agradecimento");
  assert.deepEqual(crm.gravacoes[0], {
    id: senha.id, senha: senha.senha, notaAtendimento: 5, notaDominio: 4,
    necessidade: N.SIM, situacao: S.RESPONDIDA, realizadaEm: relogio.agora(),
  });

  await relogio.segundos(CONFIG.segundos_de_agradecimento);
  assert.equal(visao.tela, "descanso");
});

test("so considera a propria mesa", async () => {
  const { relogio, visao, chamar } = montar([2]);
  chamar(1);
  await relogio.segundos(6);
  assert.equal(visao.tela, "descanso");
  chamar(2);
  await relogio.segundos(5);
  assert.equal(visao.tela, "pesquisa");
});

test("marcacao invalida e ignorada", async () => {
  const { relogio, visao, ciclo, chamar } = montar();
  chamar(1);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 7);
  ciclo.marcar("necessidade", "talvez");
  ciclo.marcar("outra", 1);
  assert.deepEqual(visao.respostasNaTela, { atendimento: null, dominio: null, necessidade: null });
});

test("enviar com pergunta em branco nao encerra: avisa quais faltam", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar();
  chamar(1);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 4);
  ciclo.enviar();
  await relogio.segundos(0);

  assert.equal(visao.tela, "pesquisa");
  assert.deepEqual(visao.faltando, ["dominio", "necessidade"]);
  assert.equal(crm.gravacoes.length, 0);

  ciclo.marcar("dominio", 2);
  ciclo.marcar("necessidade", "sim");
  ciclo.enviar();
  await relogio.segundos(0);
  assert.equal(visao.tela, "agradecimento");
  assert.equal(crm.gravacoes[0].situacao, S.RESPONDIDA);
});

test("duas respondidas e prefiro nao responder: Cancelada pelo cliente com as duas", async () => {
  const { relogio, crm, ciclo, chamar } = montar();
  chamar(1);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 5);
  ciclo.marcar("necessidade", "aguardando");
  ciclo.recusar();
  await relogio.segundos(0);
  assert.equal(crm.gravacoes[0].situacao, S.CANCELADA_PELO_CLIENTE);
  assert.equal(crm.gravacoes[0].notaAtendimento, 5);
  assert.equal(crm.gravacoes[0].notaDominio, 0);
  assert.equal(crm.gravacoes[0].necessidade, N.AGUARDANDO_RETORNO);
});

test("prefiro nao responder grava Cancelada pelo cliente com o que marcou", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar();
  chamar(1);
  await relogio.segundos(1);
  ciclo.marcar("dominio", 2);
  ciclo.recusar();
  await relogio.segundos(0);
  assert.equal(visao.agradecimentoTipo, "recusa");
  assert.equal(crm.gravacoes[0].situacao, S.CANCELADA_PELO_CLIENTE);
  assert.equal(crm.gravacoes[0].notaDominio, 2);
  assert.equal(crm.gravacoes[0].notaAtendimento, 0);
  assert.equal(crm.gravacoes[0].necessidade, N.NAO_RESPONDIDA);
});

test("chega vencida: nao aparece e grava por tempo", async () => {
  const { relogio, crm, visao, chamar } = montar();
  chamar(1, 31);
  await relogio.segundos(1);
  assert.equal(visao.tela, "descanso");
  assert.deepEqual(crm.gravacoes.map((g) => g.situacao), [S.CANCELADA_POR_TEMPO]);
});

test("vence na tela: grava por tempo com as marcacoes e volta ao descanso", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar();
  chamar(1, 20); // chamada ha 20 minutos: sobram 10
  await relogio.segundos(1);
  assert.equal(visao.tela, "pesquisa");
  ciclo.marcar("atendimento", 3);

  await relogio.minutos(9);
  assert.equal(visao.tela, "pesquisa");
  await relogio.minutos(1);
  assert.equal(visao.tela, "descanso");
  assert.equal(crm.gravacoes[0].situacao, S.CANCELADA_POR_TEMPO);
  assert.equal(crm.gravacoes[0].notaAtendimento, 3);
});

test("nova senha sem nada marcado troca na hora", async () => {
  const { relogio, crm, visao, chamar } = montar([3, 4]);
  const primeira = chamar(3);
  await relogio.segundos(1);
  const segunda = chamar(4);
  await relogio.segundos(5);
  assert.equal(visao.pesquisaNaTela.id, segunda.id);
  assert.equal(visao.alertaAte, null);
  assert.deepEqual(situacoes(crm), [[primeira.senha, S.CANCELADA_POR_NOVA_SENHA]]);
});

test("nova senha com algo marcado: alerta de 30 s e depois troca", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar([3, 4]);
  const primeira = chamar(3);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 4);
  const segunda = chamar(4);
  await relogio.segundos(5);

  assert.equal(visao.pesquisaNaTela.id, primeira.id);
  assert.ok(visao.alertaAte, "o alerta deveria estar na tela");
  assert.equal(crm.gravacoes.length, 0);

  await relogio.segundos(CONFIG.segundos_de_alerta);
  assert.equal(visao.pesquisaNaTela.id, segunda.id);
  assert.equal(visao.alertaAte, null);
  assert.equal(crm.gravacoes[0].situacao, S.CANCELADA_POR_NOVA_SENHA);
  assert.equal(crm.gravacoes[0].notaAtendimento, 4);
});

test("cliente envia durante o alerta: Respondida, e a nova vem depois do agradecimento", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar([3, 4]);
  chamar(3);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 5);
  const segunda = chamar(4);
  await relogio.segundos(5);
  assert.ok(visao.alertaAte);

  ciclo.marcar("dominio", 5);
  ciclo.marcar("necessidade", "aguardando");
  ciclo.enviar();
  await relogio.segundos(0);
  assert.equal(crm.gravacoes[0].situacao, S.RESPONDIDA);
  assert.equal(visao.alertaAte, null);
  assert.equal(visao.tela, "agradecimento");

  await relogio.segundos(CONFIG.segundos_de_agradecimento);
  assert.equal(visao.tela, "pesquisa");
  assert.equal(visao.pesquisaNaTela.id, segunda.id);
});

test("terceira senha durante o alerta: a do meio sai por tempo sem aparecer", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar([3, 4]);
  const primeira = chamar(3);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 2);
  const meio = chamar(4);
  await relogio.segundos(5);
  const terceira = chamar(3);
  await relogio.segundos(5);

  assert.deepEqual(situacoes(crm), [[meio.senha, S.CANCELADA_POR_TEMPO]]);
  // O alerta nao recomeca: termina 30 s depois de ter aparecido.
  await relogio.segundos(CONFIG.segundos_de_alerta - 5);
  assert.equal(visao.pesquisaNaTela.id, terceira.id);
  assert.deepEqual(situacoes(crm).at(-1), [primeira.senha, S.CANCELADA_POR_NOVA_SENHA]);
});

test("duas chamadas antes da consulta: a mais recente aparece, a outra sai por tempo", async () => {
  const { relogio, crm, visao, chamar } = montar([3, 4]);
  const antiga = chamar(3, 2);
  const nova = chamar(4, 1);
  await relogio.segundos(1);
  assert.equal(visao.pesquisaNaTela.id, nova.id);
  assert.deepEqual(situacoes(crm), [[antiga.senha, S.CANCELADA_POR_TEMPO]]);
});

test("senhas de ontem nunca entram", async () => {
  const { relogio, crm, visao } = montar();
  crm.chamarSenha({ mesa: 1, chamadoEm: new Date("2026-10-16T20:00:00Z") });
  await relogio.segundos(1);
  assert.equal(visao.tela, "descanso");
  assert.equal(crm.gravacoes.length, 0);
});

test("sem rede no envio: agradece, guarda em memoria, nao reexibe e grava quando volta", async () => {
  const { relogio, crm, visao, ciclo, chamar } = montar();
  const senha = chamar(1);
  await relogio.segundos(1);
  ciclo.marcar("atendimento", 5);
  ciclo.marcar("dominio", 3);
  ciclo.marcar("necessidade", "nao");

  crm.falha = "rede";
  ciclo.enviar();
  await relogio.segundos(0);
  assert.equal(visao.tela, "agradecimento");
  assert.equal(crm.gravacoes.length, 0);
  assert.equal(ciclo.diagnostico().aguardandoGravacao, 1);

  await relogio.segundos(CONFIG.segundos_de_agradecimento);
  assert.equal(visao.tela, "descanso");
  assert.equal(visao.conexaoAtual.semRede, true);

  crm.falha = null;
  await relogio.segundos(CONFIG.segundos_entre_consultas);
  assert.equal(visao.tela, "descanso", "a pesquisa ja respondida nao pode voltar");
  assert.deepEqual(situacoes(crm), [[senha.senha, S.RESPONDIDA]]);
  assert.equal(visao.conexaoAtual.semRede, false);
  assert.equal(ciclo.diagnostico().aguardandoGravacao, 0);
});

test("login expirado aparece como desconectado e some quando volta", async () => {
  const { relogio, crm, visao } = montar();
  crm.falha = "autenticacao";
  await relogio.segundos(1);
  assert.equal(visao.conexaoAtual.desconectado, "autenticacao");
  crm.falha = null;
  await relogio.segundos(CONFIG.segundos_entre_consultas);
  assert.equal(visao.conexaoAtual.desconectado, null);
});

test("erro definitivo na gravacao nao fica repetindo", async () => {
  const { relogio, crm, ciclo, chamar } = montar();
  chamar(1);
  await relogio.segundos(1);
  crm.falha = "definitivo";
  ciclo.recusar();
  await relogio.segundos(0);
  assert.equal(ciclo.diagnostico().aguardandoGravacao, 0);
  assert.equal(ciclo.diagnostico().ultimoErro.tipo, "definitivo");
});

test("parado para manutencao nao consulta", async () => {
  const { relogio, crm, ciclo } = montar();
  await relogio.segundos(1);
  const antes = crm.consultas;
  ciclo.parar();
  await relogio.minutos(1);
  assert.equal(crm.consultas, antes);
  ciclo.iniciar();
  await relogio.segundos(1);
  assert.equal(crm.consultas, antes + 1);
});
