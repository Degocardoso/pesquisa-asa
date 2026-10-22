/*
 * Tela de manutencao: PIN, mesa atendida, conta do tablet, saida do quiosque
 * e diagnostico.
 *
 * Quem confere o PIN e a plataforma (a casca Android guarda so o hash). Esta
 * tela apenas o transporta, como no totem, e o repassa em cada acao protegida.
 */

import { Opcao } from "../modelo/entidades.js";

const $  = (s, raiz) => (raiz || document).querySelector(s);
const $$ = (s, raiz) => Array.from((raiz || document).querySelectorAll(s));

const TAMANHO_MINIMO_DO_PIN = 4;
const TAMANHO_MAXIMO_DO_PIN = 8;

const NOMES_DAS_SITUACOES = Object.fromEntries(
  Object.entries(Opcao.SITUACAO_DA_PESQUISA).map(([chave, codigo]) => {
    const texto = chave.toLowerCase().replace(/_/g, " ");
    return [codigo, texto.charAt(0).toUpperCase() + texto.slice(1)];
  }));

export class Manutencao {
  /*
   * servicos: {
   *   plataforma,
   *   diagnostico()          estado do ciclo, ou null se nao ha ciclo
   *   aoMudarGrupo(grupo)
   *   aoFechar()
   * }
   */
  constructor({ textos, config, servicos }) {
    this._textos = textos;
    this._config = config;
    this._s = servicos;
    this._modo = null;
    this._digitado = "";
    this._pin = null;          // PIN conferido nesta abertura
    this._novoPin = null;
    this._instalacao = null;
    this._inatividade = null;
    this._atualizacao = null;

    this._montarTeclado();
    $("#btn-fechar-manutencao").addEventListener("click", () => this.fechar());
    $("#btn-entrar").addEventListener("click", () => this._acao(async () => {
      await this._s.plataforma.entrar(this._pin);
    }));
    $("#btn-sair-conta").addEventListener("click", () => this._acao(async () => {
      await this._s.plataforma.sair(this._pin);
    }));
    $("#btn-trocar-pin").addEventListener("click", () => this._irPara("definir"));
    $("#btn-sair-quiosque").addEventListener("click", () => this._acao(async () => {
      await this._s.plataforma.sairDoQuiosque(this._pin);
    }));
    $("#btn-voltar-quiosque").addEventListener("click", () => this._acao(async () => {
      await this._s.plataforma.voltarAoQuiosque(this._pin);
    }));
    $("#btn-configuracoes").addEventListener("click", () => this._acao(async () => {
      await this._s.plataforma.abrirConfiguracoes(this._pin);
    }));
    // Manutencao esquecida aberta para a pesquisa do tablet.
    $("#manutencao").addEventListener("pointerdown", () => this._reiniciarInatividade());
  }

  get aberta() { return !$("#manutencao").hidden; }

  async abrir() {
    this._instalacao = await this._s.plataforma.instalacao();
    this._pin = null;
    this._textos.idioma = this._textos.padrao;
    this._textos.aplicar($("#manutencao"));
    $("#manutencao").hidden = false;
    this._irPara(this._instalacao.temPin ? "pin" : "definir");
    this._reiniciarInatividade();
  }

  fechar() {
    clearTimeout(this._inatividade);
    clearInterval(this._atualizacao);
    this._pin = null;
    this._digitado = "";
    $("#manutencao").hidden = true;
    this._s.aoFechar();
  }

  // -- PIN ----------------------------------------------------------------

  _irPara(modo) {
    this._modo = modo;
    this._digitado = "";
    this._desenharVisor();
    $("#pin-erro").textContent = "";
    const painel = modo === "painel";
    $("#etapa-pin").hidden = painel;
    $("#etapa-painel").hidden = !painel;
    clearInterval(this._atualizacao);

    const t = (c) => this._textos.t("manutencao." + c);
    if (modo === "pin") { $("#pin-titulo").textContent = t("digitePin"); $("#pin-apoio").textContent = ""; }
    if (modo === "definir") { $("#pin-titulo").textContent = t("definirPin"); $("#pin-apoio").textContent = t("definirPinApoio"); }
    if (modo === "confirmar") { $("#pin-titulo").textContent = t("confirmarPin"); $("#pin-apoio").textContent = ""; }
    if (painel) {
      this._desenharPainel();
      this._atualizacao = setInterval(() => this._desenharDiagnostico(), 2000);
    }
  }

  _montarTeclado() {
    const teclado = $("#teclado-pin");
    const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "apagar", "0", "ok"];
    teclas.forEach((tecla) => {
      const b = document.createElement("button");
      b.className = "tecla" + (tecla.length > 1 ? " tecla-acao" : "");
      if (tecla === "apagar") b.dataset.texto = "manutencao.apagar";
      else if (tecla === "ok") b.dataset.texto = "manutencao.ok";
      else b.textContent = tecla;
      b.addEventListener("click", () => this._tecla(tecla));
      teclado.appendChild(b);
    });
  }

  _tecla(tecla) {
    $("#pin-erro").textContent = "";
    if (tecla === "apagar") this._digitado = this._digitado.slice(0, -1);
    else if (tecla === "ok") { this._confirmar(); return; }
    else if (this._digitado.length < TAMANHO_MAXIMO_DO_PIN) this._digitado += tecla;
    this._desenharVisor();
  }

  _desenharVisor() {
    $("#visor-pin").textContent = "•".repeat(this._digitado.length);
  }

  async _confirmar() {
    const t = (c) => this._textos.t("manutencao." + c);
    const digitado = this._digitado;
    this._digitado = "";
    this._desenharVisor();

    if (digitado.length < TAMANHO_MINIMO_DO_PIN) { $("#pin-erro").textContent = t("pinCurto"); return; }

    if (this._modo === "pin") {
      if (await this._s.plataforma.conferirPin(digitado)) {
        this._pin = digitado;
        this._irPara("painel");
      } else {
        $("#pin-erro").textContent = t("pinIncorreto");
      }
    } else if (this._modo === "definir") {
      this._novoPin = digitado;
      this._irPara("confirmar");
    } else if (this._modo === "confirmar") {
      if (digitado !== this._novoPin) {
        this._irPara("definir");
        $("#pin-erro").textContent = t("pinsDiferentes");
        return;
      }
      try {
        await this._s.plataforma.definirPin(this._pin, digitado);
        this._pin = digitado;
        this._instalacao = await this._s.plataforma.instalacao();
        this._irPara("painel");
      } catch (erro) {
        this._irPara("definir");
        $("#pin-erro").textContent = t("falhou") + " " + mensagemDe(erro);
      }
    }
  }

  // -- painel -------------------------------------------------------------

  _desenharPainel() {
    const grupos = $("#grupos");
    grupos.innerHTML = "";
    Object.entries(this._config.grupos).forEach(([chave, grupo]) => {
      const b = document.createElement("button");
      b.className = "grupo" + (chave === this._instalacao.grupo ? " is-ativo" : "");
      b.textContent = grupo.rotulo;
      b.addEventListener("click", () => this._acao(async () => {
        await this._s.plataforma.definirGrupo(this._pin, chave);
        this._s.aoMudarGrupo(chave);
      }));
      grupos.appendChild(b);
    });

    $("#conta-atual").textContent = this._instalacao.conta || this._textos.t("manutencao.nenhumaConta");
    // Com segredo de aplicativo nao ha login: a credencial entra e sai pelo adb.
    const porSegredo = this._instalacao.acesso === "segredo";
    $("#btn-entrar").hidden = porSegredo || Boolean(this._instalacao.conta);
    $("#btn-sair-conta").hidden = porSegredo || !this._instalacao.conta;
    const suspenso = Boolean(this._instalacao.quiosqueSuspenso);
    $("#btn-sair-quiosque").hidden = suspenso || !this._instalacao.quiosque || this._instalacao.quiosque.startsWith("inativo");
    $("#btn-voltar-quiosque").hidden = !suspenso;
    $("#btn-configuracoes").hidden = !suspenso;
    $("#manutencao [data-texto='manutencao.sairDoQuiosqueApoio']").textContent =
      this._textos.t(suspenso ? "manutencao.suspensoApoio" : "manutencao.sairDoQuiosqueApoio");
    this._desenharDiagnostico();
  }

  async _acao(fazer) {
    const t = (c) => this._textos.t("manutencao." + c);
    const retorno = $("#manutencao-retorno");
    retorno.textContent = t("aguarde");
    try {
      await fazer();
      retorno.textContent = t("feito");
    } catch (erro) {
      retorno.textContent = t("falhou") + " " + mensagemDe(erro);
    }
    this._instalacao = await this._s.plataforma.instalacao();
    this._desenharPainel();
  }

  _desenharDiagnostico() {
    const d = this._s.diagnostico();
    const i = this._instalacao;
    const hora = (data) => data
      ? new Date(data).toLocaleString("pt-BR", { timeZone: this._config.fuso })
      : "nunca";

    const linhas = [
      `Versao do app ........ ${i.versao || "-"}`,
      `Modo quiosque ........ ${i.quiosque || "-"}`,
      `Acesso ao CRM ........ ${i.acesso === "segredo" ? "segredo do tablet" : i.acesso === "conta" ? "conta do tablet (login)" : i.acesso || "-"}`,
      `Conta ................ ${i.conta || "nenhuma"}`,
      ...(i.segredoVenceEm ? [`Segredo vence em ..... ${descreverVencimento(i.segredoVenceEm)}`] : []),
      `Grupo ................ ${i.grupo ? this._config.grupos[i.grupo].rotulo : "nao escolhido"}`,
    ];
    if (d) {
      const conexao = d.desconectado ? "desconectado (" + d.desconectado + ")"
        : d.semRede ? "sem rede" : "ok";
      linhas.push(
        `Conexao com o CRM .... ${conexao}`,
        `Ultima consulta ...... ${hora(d.ultimaConsulta)} (${d.pendentesNaUltima} pendente(s))`,
        `Aguardando gravacao .. ${d.aguardandoGravacao}`,
        `Ultimo erro .......... ${d.ultimoErro
          ? `${hora(d.ultimoErro.quando)} ${d.ultimoErro.tipo}${d.ultimoErro.status ? " " + d.ultimoErro.status : ""}: ${d.ultimoErro.mensagem}`
          : "nenhum"}`);
      if (d.ultimoErro && d.ultimoErro.detalhe) linhas.push("  " + String(d.ultimoErro.detalhe).slice(0, 400));
      linhas.push("", "Ultimos encerramentos:");
      if (!d.historico.length) linhas.push("  nenhum");
      d.historico.forEach((h) => linhas.push(
        `  ${hora(h.quando)}  ${h.senha || "?"}  mesa ${h.mesa}  ${NOMES_DAS_SITUACOES[h.situacao] || h.situacao}`));
    }
    $("#diagnostico").textContent = linhas.join("\n");
  }

  _reiniciarInatividade() {
    clearTimeout(this._inatividade);
    this._inatividade = setTimeout(() => this.fechar(),
      this._config.segundos_sem_toque_na_manutencao * 1000);
  }
}

// O segredo do Entra vence (no maximo 24 meses) e, vencido, o tablet para.
// Mostrar quantos dias faltam e a unica forma de nao ser surpresa.
function descreverVencimento(aaaammdd) {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  const dias = Math.ceil((Date.UTC(a, m - 1, d) - Date.now()) / 86400000);
  const data = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
  if (dias < 0) return `${data} (VENCIDO ha ${-dias} dia(s))`;
  return `${data} (faltam ${dias} dia(s)${dias <= 30 ? " - TROCAR JA" : ""})`;
}

function mensagemDe(erro) {
  return (erro && (erro.mensagem || erro.message)) || String(erro);
}
