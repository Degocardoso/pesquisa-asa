# Acesso por segredo de aplicativo

Modo escolhido em outubro de 2026: os tablets entram no CRM com uma credencial
de aplicativo **própria deles** (nunca a do totem), sem login de conta.

O segredo **não vai dentro do APK**. Ele é instalado em cada tablet por um
comando `adb` e fica guardado cifrado com uma chave do próprio aparelho. Uma
cópia do APK no OneDrive, num e-mail ou num pendrive não dá acesso a nada.

O modo por conta (`docs/ENTRA.md`) continua no app. Para voltar a ele, basta
apagar a credencial (no fim deste documento).

---

## O que esse modo custa

- **O segredo vence**, no máximo em 24 meses. Vencido, os três tablets param no
  mesmo dia. A data aparece no diagnóstico da manutenção, com "TROCAR JÁ" nos
  últimos 30 dias. Ponha um lembrete na agenda no dia em que criar o segredo.
- **Quem tiver o segredo entra no CRM de qualquer lugar**, com o papel do
  usuário de aplicativo. Por isso o papel é mínimo (passo 2) e o segredo só
  existe nos tablets e no cofre da TI.

---

## Passo 1 — Segredo no registro dos tablets

No Entra, no registro **criado só para os tablets**:

1. **Certificados e segredos → Novo segredo do cliente**
   - Descrição: `tablets AAAA-MM` (mês de criação)
   - Validade: 24 meses
2. Copie a coluna **Valor**, não a "ID do segredo". Ela só aparece agora; se
   sair da página, crie outro.
3. Anote também a **data de vencimento** que o portal mostra.
4. Na página **Visão geral**, copie o **ID do aplicativo (cliente)** e o
   **ID do diretório (locatário)**.

Guarde os quatro (segredo, vencimento, ID do cliente, ID do locatário) no cofre
da TI.

Este modo não precisa de "Permissões de API" nem de consentimento do
administrador no Entra: quem dá acesso ao CRM é o usuário de aplicativo do
passo 2.

## Passo 2 — Usuário de aplicativo no CRM, com papel mínimo

**2.1 Papel de segurança.** No Power Platform (admin.powerplatform.microsoft.com):
*Ambientes → (ambiente do CRM) → Configurações → Usuários + permissões →
Funções de segurança → + Nova função*

- Nome: `Pesquisa tablets`
- Unidade de negócios: a raiz
- Na tabela **Relacionamento** (`ret_relacionamento`): **Ler = Organização** e
  **Gravar = Organização**. Nada mais, em nenhuma outra tabela.

**2.2 Usuário de aplicativo.** *Configurações → Usuários + permissões →
Usuários de aplicativo → + Novo usuário de aplicativo*

- Aplicativo: o registro dos tablets
- Unidade de negócios: a raiz
- Funções de segurança: **Pesquisa tablets** (só ela)

Se o diagnóstico do tablet mostrar um erro como *"principal user is missing
prvReadAlgumaCoisa privilege"*, o CRM está pedindo mais uma permissão de
leitura. Acrescente exatamente a que o erro nomeia, e só ela.

## Passo 3 — Instalar a credencial em cada tablet

Pré-requisitos: app instalado, PIN definido na primeira abertura, depuração USB
ligada e o tablet no cabo (`docs/QUIOSQUE.md`).

No PowerShell. O segredo é lido por `Read-Host` para **não ficar gravado no
histórico** do PowerShell:

```powershell
$segredo = Read-Host "Segredo"
adb shell "am start -n br.fecap.asa.pesquisa/.AtividadePrincipal --es tenant ID_DO_LOCATARIO --es cliente ID_DO_CLIENTE --es segredo '$segredo' --es venceEm AAAA-MM-DD --es pin SEU_PIN"
Remove-Variable segredo
```

- Troque `ID_DO_LOCATARIO`, `ID_DO_CLIENTE`, a data de vencimento e o PIN da
  manutenção. As aspas simples em volta de `$segredo` ficam.
- No tablet aparece **"Credencial instalada."**. Abra a manutenção: o
  diagnóstico deve mostrar "Acesso ao CRM: segredo do tablet", a data de
  vencimento e, em poucos segundos, "Conexão com o CRM: ok".

A partir da próxima abertura do app, **a depuração USB fica bloqueada**: com a
credencial no tablet, ninguém liga um cabo e tira coisas dele.

## Trocar o segredo antes de vencer

1. Crie um segredo novo no Entra (passo 1). Não apague o antigo ainda.
2. Em cada tablet: manutenção → **Sair do modo quiosque** → ligue a depuração
   USB nas opções do desenvolvedor → rode o comando do passo 3 com o segredo e
   a data novos → abra o app de novo.
3. Com os três tablets atualizados e "Conexão com o CRM: ok", apague o segredo
   antigo no Entra.

## Voltar ao modo por conta

Com a depuração liberada (como no passo 2 acima):

```powershell
adb shell "am start -n br.fecap.asa.pesquisa/.AtividadePrincipal --ez apagarCredencial true --es pin SEU_PIN"
```

O tablet passa a pedir login da conta (`docs/ENTRA.md`).

## Se a tela disser "Instalação incompleta"

Abra a manutenção e leia "Último erro" no diagnóstico:

| Erro | Causa |
|---|---|
| "O Entra recusou a credencial do tablet: ... expired ..." | Segredo vencido: troque (acima) |
| "O Entra recusou a credencial ... invalid client secret" | Segredo digitado errado: instale de novo |
| "Nenhuma credencial neste tablet" | Falta o passo 3 |

Se a tela disser **"Tablet desconectado"**, o Entra aceitou o segredo mas o CRM
recusou: falta o usuário de aplicativo ou o papel dele (passo 2).
