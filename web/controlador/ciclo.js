/*
 * O ciclo do tablet: consulta o CRM, decide o que vai para a tela, controla os
 * cronometros e garante que todo encerramento chegue ao CRM.
 *
 * Nao conhece HTML nem HTTP. Recebe por injecao:
 *   crm      buscarPendentes(mesas, agora) e gravar(id, registro)
 *   visao    descanso(), pesquisa(p, respostas), respostas(r), alerta(ate),
 *            agradecimento(tipo), conexao(estado)
 *   relogio  agora(), agendar(fn, ms), cancelar(marca)
 * O relogio injetado e o que deixa os testes avancarem 30 minutos em
 * milissegundos.
 */

import {
  Encerramento, respostasEmBranco, respostaValida, algoMarcado,
  montarRegistro, venceEm, estaVencida, inicioDoDia, triar,
} from "../modelo/pesquisa.js";

const TAMANHO_DO_HISTORICO = 20; // so para a tela de diagnostico

export class Ciclo {
  constructor({ crm, visao, relogio, config, mesas }) {
    this._crm = crm;
    this._visao = visao;
    this._relogio = relogio;
    this._config = config;
    this.mesas = mesas;

    this.tela = "descanso";
    this._atual = null;        // { pesquisa, respostas }
    this._aguardando = null;   // a que entra quando o alerta acabar
    this._marcas = { consulta: null, vencimento: null, alerta: null, agradecimento: null };

    // Encerramentos que o CRM ainda nao confirmou. Ficam so em memoria: se o
    // tablet desligar, a pesquisa continua pendente no CRM e o prazo de 30
    // minutos resolve. Nada e guardado em disco para enviar depois.
    this._fila = new Map();
    this._gravando = new Set();

    // Ids ja encerrados hoje. Uma consulta que saiu antes da gravacao terminar
    // ainda traz o registro como pendente; sem isto ele voltaria para a tela.
    this._encerradas = new Set();
    this._dia = null;

    this._ativo = false;
    this._consultando = false;
    this._consultarDeNovo = false;

    this._estado = { semRede: false, desconectado: null };
    this._diagnostico = {
      ultimaConsulta: null, pendentesNaUltima: 0, ultimoErro: null, historico: [],
    };
  }

  // -- ciclo de vida ------------------------------------------------------

  iniciar() {
    this._ativo = true;
    this.tela = "descanso";
    this._visao.descanso();
    this.consultarAgora();
  }

  // Para a manutencao. As gravacoes em andamento continuam por conta propria.
  parar() {
    this._ativo = false;
    Object.keys(this._marcas).forEach((nome) => this._cancelar(nome));
  }

  consultarAgora() {
    if (!this._ativo) return;
    if (this._consultando) { this._consultarDeNovo = true; return; }
    this._agendarConsulta(0);
  }

  // -- o que a pessoa faz na tela -----------------------------------------

  marcar(pergunta, valor) {
    if (!this._atual || !respostaValida(pergunta, valor)) return;
    this._atual.respostas[pergunta] = valor;
    this._visao.respostas({ ...this._atual.respostas });
  }

  enviar() {
    if (!this._atual) return;
    this._encerrarAtual(Encerramento.ENVIADA);
    this._agradecer("respostas");
  }

  recusar() {
    if (!this._atual) return;
    this._encerrarAtual(Encerramento.CLIENTE);
    this._agradecer("recusa");
  }

  // -- consulta -----------------------------------------------------------

  _agendarConsulta(ms) {
    this._cancelar("consulta");
    this._marcas.consulta = this._relogio.agendar(() => this._consultar(), ms);
  }

  async _consultar() {
    this._marcas.consulta = null;
    if (!this._ativo || this._consultando) return;
    this._consultando = true;
    try {
      await this._reenviarFila();
      const agora = this._relogio.agora();
      this._virarODia(agora);

      let pendentes;
      try {
        pendentes = await this._crm.buscarPendentes(this.mesas, agora);
      } catch (erro) {
        this._falhou(erro);
        return;
      }
      this._funcionou();
      this._diagnostico.ultimaConsulta = agora;
      this._diagnostico.pendentesNaUltima = pendentes.length;
      // A tela pode ter mudado durante a espera; a triagem usa o estado de agora.
      if (this._ativo) this._aplicar(pendentes, this._relogio.agora());
    } catch (erro) {
      this._registrarErro(erro);
    } finally {
      this._consultando = false;
      if (this._ativo) {
        const ms = this._consultarDeNovo ? 0 : this._config.segundos_entre_consultas * 1000;
        this._consultarDeNovo = false;
        this._agendarConsulta(ms);
      }
    }
  }

  _aplicar(pendentes, agora) {
    const { candidata, encerrarJa } = triar(pendentes, {
      emTela: this._atual ? this._atual.pesquisa : null,
      agora,
      minutosParaVencer: this._config.minutos_para_vencer,
      ignorar: this._encerradas,
    });

    encerrarJa.forEach((e) => this._encerrar(e.pesquisa, respostasEmBranco(), e.encerramento));

    // Durante o agradecimento a proxima espera; a consulta ao fim dele a traz.
    if (!candidata || this.tela === "agradecimento") return;

    if (!this._atual) {
      this._abrir(candidata);
      return;
    }

    // Nada marcado: a pessoa saiu ou nem comecou. Trocar na hora.
    if (!algoMarcado(this._atual.respostas)) {
      this._encerrarAtual(Encerramento.NOVA_SENHA);
      this._abrir(candidata);
      return;
    }

    // Algo marcado: da a chance de concluir. Se outra chegar durante o
    // alerta, ela toma o lugar desta na espera (a triagem ja encerrou a
    // anterior) e o prazo do alerta nao recomeca.
    this._aguardando = candidata;
    if (!this._marcas.alerta) {
      const ms = this._config.segundos_de_alerta * 1000;
      this._marcas.alerta = this._relogio.agendar(() => this._fimDoAlerta(), ms);
      this._visao.alerta(new Date(agora.getTime() + ms));
    }
  }

  // -- telas --------------------------------------------------------------

  _abrir(pesquisa) {
    this._cancelar("vencimento");
    this._atual = { pesquisa, respostas: respostasEmBranco() };
    this.tela = "pesquisa";
    this._visao.pesquisa(pesquisa, { ...this._atual.respostas });

    const restante = venceEm(pesquisa, this._config.minutos_para_vencer) - this._relogio.agora();
    this._marcas.vencimento = this._relogio.agendar(() => this._venceu(), Math.max(0, restante));
  }

  _agradecer(tipo) {
    this._terminarAlerta();
    this.tela = "agradecimento";
    this._visao.agradecimento(tipo);
    this._marcas.agradecimento = this._relogio.agendar(() => {
      this._marcas.agradecimento = null;
      this._descansar();
    }, this._config.segundos_de_agradecimento * 1000);
  }

  _descansar() {
    this.tela = "descanso";
    this._visao.descanso();
    // Quem estava esperando o agradecimento acabar nao espera mais 5 segundos.
    this.consultarAgora();
  }

  _venceu() {
    this._marcas.vencimento = null;
    if (!this._atual) return;
    this._encerrarAtual(Encerramento.TEMPO);
    this._seguir();
  }

  _fimDoAlerta() {
    // A marca fica ate _terminarAlerta: e por ela que se sabe que a faixa
    // esta na tela e precisa sumir.
    if (this._atual) this._encerrarAtual(Encerramento.NOVA_SENHA);
    this._seguir();
  }

  _seguir() {
    const proxima = this._aguardando;
    this._terminarAlerta();
    const agora = this._relogio.agora();
    if (proxima && !this._encerradas.has(proxima.id)
        && !estaVencida(proxima, agora, this._config.minutos_para_vencer)) {
      this._abrir(proxima);
    } else {
      this._descansar();
    }
  }

  _terminarAlerta() {
    if (this._marcas.alerta) {
      this._cancelar("alerta");
      this._visao.alerta(null);
    }
    this._aguardando = null;
  }

  // -- encerramento e gravacao --------------------------------------------

  _encerrarAtual(encerramento) {
    const { pesquisa, respostas } = this._atual;
    this._atual = null;
    this._cancelar("vencimento");
    this._encerrar(pesquisa, respostas, encerramento);
  }

  _encerrar(pesquisa, respostas, encerramento) {
    const registro = montarRegistro(respostas, encerramento, this._relogio.agora());
    this._encerradas.add(pesquisa.id);
    this._fila.set(pesquisa.id, registro);
    this._lembrar(pesquisa, registro);
    this._gravar(pesquisa.id);
  }

  async _gravar(id) {
    if (this._gravando.has(id) || !this._fila.has(id)) return;
    this._gravando.add(id);
    try {
      await this._crm.gravar(id, this._fila.get(id));
      this._fila.delete(id);
      this._funcionou();
    } catch (erro) {
      if (erro && erro.tipo === "definitivo") {
        // Repetir um pedido que o CRM considera errado so encheria a fila.
        this._fila.delete(id);
        this._registrarErro(erro);
      } else {
        this._falhou(erro);
      }
    } finally {
      this._gravando.delete(id);
    }
  }

  async _reenviarFila() {
    await Promise.all([...this._fila.keys()].map((id) => this._gravar(id)));
  }

  _virarODia(agora) {
    const dia = inicioDoDia(agora, this._config.fuso).getTime();
    if (dia === this._dia) return;
    this._dia = dia;
    this._encerradas = new Set(this._fila.keys());
  }

  // -- conexao e diagnostico ----------------------------------------------

  _funcionou() {
    if (!this._estado.semRede && !this._estado.desconectado) return;
    this._estado = { semRede: false, desconectado: null };
    this._visao.conexao({ ...this._estado });
  }

  _falhou(erro) {
    this._registrarErro(erro);
    const tipo = erro && erro.tipo;
    let novo = this._estado;
    if (tipo === "rede") novo = { semRede: true, desconectado: null };
    else if (tipo === "autenticacao" || tipo === "configuracao") novo = { semRede: false, desconectado: tipo };
    if (novo.semRede !== this._estado.semRede || novo.desconectado !== this._estado.desconectado) {
      this._estado = novo;
      this._visao.conexao({ ...novo });
    }
  }

  _registrarErro(erro) {
    this._diagnostico.ultimoErro = {
      quando: this._relogio.agora(),
      tipo: (erro && erro.tipo) || "inesperado",
      mensagem: (erro && erro.message) || String(erro),
      status: (erro && erro.status) || null,
      detalhe: (erro && erro.corpo) || null,
    };
  }

  _lembrar(pesquisa, registro) {
    const h = this._diagnostico.historico;
    h.unshift({ senha: pesquisa.senha, mesa: pesquisa.mesa, situacao: registro.situacao, quando: registro.realizadaEm });
    if (h.length > TAMANHO_DO_HISTORICO) h.length = TAMANHO_DO_HISTORICO;
  }

  diagnostico() {
    return {
      mesas: [...this.mesas],
      tela: this.tela,
      ...this._estado,
      ...this._diagnostico,
      historico: [...this._diagnostico.historico],
      aguardandoGravacao: this._fila.size,
    };
  }

  _cancelar(nome) {
    if (this._marcas[nome]) {
      this._relogio.cancelar(this._marcas[nome]);
      this._marcas[nome] = null;
    }
  }
}
