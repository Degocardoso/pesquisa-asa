/*
 * Painel flutuante do simulador: chama senhas, derruba a rede, expira o login
 * e mostra o que foi gravado. So existe no navegador do computador; o APK
 * nunca carrega este arquivo.
 */

import { Opcao } from "../modelo/entidades.js";

const nome = (mapa, codigo) =>
  (Object.entries(mapa).find(([, v]) => v === codigo) || [String(codigo)])[0].toLowerCase().replace(/_/g, " ");

const ESTILO = `
#simulador { position: fixed; right: 12px; bottom: 12px; z-index: 99; width: 380px;
  font: 13px/1.4 system-ui, sans-serif; color: #023327; background: #fff;
  border: 2px solid #023327; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
  user-select: text; -webkit-user-select: text; }
#simulador header { display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: #023327; color: #fff; border-radius: 9px 9px 0 0; cursor: pointer; }
#simulador .corpo { padding: 10px 12px; max-height: 70vh; overflow: auto; }
#simulador .botoes { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
#simulador button { padding: 6px 10px; border: 1.5px solid #023327; border-radius: 8px;
  background: #f5f5f5; font: inherit; cursor: pointer; }
#simulador button:hover { background: #00e387; }
#simulador select { font: inherit; padding: 4px; }
#simulador table { width: 100%; border-collapse: collapse; margin-top: 6px; }
#simulador td, #simulador th { text-align: left; padding: 3px 4px; border-bottom: 1px solid #e2e5e4; }
#simulador .fraco { color: #5d6f6a; }
`;

export function montarPainel({ crm, config, minutosParaVencer }) {
  const estilo = document.createElement("style");
  estilo.textContent = ESTILO;
  document.head.appendChild(estilo);

  const painel = document.createElement("div");
  painel.id = "simulador";
  painel.innerHTML = `
    <header><b>Simulador</b><span class="fraco" style="color:#9fe">recolher</span></header>
    <div class="corpo">
      <div class="botoes">
        <button data-mesa="1">Chamar Mesa 1</button>
        <button data-mesa="2">Chamar Mesa 2</button>
        <button data-mesa="3">Chamar Mesa 3</button>
        <button data-mesa="4">Chamar Mesa 4</button>
      </div>
      <div class="botoes">
        <button data-vencida="1">Chamar vencida (Mesa 1)</button>
        <button data-vencida="3">Chamar vencida (Mesa 3)</button>
      </div>
      <label>Falha do CRM:
        <select id="sim-falha">
          <option value="">nenhuma</option>
          <option value="rede">sem rede</option>
          <option value="autenticacao">login expirado</option>
          <option value="transitorio">CRM indisponivel (503)</option>
          <option value="definitivo">pedido recusado (400)</option>
        </select>
      </label>
      <p class="fraco" style="margin-top:6px">Segure o logo do descanso por ${config.segundos_pressionando_o_logo} s para a manutencao.</p>
      <table>
        <thead><tr><th>Senha</th><th>Situacao</th><th>P1</th><th>P2</th><th>P3</th></tr></thead>
        <tbody id="sim-gravacoes"></tbody>
      </table>
    </div>`;
  document.body.appendChild(painel);

  const corpo = painel.querySelector(".corpo");
  painel.querySelector("header").addEventListener("click", () => { corpo.hidden = !corpo.hidden; });

  painel.querySelectorAll("[data-mesa]").forEach((b) => b.addEventListener("click", () => {
    crm.chamarSenha({ mesa: Number(b.dataset.mesa), chamadoEm: new Date() });
  }));
  painel.querySelectorAll("[data-vencida]").forEach((b) => b.addEventListener("click", () => {
    crm.chamarSenha({
      mesa: Number(b.dataset.vencida),
      chamadoEm: new Date(Date.now() - (minutosParaVencer + 1) * 60000),
    });
  }));
  painel.querySelector("#sim-falha").addEventListener("change", (e) => {
    crm.falha = e.target.value || null;
  });

  const corpoDaTabela = painel.querySelector("#sim-gravacoes");
  setInterval(() => {
    corpoDaTabela.innerHTML = crm.gravacoes.slice(-10).reverse().map((g) => `
      <tr>
        <td>${g.senha}</td>
        <td>${nome(Opcao.SITUACAO_DA_PESQUISA, g.situacao)}</td>
        <td>${g.notaAtendimento}</td>
        <td>${g.notaDominio}</td>
        <td>${nome(Opcao.NECESSIDADE, g.necessidade)}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="fraco">nada gravado ainda</td></tr>`;
  }, 500);
}
