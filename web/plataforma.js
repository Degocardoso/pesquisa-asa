/*
 * Ponte com a casca Android.
 *
 * A casca expoe um unico metodo, PonteAndroid.chamar(id, metodo, argumentos),
 * e responde chamando window.__ponte.responder(id, ok, valor). Um metodo so,
 * com o nome da acao como texto, mantem o Kotlin pequeno: cada acao nova e um
 * "when" a mais la e uma linha aqui.
 *
 * O mesmo contrato e implementado por simulador/plataforma-simulada.js para
 * rodar no navegador do computador.
 */

import { Crm } from "./modelo/dataverse.js";

export class PlataformaAndroid {
  constructor(ponte) {
    this._ponte = ponte;
    this._pedidos = new Map();
    this._sequencia = 0;
    this._ouvintes = {};

    window.__ponte = {
      responder: (id, ok, valor) => {
        const pedido = this._pedidos.get(id);
        if (!pedido) return;
        this._pedidos.delete(id);
        if (ok) pedido.resolver(valor);
        else pedido.rejeitar(valor);
      },
      evento: (nome, valor) => (this._ouvintes[nome] || []).forEach((fn) => fn(valor)),
    };
  }

  _chamar(metodo, argumentos = {}) {
    return new Promise((resolver, rejeitar) => {
      this._sequencia += 1;
      const id = String(this._sequencia);
      this._pedidos.set(id, { resolver, rejeitar });
      this._ponte.chamar(id, metodo, JSON.stringify(argumentos));
    });
  }

  // -- contrato -----------------------------------------------------------

  // { grupo, temPin, conta, acesso ("segredo" | "conta"), segredoVenceEm,
  //   quiosque, quiosqueSuspenso, versao }
  instalacao() { return this._chamar("instalacao"); }

  conferirPin(pin) { return this._chamar("conferirPin", { pin }); }
  definirPin(atual, novo) { return this._chamar("definirPin", { atual, novo }); }
  definirGrupo(pin, grupo) { return this._chamar("definirGrupo", { pin, grupo }); }
  entrar(pin) { return this._chamar("entrar", { pin }); }
  sair(pin) { return this._chamar("sair", { pin }); }
  sairDoQuiosque(pin) { return this._chamar("sairDoQuiosque", { pin }); }
  voltarAoQuiosque(pin) { return this._chamar("voltarAoQuiosque", { pin }); }
  abrirConfiguracoes(pin) { return this._chamar("abrirConfiguracoes", { pin }); }

  // A casca poe a URL do ambiente e o token; aqui so vai o caminho relativo.
  requisitar(pedido) { return this._chamar("requisitar", pedido); }

  criarCrm(config) {
    return new Crm(this, { fuso: config.fuso, limite: config.limite_da_consulta });
  }

  aoEvento(nome, fn) {
    (this._ouvintes[nome] = this._ouvintes[nome] || []).push(fn);
  }
}
