/*
 * Visao das telas publicas: descanso, pesquisa e agradecimento.
 *
 * Implementa o que o Ciclo espera (descanso, pesquisa, respostas, alerta,
 * agradecimento, conexao) e devolve os toques por callbacks. Nao decide nada:
 * quem sabe se uma resposta vale ou quando trocar de tela e o controlador.
 */

const $  = (s, raiz) => (raiz || document).querySelector(s);
const $$ = (s, raiz) => Array.from((raiz || document).querySelectorAll(s));

/* O palco tem 1600x1000 fixos e e escalado para o tablet. Assim as medidas do
   layout entram sem conversao e a tela fica igual em qualquer 16:10. */
export function ajustarPalco() {
  const palco = $("#palco");
  const escala = Math.min(window.innerWidth / 1600, window.innerHeight / 1000);
  palco.style.transform = `scale(${escala})`;
  palco.style.left = (window.innerWidth - 1600 * escala) / 2 + "px";
  palco.style.top = (window.innerHeight - 1000 * escala) / 2 + "px";
}

export class Textos {
  constructor(dicionario, idiomaPadrao) {
    this._d = dicionario;
    this.padrao = idiomaPadrao;
    this.idioma = idiomaPadrao;
  }

  // O que faltar no idioma escolhido cai no padrao: a manutencao so existe em pt.
  t(caminho) {
    return this._buscar(this.idioma, caminho) ?? this._buscar(this.padrao, caminho) ?? "";
  }

  _buscar(idioma, caminho) {
    let no = this._d[idioma];
    for (const parte of caminho.split(".")) {
      if (no === undefined || no === null) return undefined;
      no = no[parte];
    }
    return no;
  }

  aplicar(raiz = document) {
    $$("[data-texto]", raiz).forEach((el) => { el.textContent = this.t(el.dataset.texto); });
    $$("[data-html]", raiz).forEach((el) => { el.innerHTML = this.t(el.dataset.html); });
  }
}

export class Visao {
  /*
   * acoes: { marcar(pergunta, valor), enviar(), recusar(), pedirManutencao() }
   */
  constructor({ textos, config, acoes }) {
    this._textos = textos;
    this._config = config;
    this._acoes = acoes;
    this._conexao = { semRede: false, desconectado: null };
    this._semMesa = false;
    this._faltando = [];
    this._relogioDoAlerta = null;

    this._ligarPesquisa();
    this._ligarLogo();
  }

  // -- interface do Ciclo -------------------------------------------------

  descanso() {
    this._mostrar("tela-descanso");
    this._desenharAviso();
  }

  pesquisa(_pesquisa, respostas) {
    // Cada pesquisa comeca no idioma padrao: a pessoa anterior pode ter
    // trocado para ingles.
    this._faltando = [];
    this._trocarIdioma(this._config.idioma_padrao);
    this.alerta(null);
    this.respostas(respostas);
    this._mostrar("tela-pesquisa");
  }

  respostas(respostas) {
    let algum = false;
    $$("#tela-pesquisa .cartao").forEach((cartao) => {
      const valor = respostas[cartao.dataset.pergunta];
      if (valor !== null) algum = true;
      // A cor vem do CSS, pela nota escolhida.
      cartao.classList.toggle("tem-escolha", valor !== null);
      if (valor !== null) cartao.dataset.escolha = String(valor);
      else delete cartao.dataset.escolha;
      $$(".opcao", cartao).forEach((botao) => {
        botao.classList.toggle("is-marcada", valor !== null && String(valor) === botao.dataset.valor);
        botao.classList.toggle("is-preenchida", botao.classList.contains("estrela")
          && valor !== null && Number(botao.dataset.valor) <= Number(valor));
      });
    });
    // Como no layout: o botao de enviar so aparece depois da primeira marcacao.
    $("#btn-enviar").hidden = !algum;

    // O aviso de "faltou responder" acompanha as marcacoes: some quando a
    // pessoa responde o que faltava, sem precisar tocar em Enviar de novo.
    this._faltando = this._faltando.filter((p) => respostas[p] === null);
    this._desenharFaltam();
  }

  faltam(perguntas) {
    this._faltando = [...perguntas];
    this._desenharFaltam();
  }

  alerta(ate) {
    clearInterval(this._relogioDoAlerta);
    this._relogioDoAlerta = null;
    const faixa = $("#faixa-alerta");
    if (!ate) { faixa.hidden = true; return; }

    const desenhar = () => {
      const segundos = Math.max(0, Math.ceil((ate.getTime() - Date.now()) / 1000));
      $("#contagem-alerta").textContent = " " + segundos;
    };
    desenhar();
    faixa.hidden = false;
    this._relogioDoAlerta = setInterval(desenhar, 250);
  }

  agradecimento(tipo) {
    this.alerta(null);
    $("#texto-agradecimento").textContent = this._textos.t("agradecimento." + tipo);
    this._mostrar("tela-agradecimento");
  }

  conexao(estado) {
    this._conexao = estado;
    this._desenharAviso();
  }

  // -- fora do Ciclo ------------------------------------------------------

  semMesa(ativo) {
    this._semMesa = ativo;
    if (ativo) this.descanso();
    this._desenharAviso();
  }

  // -- detalhes -----------------------------------------------------------

  _mostrar(id) {
    ["tela-descanso", "tela-pesquisa", "tela-agradecimento"].forEach((tela) => {
      $("#" + tela).hidden = tela !== id;
    });
  }

  // Os avisos sao para a equipe e ficam no idioma padrao.
  _desenharAviso() {
    let chave = null;
    if (this._semMesa) chave = "semMesa";
    else if (this._conexao.desconectado) chave = this._conexao.desconectado;
    else if (this._conexao.semRede) chave = "semRede";

    const tela = $("#tela-descanso");
    tela.classList.toggle("com-aviso", chave !== null);
    $("#aviso").hidden = chave === null;
    if (chave) {
      const idioma = this._textos.idioma;
      this._textos.idioma = this._textos.padrao;
      $("#aviso-titulo").textContent = this._textos.t(`aviso.${chave}Titulo`);
      $("#aviso-texto").textContent = this._textos.t(`aviso.${chave}Texto`);
      this._textos.idioma = idioma;
    }
  }

  _desenharFaltam() {
    const cartoes = $$("#tela-pesquisa .cartao");
    cartoes.forEach((c) => c.classList.toggle("falta", this._faltando.includes(c.dataset.pergunta)));

    const aviso = $("#aviso-faltam");
    if (!this._faltando.length) { aviso.hidden = true; return; }

    // Numero da pergunta pela ordem na tela, o mesmo que a pessoa le no titulo.
    const ordem = cartoes.map((c) => c.dataset.pergunta);
    const numeros = this._faltando.map((p) => ordem.indexOf(p) + 1).sort();
    const lista = numeros.length === 1
      ? String(numeros[0])
      : numeros.slice(0, -1).join(", ") + " " + this._textos.t("pesquisa.e") + " " + numeros[numeros.length - 1];
    const chave = numeros.length === 1 ? "pesquisa.faltaUma" : "pesquisa.faltamVarias";
    aviso.textContent = this._textos.t(chave).replace("{perguntas}", lista);
    aviso.hidden = false;
  }

  _trocarIdioma(idioma) {
    this._textos.idioma = idioma;
    this._textos.aplicar($("#tela-pesquisa"));
    this._textos.aplicar($("#tela-agradecimento"));
    this._desenharFaltam();
    $$(".idioma").forEach((b) => b.classList.toggle("is-ativo", b.dataset.idioma === idioma));
    document.documentElement.lang = idioma === "pt" ? "pt-BR" : idioma;
  }

  _ligarPesquisa() {
    $$("#tela-pesquisa .cartao").forEach((cartao) => {
      const pergunta = cartao.dataset.pergunta;
      $$(".opcao", cartao).forEach((botao) => {
        botao.addEventListener("click", () => {
          const bruto = botao.dataset.valor;
          const valor = pergunta === "necessidade" ? bruto : Number(bruto);
          this._acoes.marcar(pergunta, valor);
        });
      });
    });
    $("#btn-enviar").addEventListener("click", () => this._acoes.enviar());
    $("#btn-recusar").addEventListener("click", () => this._acoes.recusar());
    $$(".idioma").forEach((b) => b.addEventListener("click", () => this._trocarIdioma(b.dataset.idioma)));
  }

  /* Segurar o logo do descanso abre a manutencao. So no descanso: no meio de
     uma pesquisa o cliente nao deve cair numa tela de PIN. */
  _ligarLogo() {
    const logo = $("#logo-descanso");
    let espera = null;
    const cancelar = () => { clearTimeout(espera); espera = null; };
    logo.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      cancelar();
      espera = setTimeout(() => { espera = null; this._acoes.pedirManutencao(); },
        this._config.segundos_pressionando_o_logo * 1000);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => logo.addEventListener(ev, cancelar));
    logo.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}
