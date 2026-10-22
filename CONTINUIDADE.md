# Pesquisa nos tablets — estado do projeto

Documento de continuidade. Quem pegar o projeto daqui em diante deve ler isto
antes do código. O `README.md` explica como o sistema funciona; este arquivo
explica **onde paramos, o que já foi decidido e o que ainda dói**.

Última atualização: outubro de 2026.

---

## Situação

**Pronto e testado no simulador:** regras das cinco formas de encerramento,
prazo de 30 minutos, troca por nova senha com alerta, fila de gravação em
memória, telas em PT e EN, manutenção com PIN. São 37 testes automáticos
(`npm test`), e o fluxo inteiro foi percorrido num Chromium sem erro no console.

**Testado contra o CRM real em 17/10/2026**, no emulador (Pixel Tablet,
Android 15), com acesso por segredo: a consulta trouxe a pesquisa pendente da
Mesa 1, a tela apareceu e a resposta foi gravada e conferida no CRM pela Web
API. A casca Android compilou sem ajustes.

**Primeiro tablet de verdade em quiosque completo (dono do dispositivo)** em
outubro de 2026, sem formatar: bastou remover as contas antes do
`dpm set-device-owner`. A configuração de Wi-Fi da FECAP foi mantida.

**Ainda não testado no CRM real:** respondida parcialmente, cancelada pelo
cliente, por tempo e por nova senha (com o alerta de 30 s), queda de Wi-Fi, . Todos estão
cobertos pelos testes automáticos e pelo simulador.

**O modo por conta (MSAL)** chegou até o login da Microsoft, mas nunca até o
CRM: falta o consentimento do administrador no registro dos tablets.

---

## Decisões que não devem ser revertidas sem conversa

**A data de fim é `fecap_datarealizacaopesquisa`, não `fecap_datadepesquisa`.**
O prompt original dizia o contrário. Os metadados do pacote do app antigo
mostram que `fecap_datadepesquisa` é "Data e hora que a pesquisa foi iniciada",
e o fluxo "Manda resposta NPS" grava o fim em `fecap_datarealizacaopesquisa`.
Filtrar pela outra coluna devolveria nada.

**Só senhas criadas hoje.** O app antigo nunca voltava "Iniciar Pesquisa?" para
Não nem preenchia a data de realização de quem não respondeu. Sem o corte por
`createdon`, o primeiro dia do app novo gravaria meses de histórico como
"Cancelada por tempo" com a data de hoje.

**`fecap_senhanopresencial ne null` está no filtro** porque a hora da chamada só
é garantida para senha do totem (um fluxo do sistema a preenche).

**As mesas vão entre parênteses no filtro.** O fluxo antigo da Mesa 3 e 4 tinha
`... and mesa eq 4 or mesa eq 3`, que o OData lê como
`(... and mesa eq 4) or (mesa eq 3)`. Há teste para isso.

**A data é gravada em UTC.** A coluna é "Local do usuário". O fluxo antigo
subtraía 3 horas antes de gravar, então **todo o histórico de
`fecap_datarealizacaopesquisa` aparece no CRM 3 horas mais cedo** do que
aconteceu. A partir do app novo aparece certo. Relatório que compare hora antes
e depois da troca vai ver o salto. O histórico não foi corrigido.

**"Nova senha" só para quem tinha a pesquisa na tela.** Pendente que nunca
apareceu (chegou vencida, ou foi superada por outra antes de aparecer) sai
como "Cancelada por tempo". Decidido assim em outubro de 2026.

**Alerta de 30 s só se a pessoa já marcou algo**, em todas as mesas. Sem
marcação a troca é imediata. Pesquisas que chegam durante o alerta não o
reiniciam: a mais recente toma o lugar na espera e a anterior sai por tempo.

**Enviar exige as três respostas** (decidido em outubro de 2026, depois do
primeiro teste). Faltando alguma, a tela diz quais e destaca as perguntas; nada
é gravado. Com respostas pela metade, o caminho é "Prefiro não responder", que
grava o que foi marcado como "Cancelada pelo cliente". Por isso "Respondida
parcialmente" não acontece mais pela tela. A regra do modelo ainda trata o caso,
para não depender da tela.

**O botão Enviar só aparece depois da primeira marcação**, como no layout.

**Falha de rede no envio não perde a resposta.** O cliente vê o agradecimento na
hora; o registro fica numa fila **só em memória** e é reenviado a cada consulta.
Nada vai para o disco. Se o tablet desligar antes, a pesquisa continua pendente
no CRM e o prazo de 30 minutos a encerra.

**Erro definitivo do CRM (400, 404) descarta a gravação.** Repetir um pedido que
o CRM considera errado só encheria a fila. O erro fica no diagnóstico.

**Acesso por segredo de aplicativo próprio dos tablets**, decidido em outubro
de 2026 porque o consentimento do administrador para o login por conta não
estava disponível. Ressalvas aceitas: o segredo vence (máx. 24 meses) e quem o
tiver entra no CRM de qualquer lugar. Mitigações: registro só dos tablets
(nunca o do totem, para um vazamento não derrubar o totem), papel mínimo no
CRM (só ler e gravar `ret_relacionamento`), segredo **fora do APK** (instalado
pelo adb e cifrado com chave do Android Keystore), depuração USB bloqueada
depois da instalação, vencimento visível no diagnóstico. O modo por conta
continua no código; apagar a credencial volta a ele.

**O token nunca passa pelo JavaScript.** A chamada HTTP é feita pela casca
(`ClienteDataverse.kt`), que só aceita caminho relativo e monta a URL com o
endereço do ambiente. Isso também evita depender de CORS no WebView.

**O PIN não vai para o JavaScript guardado**, só digitado. A casca guarda hash
com sal e confere a cada ação protegida, como o totem faz no Python.

**No modo por conta, login dentro do app (`WEBVIEW`)**, não pelo navegador: com o quiosque ativo o
Android não deixa abrir outro app.

**Um APK para os três tablets.** O grupo de mesas é escolhido na manutenção e
guardado no aparelho.

**A manutenção fecha sozinha depois de 2 minutos sem toque.** Enquanto ela está
aberta o ciclo fica parado; esquecida aberta, o tablet ficaria sem pesquisa.

---

## Onde ficou dívida

**Lembrete do vencimento do segredo** depende de alguém olhar o diagnóstico
ou da agenda. Não há aviso automático por e-mail.

**Só uma gravação real foi conferida até agora.** A primeira semana deve ser
acompanhada pelo diagnóstico da manutenção ("Último erro") e por uma
conferência das colunas gravadas no CRM.

**Os apps e fluxos antigos precisam ser desligados no dia da troca.** Os dois
juntos gravariam no mesmo registro.

**`fecap_iniciarpesquisa` continua "Sim" para sempre.** O app novo não mexe nela
(o filtro pela data de realização basta). Se outro processo passar a
depender de ela voltar para "Não", é aqui.

**PIN sem bloqueio por tentativas.** Um PIN de 4 números pode ser descoberto
testando. Na prática exige ficar no tablet, de pé, com a equipe ao lado.

**Fontes da marca não estão no projeto.** O CSS cai em Poppins se instalada e,
no Android, em Roboto. Para ficar idêntico ao layout, colocar as fontes em
`web/visao/assets/fontes` e trocar `--sans` no `tablet.css`.

**Senha chamada de novo.** Não se sabe se a hora da chamada é atualizada quando
a mesma senha é chamada uma segunda vez. Se for, o prazo recomeça; se não, a
pesquisa pode chegar vencida.

**Sem histórico de execução no aparelho.** O diagnóstico mostra os últimos 20
encerramentos e o último erro, só em memória.
