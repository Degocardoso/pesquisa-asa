/*
 * Ponto de entrada. Liga plataforma, CRM, ciclo, telas e manutencao.
 *
 * Dentro do APK existe window.PonteAndroid. No navegador do computador ela nao
 * existe, e a pagina sobe com a plataforma simulada e o painel do simulador.
 */

import { Ciclo } from "./controlador/ciclo.js";
import { PlataformaAndroid } from "./plataforma.js";
import { Visao, Textos, ajustarPalco } from "./visao/telas.js";
import { Manutencao } from "./visao/manutencao.js";

const RELOGIO = {
  agora: () => new Date(),
  agendar: (fn, ms) => setTimeout(fn, ms),
  cancelar: (marca) => clearTimeout(marca),
};

async function lerJson(caminho) {
  const resposta = await fetch(caminho, { cache: "no-store" });
  if (!resposta.ok) throw new Error("Nao foi possivel ler " + caminho);
  return resposta.json();
}

async function iniciar() {
  ajustarPalco();
  window.addEventListener("resize", ajustarPalco);

  const [config, dicionario] = await Promise.all([
    lerJson("configuracao.json"),
    lerJson("visao/idiomas.json"),
  ]);

  let plataforma;
  if (window.PonteAndroid) {
    plataforma = new PlataformaAndroid(window.PonteAndroid);
  } else {
    const { PlataformaSimulada } = await import("./simulador/plataforma-simulada.js");
    plataforma = new PlataformaSimulada();
  }
  const crm = plataforma.criarCrm(config);

  const textos = new Textos(dicionario, config.idioma_padrao);
  textos.aplicar();

  let ciclo = null;

  const visao = new Visao({
    textos,
    config,
    acoes: {
      marcar: (pergunta, valor) => ciclo && ciclo.marcar(pergunta, valor),
      enviar: () => ciclo && ciclo.enviar(),
      recusar: () => ciclo && ciclo.recusar(),
      pedirManutencao: () => abrirManutencao(),
    },
  });

  // O mesmo ciclo dura a vida da pagina. Trocar por um novo ao fechar a
  // manutencao jogaria fora a fila de gravacoes ainda nao confirmadas.
  function montarCiclo(grupo) {
    const definicao = grupo && config.grupos[grupo];
    if (!definicao) {
      if (ciclo) ciclo.parar();
      visao.semMesa(true);
      return;
    }
    visao.semMesa(false);
    if (ciclo) {
      ciclo.parar();
      ciclo.mesas = definicao.mesas;
    } else {
      ciclo = new Ciclo({ crm, visao, relogio: RELOGIO, config, mesas: definicao.mesas });
    }
    ciclo.iniciar();
  }

  const manutencao = new Manutencao({
    textos,
    config,
    servicos: {
      plataforma,
      diagnostico: () => (ciclo ? ciclo.diagnostico() : null),
      aoMudarGrupo: () => { /* aplicado ao fechar, para nao consultar com a manutencao aberta */ },
      aoFechar: async () => {
        const instalacao = await plataforma.instalacao();
        montarCiclo(instalacao.grupo);
      },
    },
  });

  async function abrirManutencao() {
    if (manutencao.aberta) return;
    // A manutencao so abre do descanso, e o ciclo para enquanto ela esta na
    // tela: nenhuma pesquisa aparece por baixo dela.
    if (ciclo && ciclo.tela !== "descanso") return;
    if (ciclo) ciclo.parar();
    await manutencao.abrir();
  }

  // A rede voltou, ou uma credencial nova foi instalada: nao esperar o
  // proximo intervalo.
  plataforma.aoEvento("rede", (estado) => { if (estado && estado.online && ciclo) ciclo.consultarAgora(); });
  plataforma.aoEvento("credencial", () => { if (ciclo) ciclo.consultarAgora(); });

  const instalacao = await plataforma.instalacao();
  if (!window.PonteAndroid) {
    const { montarPainel } = await import("./simulador/painel.js");
    montarPainel({ crm, config, minutosParaVencer: config.minutos_para_vencer });
  }

  // Primeira vez: sem PIN nao ha como proteger nada, entao a manutencao abre
  // sozinha para definir PIN, mesa e conta.
  if (!instalacao.temPin) {
    visao.semMesa(true);
    await manutencao.abrir();
    return;
  }
  montarCiclo(instalacao.grupo);
}

iniciar().catch((erro) => {
  document.body.innerHTML = `<pre style="padding:24px;font:16px monospace;color:#b3261e">${String(erro && erro.stack || erro)}</pre>`;
});
