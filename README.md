# Pesquisa de satisfação — ASA FECAP

Substitui os três apps de canvas do Power Apps (CSAT Mesa 01, 02 e 03/04) que
mostravam a pesquisa do atendimento presencial nos tablets. É um APK Android só,
instalado nos três tablets, que fala direto com o Dataverse — sem Power Automate.

É o terceiro do conjunto: o totem gera a senha, o painel chama, e o tablet da
mesa pergunta como foi.

---

## Começando

```
npm test                                  roda as regras sem tablet e sem CRM
python -m http.server 8000 --directory web    sobe o simulador
```

Com o simulador no ar, abra `http://localhost:8000` no Chrome. Sem a casca
Android a página sobe com um CRM em memória e um painel para chamar senhas,
derrubar a rede e expirar o login. É onde se mexe na interface e nas regras.

Para gerar o APK, siga, nesta ordem:

0. `docs/TESTAR.md` — como testar no Android Studio, do emulador ao tablet
1. `docs/SEGREDO.md` — segredo do aplicativo e usuário no CRM (uma vez só);
   a chave de assinatura do APK está no passo 1 do `docs/ENTRA.md`
2. Abrir a pasta `android/` no Android Studio e gerar o APK assinado
3. `docs/QUIOSQUE.md` — preparar cada tablet

---

## Onde mexer

| Quero mudar | Arquivo |
|---|---|
| Tempos (consulta, 30 min, alerta, agradecimento) | `web/configuracao.json` |
| Quais mesas cada tablet pode atender | `web/configuracao.json` → `grupos` |
| Textos das telas, em PT e EN | `web/visao/idiomas.json` |
| Nome de coluna ou código de opção do CRM | `web/modelo/entidades.js` |
| Regras de encerramento | `web/modelo/pesquisa.js` |
| Endereço do Dataverse | `android/app/src/main/res/values/configuracao.xml` |
| Credencial de acesso (segredo) | instalada em cada tablet pelo adb (`docs/SEGREDO.md`) |
| IDs do Entra, só no modo por conta | `android/app/src/main/res/raw/msal_config.json` |
| Qual mesa este tablet atende, PIN | tela de manutenção do próprio tablet |

Nenhum nome lógico de coluna aparece fora do `entidades.js`. Se alguém renomear
um campo no CRM, é o único arquivo a tocar.

---

## Como funciona

```
 descanso ──(chegou pesquisa)──> pesquisa ──(enviar / prefiro não responder)──> agradecimento (10 s)
    ^                               │                                                │
    │                               ├── 30 min desde a chamada ──> grava "tempo"     │
    │                               └── chegou outra pesquisa                        │
    │                                     ├── nada marcado: troca na hora            │
    │                                     └── algo marcado: alerta de 30 s e troca   │
    └────────────────────────────────────────────────────────────────────────────────┘
```

A cada 5 segundos o tablet pergunta ao CRM só pelas senhas **da sua mesa, de
hoje, com pesquisa iniciada e ainda sem data de realização**, no máximo 5,
mais recente primeiro. Não existe contagem: o filtro já devolve exatamente as
pendentes.

As cinco formas de terminar **todas gravam no CRM**:

| Situação | Quando | P1 e P2 | P3 |
|---|---|---|---|
| Respondida | enviou as três | marcadas | marcada |
| Respondida parcialmente | enviou pulando alguma | marcada ou `0` | marcada ou "Não respondida" |
| Cancelada pelo cliente | "Prefiro não responder" | o que marcou ou `0` | o que marcou ou "Não respondida" |
| Cancelada por tempo | 30 min desde a chamada, ou nunca chegou a aparecer | o que marcou ou `0` | o que marcou ou "Não respondida" |
| Cancelada por nova senha | estava na tela e chegou a seguinte | o que marcou ou `0` | o que marcou ou "Não respondida" |

Toda gravação preenche também `fecap_datarealizacaopesquisa`, em UTC.

**"Nova senha" é só para quem tinha a pesquisa na frente.** Uma pendente que
nunca apareceu (chegou vencida, ou foi superada por outra antes de aparecer)
sai como "Cancelada por tempo".

---

## Estrutura

```
web/                        a aplicação (roda no WebView e no navegador)
  modelo/
    entidades.js            ÚNICO lugar com colunas e códigos do CRM
    pesquisa.js             regras puras: encerramento, prazo, triagem
    dataverse.js            consulta filtrada e corpo da gravação
  controlador/
    ciclo.js                consulta periódica, cronômetros, fila de gravação
  visao/
    telas.js                descanso, pesquisa, agradecimento
    manutencao.js           PIN, mesa, conta, diagnóstico
    idiomas.json  tablet.css  assets/
  plataforma.js             ponte com a casca Android
  simulador/                CRM falso e painel (fica fora do APK)
  configuracao.json  index.html  principal.js
testes/                     node --test, sem dependências
android/                    a casca: WebView, MSAL, quiosque, PIN
docs/                       Entra, quiosque
```

A casca Android não tem regra de negócio. Ela faz o que o navegador não
consegue: o token de acesso, a chamada HTTP ao Dataverse (o token nunca passa
pelo JavaScript), quiosque, tela acesa, e guarda mesa, PIN e credencial.

O acesso ao CRM é por **segredo de aplicativo próprio dos tablets**, instalado
em cada aparelho pelo adb e nunca dentro do APK (`docs/SEGREDO.md`). O login
com a conta do tablet (MSAL) continua disponível como alternativa
(`docs/ENTRA.md`).

Antes de mexer, leia `CONTINUIDADE.md`.
