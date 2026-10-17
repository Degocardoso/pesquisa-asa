/*
 * Dubles para testar o ciclo sem tela, sem rede e sem esperar o relogio.
 */

import { readFileSync } from "node:fs";

export const CONFIG = JSON.parse(
  readFileSync(new URL("../web/configuracao.json", import.meta.url), "utf-8"));

// Um avanco de relogio so termina depois que as promessas disparadas pelas
// tarefas venceram. setImmediate roda depois de todas as microtarefas.
const esvaziar = () => new Promise((r) => setImmediate(r));

export class RelogioFalso {
  constructor(inicio) {
    this.t = inicio.getTime();
    this._tarefas = [];
    this._sequencia = 0;
  }

  agora() { return new Date(this.t); }

  agendar(fn, ms) {
    const marca = { quando: this.t + ms, fn, sequencia: this._sequencia++ };
    this._tarefas.push(marca);
    return marca;
  }

  cancelar(marca) { this._tarefas = this._tarefas.filter((t) => t !== marca); }

  async avancar(ms) {
    const alvo = this.t + ms;
    await esvaziar();
    for (;;) {
      this._tarefas.sort((a, b) => a.quando - b.quando || a.sequencia - b.sequencia);
      const proxima = this._tarefas[0];
      if (!proxima || proxima.quando > alvo) break;
      this._tarefas.shift();
      this.t = Math.max(this.t, proxima.quando);
      proxima.fn();
      await esvaziar();
    }
    this.t = alvo;
  }

  segundos(n) { return this.avancar(n * 1000); }
  minutos(n) { return this.avancar(n * 60000); }
}

export class VisaoGravadora {
  constructor() {
    this.tela = null;
    this.pesquisaNaTela = null;
    this.respostasNaTela = null;
    this.alertaAte = null;
    this.agradecimentoTipo = null;
    this.conexaoAtual = { semRede: false, desconectado: null };
  }

  descanso() { this.tela = "descanso"; this.pesquisaNaTela = null; }
  pesquisa(p, respostas) { this.tela = "pesquisa"; this.pesquisaNaTela = p; this.respostasNaTela = respostas; }
  respostas(r) { this.respostasNaTela = r; }
  alerta(ate) { this.alertaAte = ate; }
  agradecimento(tipo) { this.tela = "agradecimento"; this.agradecimentoTipo = tipo; }
  conexao(estado) { this.conexaoAtual = estado; }
}
