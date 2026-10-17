# Preparar um tablet

Roteiro para cada um dos três tablets, na ordem. O caminho definitivo será o
Intune (dispositivo dedicado do Android Enterprise); enquanto ele não estiver
disponível, o app vira **dono do dispositivo** pelo adb. Os dois caminhos não
convivem: para passar ao Intune depois, o tablet precisa ser restaurado de
fábrica.

---

## Por que dono do dispositivo

A fixação de tela comum do Android sai segurando Voltar + Visão geral, e
qualquer pessoa descobre isso. Como dono do dispositivo, o app trava o tablet de
verdade: sem barra de status, sem Início, sem apps recentes, sem tela de
bloqueio, e ele abre sozinho quando o tablet liga.

O preço: só dá para registrar um dono num tablet **restaurado de fábrica e sem
nenhuma conta** (nem Google). E só se desfaz restaurando de fábrica de novo.

---

## Passo 1 — Restaurar e configurar o básico

1. Restaure o tablet de fábrica.
2. Na configuração inicial: conecte ao Wi-Fi da instituição e **pule a conta
   Google**.
3. Em Configurações → Data e hora: data e hora automáticas, fuso de São Paulo.
   O prazo de 30 minutos é contado pelo relógio do tablet.
4. Em Configurações → Sobre → toque 7 vezes em "Número da versão" para liberar
   as opções do desenvolvedor. Lá, ligue a **Depuração USB**.

## Passo 2 — Instalar e registrar como dono

Com o tablet no cabo USB do computador que tem o Android Studio:

```
adb install pesquisa-asa.apk
adb shell dpm set-device-owner br.fecap.asa.pesquisa/.Administrador
```

O segundo comando deve responder `Success: Device owner set`. Se reclamar de
contas, há alguma conta no tablet (passo 1.2).

## Passo 3 — Primeira abertura

Abra o app. Na primeira vez a manutenção abre sozinha:

1. Defina o PIN da manutenção (de 4 a 8 números, digitado duas vezes).
2. Escolha a mesa: tablet 1 → **Mesa 1**, tablet 2 → **Mesa 2**, tablet 3 →
   **Mesas 3 e 4**.
3. Feche a manutenção.
4. Com o tablet ainda no cabo, instale a credencial: passo 3 do
   `docs/SEGREDO.md`. (No modo por conta, em vez disso, toque em **Entrar** na
   manutenção com a conta do tablet.)

Confira no diagnóstico da manutenção: "Modo quiosque: ativo (dono do
dispositivo)", "Acesso ao CRM: segredo do tablet" e "Conexão com o CRM: ok".

## Passo 4 — Depuração USB

Não precisa desligar à mão: com PIN, mesa e credencial instalados, o próprio
app bloqueia a depuração USB na próxima abertura. Para atualizar depois, a
manutenção libera (veja abaixo).

---

## Abrir a manutenção

Na tela de descanso, **segure o logo do ASA por 3 segundos** e digite o PIN.
Ela não abre no meio de uma pesquisa, e fecha sozinha depois de 2 minutos sem
toque — enquanto está aberta o tablet não mostra pesquisa.

## Atualizar o app

1. Manutenção → **Sair do modo quiosque**. O Android e a depuração USB ficam
   livres até você voltar ao app. Ligue a depuração nas opções do
   desenvolvedor (o bloqueio a terá desligado).
2. Rode `adb install -r pesquisa-asa.apk`. Tem que ser assinado com a mesma
   chave (`docs/ENTRA.md`, passo 1).
3. Abra o app de novo: o quiosque e o bloqueio da depuração voltam sozinhos.
   Mesa, PIN e credencial continuam lá: atualizar o app não apaga os dados dele.

## Trocar a conta ou a mesa

Pela manutenção. Não precisa reinstalar nada.

## Se a tela disser...

| Mensagem | O que fazer |
|---|---|
| Sem conexão | Nada: volta sozinho quando o Wi-Fi voltar. Se persistir, ver o Wi-Fi. |
| Tablet desconectado | O CRM recusou o acesso: ver o usuário de aplicativo e o papel (`docs/SEGREDO.md`, passo 2). No modo por conta: Sair da conta → Entrar de novo. |
| Instalação incompleta | Credencial ausente, errada ou vencida: ver "Último erro" no diagnóstico e `docs/SEGREDO.md`. |
| Tablet sem mesa | Manutenção → escolher a mesa. |
