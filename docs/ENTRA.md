# Registro no Entra e chave de assinatura

Feito uma vez só, antes do primeiro APK. São três peças que precisam bater
entre si: a **chave** que assina o APK, o **hash** dessa chave e o **registro**
no Entra. Se a chave mudar, o login para de funcionar até o registro ser
refeito.

---

## Por que aplicativo móvel e não SPA

Token de atualização de SPA vive 24 horas fixas e não é configurável: alguém
teria que refazer o login nos três tablets todo dia. Registrado como aplicativo
móvel (cliente público), o token dura 90 dias e renova a cada uso, então um
tablet em uso diário não pede login de novo.

**Nunca acrescente as plataformas "Single-page application" ou "Web" a este
registro.**

---

## Passo 1 — Chave de assinatura

No computador onde o Android Studio está instalado, no PowerShell, dentro da
pasta `android/`. O `keytool` vem com o Android Studio mas não fica no PATH,
por isso o caminho completo:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore pesquisa-asa.jks -alias pesquisa -keyalg RSA -keysize 2048 -validity 10000
```

Se o Android Studio estiver instalado em outra pasta, o mesmo resultado sai pela
interface: *Build → Generate Signed App Bundle or APK → APK → Create new*, com o
arquivo em `android/pesquisa-asa.jks` e o apelido `pesquisa`.

Guarde o arquivo `pesquisa-asa.jks` e as senhas num cofre da TI. **Perder a
chave significa** não conseguir atualizar os APKs já instalados (o Android
recusa uma atualização assinada por outra chave) e ter que refazer o registro.

Crie `android/assinatura.properties` (ele está no `.gitignore` e nunca vai para
o repositório):

```
arquivo=pesquisa-asa.jks
senhaDoArquivo=...
apelido=pesquisa
senhaDaChave=...
hashDaAssinatura=PREENCHER_NO_PASSO_2
```

## Passo 2 — Hash da assinatura

```
keytool -exportcert -alias pesquisa -keystore pesquisa-asa.jks | openssl sha1 -binary | openssl base64
```

Sai algo como `ga0RGNYHvNM5d0SLGQfpQWAPGJ8=`. Cole em `hashDaAssinatura` no
`assinatura.properties` **exatamente assim, sem codificar**.

No Windows sem openssl, pegue o SHA-1 com
`& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore pesquisa-asa.jks -alias pesquisa`
(linha `SHA1:`) e
converta com Python:

```
python -c "import base64,sys; print(base64.b64encode(bytes.fromhex(sys.argv[1].replace(':',''))).decode())" AB:CD:...
```

O SHA-1 não é segredo (é a impressão digital pública da chave); o hash é ele
mesmo, só que em base64.

## Passo 3 — Registro do aplicativo

No portal do Entra (entra.microsoft.com):

1. **Aplicativos → Registros de aplicativo → Novo registro**
   - Nome: `Pesquisa ASA - tablets`
   - Tipos de conta: *somente este diretório organizacional*
   - URI de redirecionamento: deixe em branco por enquanto
2. Na página do registro, copie **ID do aplicativo (cliente)** e **ID do
   diretório (locatário)**.
3. **Permissões de API → Adicionar → Dynamics CRM → Permissões delegadas →
   `user_impersonation`**. Depois, **Conceder consentimento do administrador**.
4. **Autenticação → Adicionar plataforma → Android**
   - Nome do pacote: `br.fecap.asa.pesquisa`
   - Hash da assinatura: o do passo 2
   - O portal mostra o URI de redirecionamento, no formato
     `msauth://br.fecap.asa.pesquisa/<hash codificado>`. Copie.

## Passo 4 — msal_config.json

Edite `android/app/src/main/res/raw/msal_config.json`:

| Campo | Valor |
|---|---|
| `client_id` | ID do aplicativo (passo 3.2) |
| `tenant_id` | ID do diretório (passo 3.2) |
| `redirect_uri` | o URI do passo 3.4, **com** o hash codificado (`%2B`, `%2F`, `%3D`) |

O `AndroidManifest.xml` usa o mesmo hash **sem** codificar, que vem do
`assinatura.properties`. São a mesma informação em duas grafias; a diferença é
proposital.

`authorization_user_agent` fica em `WEBVIEW`: o login abre dentro do próprio
app. Com o quiosque ativo o Android bloqueia abrir o navegador, e o login pelo
navegador ficaria preso.

## Passo 5 — Contas dos tablets

`tablet01`, `tablet02` e `tablet03` precisam ser usuários do Dataverse com
licença e um papel de segurança que permita **ler e gravar** em
`ret_relacionamento`. Confirmado em outubro de 2026 que já têm.

Se algum dia entrar Acesso Condicional com "frequência de entrada" para essas
contas, ele derruba os 90 dias. Peça à TI para deixar essas três contas fora
dessa política.
