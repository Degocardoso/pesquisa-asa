/*
 * A mesma interface de PlataformaAndroid, para desenvolver no navegador do
 * computador sem tablet, sem conta e sem CRM.
 *
 * O CRM e o CrmFalso em memoria, controlado pelo painel do simulador. Mesa e
 * PIN ficam no localStorage para sobreviver a um recarregamento da pagina.
 */

import { CrmFalso } from "./crm-falso.js";

const CHAVE = "pesquisa-asa-simulador";

function lerGuardado() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; }
}

function guardar(dados) {
  try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch { /* aba anonima */ }
}

export class PlataformaSimulada {
  constructor() {
    this._dados = { grupo: null, pin: null, conta: null, ...lerGuardado() };
    this._ouvintes = {};
    this.crm = null;
  }

  async instalacao() {
    return {
      grupo: this._dados.grupo,
      temPin: Boolean(this._dados.pin),
      conta: this._dados.conta,
      acesso: "conta",
      segredoVenceEm: null,
      quiosque: "inativo (simulador)",
      quiosqueSuspenso: false,
      versao: "simulador",
    };
  }

  async conferirPin(pin) { return pin === this._dados.pin; }

  async definirPin(atual, novo) {
    if (this._dados.pin && atual !== this._dados.pin) throw { mensagem: "PIN atual incorreto." };
    this._salvar({ pin: novo });
  }

  async definirGrupo(pin, grupo) {
    this._exigirPin(pin);
    this._salvar({ grupo });
  }

  async entrar(pin) {
    this._exigirPin(pin);
    this._salvar({ conta: "tablet.simulado@fecap.br" });
    if (this.crm && this.crm.falha === "autenticacao") this.crm.falha = null;
  }

  async sair(pin) {
    this._exigirPin(pin);
    this._salvar({ conta: null });
  }

  async sairDoQuiosque() { throw { mensagem: "Nao se aplica no simulador." }; }
  async voltarAoQuiosque() { throw { mensagem: "Nao se aplica no simulador." }; }
  async abrirConfiguracoes() { throw { mensagem: "Nao se aplica no simulador." }; }

  criarCrm(config) {
    if (!this.crm) this.crm = new CrmFalso({ fuso: config.fuso, limite: config.limite_da_consulta });
    return this.crm;
  }

  aoEvento(nome, fn) {
    (this._ouvintes[nome] = this._ouvintes[nome] || []).push(fn);
  }

  emitir(nome, valor) {
    (this._ouvintes[nome] || []).forEach((fn) => fn(valor));
  }

  _exigirPin(pin) {
    if (pin !== this._dados.pin) throw { mensagem: "PIN incorreto." };
  }

  _salvar(mudanca) {
    Object.assign(this._dados, mudanca);
    guardar(this._dados);
  }
}
