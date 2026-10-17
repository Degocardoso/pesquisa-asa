/*
 * CRM em memoria com a mesma interface de Crm (buscarPendentes e gravar).
 *
 * Usado pelos testes e pelo simulador do navegador. Reproduz a semantica da
 * consulta real (mesa, pendente, criada hoje, mais recente primeiro, limite),
 * nao o texto do filtro OData, que tem teste proprio.
 */

import { ErroDoCrm } from "../modelo/dataverse.js";
import { inicioDoDia } from "../modelo/pesquisa.js";

export class CrmFalso {
  constructor({ fuso, limite }) {
    this._fuso = fuso;
    this._limite = limite;
    this._sequencia = 0;
    this.registros = [];
    this.gravacoes = [];
    this.falha = null; // null, "rede", "autenticacao", "transitorio", "definitivo"
    this.consultas = 0;
  }

  chamarSenha({ mesa, chamadoEm, senha }) {
    this._sequencia += 1;
    const registro = {
      id: "00000000-0000-0000-0000-" + String(this._sequencia).padStart(12, "0"),
      senha: senha || "P" + String(this._sequencia).padStart(3, "0"),
      mesa,
      chamadoEm: new Date(chamadoEm.getTime()),
      criadoEm: new Date(chamadoEm.getTime()),
      realizadaEm: null,
      gravado: null,
    };
    this.registros.push(registro);
    return registro;
  }

  async buscarPendentes(mesas, agora) {
    this.consultas += 1;
    this._talvezFalhar();
    const desde = inicioDoDia(agora, this._fuso);
    return this.registros
      .filter((r) => mesas.includes(r.mesa) && r.realizadaEm === null && r.criadoEm >= desde)
      .sort((a, b) => b.chamadoEm - a.chamadoEm)
      .slice(0, this._limite)
      .map((r) => ({ id: r.id, senha: r.senha, mesa: r.mesa, chamadoEm: new Date(r.chamadoEm.getTime()) }));
  }

  async gravar(id, registro) {
    this._talvezFalhar();
    const r = this.registros.find((x) => x.id === id);
    if (!r) throw new ErroDoCrm("Registro nao encontrado.", "definitivo", 404);
    r.realizadaEm = registro.realizadaEm;
    r.gravado = { ...registro };
    this.gravacoes.push({ id, senha: r.senha, ...registro });
  }

  _talvezFalhar() {
    if (!this.falha) return;
    const status = { autenticacao: 401, transitorio: 503, definitivo: 400 }[this.falha] || null;
    throw new ErroDoCrm("Falha simulada: " + this.falha, this.falha, status);
  }
}
