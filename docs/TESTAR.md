# Testar no Android Studio

Três níveis, do mais barato ao mais real. Cada um só vale a pena depois que o
anterior passou.

| Nível | Precisa de | Testa |
|---|---|---|
| 1. Emulador sem login | só o Android Studio | build, telas, PIN, manutenção, quiosque |
| 2. Emulador com login | registro no Entra (`docs/ENTRA.md`) | login, consulta e gravação no CRM |
| 3. Tablet de verdade | nível 2 + o tablet no cabo | tudo, no aparelho final |

---

## Nível 1 — Emulador sem login

### Abrir o projeto

1. Instale o Android Studio (versão atual) e abra-o uma vez para ele baixar o
   SDK.
2. Clone o repositório e abra **a pasta `android/`** (não a raiz) em
   *File → Open*.
3. Espere o *Gradle sync* terminar. Na primeira vez ele baixa o Gradle, o
   plugin do Android, o MSAL e as outras bibliotecas: precisa de internet e
   leva alguns minutos.

Se o sync ou o build falhar, copie a mensagem de erro inteira (aba *Build*,
embaixo) e mande. A casca nunca foi compilada antes; erro aqui é esperado e
costuma ser pequeno.

Se a rede da FECAP tiver proxy: *Settings → Appearance & Behavior → System
Settings → HTTP Proxy*.

### Criar o emulador

*Device Manager → + → Create Virtual Device*:

- Categoria **Tablet** → **Pixel Tablet**
- Imagem do sistema: **API 35 (Android 15)**, variante **Google APIs**. Não use
  a variante "Google Play": ela vem com conta Google e não deixa testar o
  quiosque.

### Rodar

Escolha o emulador no topo e clique em **Run ▶**. O que deve acontecer:

1. A manutenção abre sozinha: defina um PIN (duas vezes).
2. Escolha uma mesa.
3. **Entrar** vai falhar com "Login não configurado". É esperado: o
   `msal_config.json` ainda está com PREENCHER.
4. Feche. A tela de descanso mostra "Instalação incompleta".

Se chegou até aqui, a casca, a ponte com o JavaScript e o PIN funcionam.

### Ver o console do JavaScript

Com o app rodando num build de debug, abra `chrome://inspect` no Chrome do
computador. O WebView do app aparece na lista; **inspect** abre o DevTools com
console, rede e elementos, como numa página comum.

### Testar o quiosque

Com o app já instalado no emulador, no terminal do Android Studio:

```
adb shell dpm set-device-owner br.fecap.asa.pesquisa/.Administrador
```

Feche e abra o app. A barra de status some, Início e Recentes param de
funcionar, e o diagnóstico da manutenção mostra "Modo quiosque: ativo (dono do
dispositivo)". Teste também **Sair do modo quiosque** pela manutenção.

Para desfazer no emulador: *Device Manager → ⋮ → Wipe Data*.

---

## Nível 2 — Emulador com login

1. Faça o `docs/ENTRA.md` inteiro: chave, `assinatura.properties`, registro e
   `msal_config.json`.
2. Rode de novo. Na manutenção, **Entrar** com a conta de um tablet.
3. O diagnóstico deve mostrar "Conexão com o CRM: ok" e uma "Última consulta"
   que se atualiza a cada 5 segundos.

**Cuidado: a partir daqui é o CRM de produção.** Com uma mesa escolhida, o
emulador pega as pesquisas pendentes de hoje daquela mesa e grava nelas, igual
ao tablet de verdade. E se o app antigo daquela mesa estiver ligado, os dois
gravam no mesmo registro.

Por isso, faça o primeiro teste **fora do expediente**:

1. Gere uma senha no totem e chame-a pelo painel na mesa escolhida.
2. Em até 5 segundos a pesquisa aparece no emulador.
3. Responda e confira no CRM, no registro da senha: as duas notas, a
   necessidade, a situação e a data de realização (que deve mostrar a hora
   certa, não 3 horas antes).
4. Repita para "Prefiro não responder" e para uma senha chamada há mais de 30
   minutos (deve gravar "Cancelada por tempo" sem aparecer).

---

## Nível 3 — Tablet de verdade

1. No tablet: *Configurações → Sobre → toque 7 vezes em "Número da versão"*,
   depois ligue a **Depuração USB** nas opções do desenvolvedor.
2. Ligue no cabo, aceite a autorização no tablet e escolha o tablet no topo do
   Android Studio. **Run ▶**.
3. Para o quiosque, siga o `docs/QUIOSQUE.md`: ele exige o tablet restaurado de
   fábrica e sem conta Google.

---

## Sem Android Studio

A interface e as regras rodam no navegador, com CRM falso:

```
python -m http.server 8000 --directory web
```

Abra `http://localhost:8000`. E `npm test` roda os testes automáticos (precisa
do Node 18 ou mais novo).
