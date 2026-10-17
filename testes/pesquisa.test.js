import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Encerramento, respostasEmBranco, montarRegistro, triar, inicioDoDia, estaVencida,
} from "../web/modelo/pesquisa.js";
import { Opcao } from "../web/modelo/entidades.js";

const S = Opcao.SITUACAO_DA_PESQUISA;
const N = Opcao.NECESSIDADE;
const AGORA = new Date("2026-10-17T14:00:00Z");

const respostas = (atendimento, dominio, necessidade) => ({ atendimento, dominio, necessidade });
const pendente = (id, minutosAtras) => ({ id, chamadoEm: new Date(AGORA - minutosAtras * 60000) });
const opcoes = (extra = {}) => ({ emTela: null, agora: AGORA, minutosParaVencer: 30, ignorar: new Set(), ...extra });

// -- registro ---------------------------------------------------------------

test("enviou as tres: Respondida, com os valores marcados", () => {
  const r = montarRegistro(respostas(5, 4, "aguardando"), Encerramento.ENVIADA, AGORA);
  assert.deepEqual(r, {
    notaAtendimento: 5, notaDominio: 4, necessidade: N.AGUARDANDO_RETORNO,
    situacao: S.RESPONDIDA, realizadaEm: AGORA,
  });
});

test("enviou pulando: Respondida parcialmente, nota 0 e Nao respondida", () => {
  const r = montarRegistro(respostas(3, null, null), Encerramento.ENVIADA, AGORA);
  assert.equal(r.situacao, S.RESPONDIDA_PARCIALMENTE);
  assert.equal(r.notaAtendimento, 3);
  assert.equal(r.notaDominio, 0);
  assert.equal(r.necessidade, N.NAO_RESPONDIDA);
});

test("enviou tudo em branco conta como Cancelada pelo cliente", () => {
  const r = montarRegistro(respostasEmBranco(), Encerramento.ENVIADA, AGORA);
  assert.equal(r.situacao, S.CANCELADA_PELO_CLIENTE);
});

test("prefiro nao responder grava o que ja tinha marcado", () => {
  const r = montarRegistro(respostas(2, null, "nao"), Encerramento.CLIENTE, AGORA);
  assert.equal(r.situacao, S.CANCELADA_PELO_CLIENTE);
  assert.equal(r.notaAtendimento, 2);
  assert.equal(r.necessidade, N.NAO);
});

test("cancelada por tempo e por nova senha guardam as marcacoes e o motivo", () => {
  const tempo = montarRegistro(respostas(null, 5, "sim"), Encerramento.TEMPO, AGORA);
  assert.equal(tempo.situacao, S.CANCELADA_POR_TEMPO);
  assert.equal(tempo.notaDominio, 5);
  assert.equal(tempo.necessidade, N.SIM);

  const nova = montarRegistro(respostas(1, null, null), Encerramento.NOVA_SENHA, AGORA);
  assert.equal(nova.situacao, S.CANCELADA_POR_NOVA_SENHA);
  assert.equal(nova.notaAtendimento, 1);
});

// -- prazo e dia ------------------------------------------------------------

test("vence exatamente 30 minutos depois da chamada", () => {
  assert.equal(estaVencida(pendente("a", 29.99), AGORA, 30), false);
  assert.equal(estaVencida(pendente("a", 30), AGORA, 30), true);
});

test("inicio do dia em Brasilia, antes e depois da meia-noite UTC", () => {
  // 17/10 23:00 em Brasilia ja e 18/10 em UTC: o dia ainda e 17.
  assert.equal(inicioDoDia(new Date("2026-10-18T02:00:00Z"), "America/Sao_Paulo").toISOString(),
    "2026-10-17T03:00:00.000Z");
  assert.equal(inicioDoDia(new Date("2026-10-17T03:00:00Z"), "America/Sao_Paulo").toISOString(),
    "2026-10-17T03:00:00.000Z");
  assert.equal(inicioDoDia(new Date("2026-10-17T02:59:59Z"), "America/Sao_Paulo").toISOString(),
    "2026-10-16T03:00:00.000Z");
});

// -- triagem ----------------------------------------------------------------

test("uma pendente valida vira candidata", () => {
  const { candidata, encerrarJa } = triar([pendente("a", 1)], opcoes());
  assert.equal(candidata.id, "a");
  assert.deepEqual(encerrarJa, []);
});

test("pendente que chega vencida nao aparece e sai por tempo", () => {
  const { candidata, encerrarJa } = triar([pendente("a", 31)], opcoes());
  assert.equal(candidata, null);
  assert.deepEqual(encerrarJa.map((e) => [e.pesquisa.id, e.encerramento]), [["a", "tempo"]]);
});

test("duas validas juntas: a mais recente aparece, a outra sai por tempo", () => {
  const { candidata, encerrarJa } = triar([pendente("antiga", 4), pendente("nova", 1)], opcoes());
  assert.equal(candidata.id, "nova");
  assert.deepEqual(encerrarJa.map((e) => [e.pesquisa.id, e.encerramento]), [["antiga", "tempo"]]);
});

test("ignora a que esta na tela e as ja encerradas", () => {
  const emTela = pendente("tela", 2);
  const { candidata, encerrarJa } = triar(
    [emTela, pendente("gravando", 3)],
    opcoes({ emTela, ignorar: new Set(["gravando"]) }));
  assert.equal(candidata, null);
  assert.deepEqual(encerrarJa, []);
});

test("pendente chamada antes da que esta na tela nao a substitui", () => {
  const emTela = pendente("tela", 2);
  const { candidata, encerrarJa } = triar([pendente("atrasada", 5)], opcoes({ emTela }));
  assert.equal(candidata, null);
  assert.deepEqual(encerrarJa.map((e) => e.pesquisa.id), ["atrasada"]);
});
