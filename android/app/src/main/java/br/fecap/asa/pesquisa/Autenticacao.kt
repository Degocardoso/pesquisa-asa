package br.fecap.asa.pesquisa

import android.app.Activity
import android.content.Context

/**
 * De onde vem o token que vai para o Dataverse.
 *
 * Dois modos, escolhidos pelo que esta instalado no tablet:
 *   segredo  credencial de aplicativo propria dos tablets, instalada pelo adb
 *            (AutenticacaoPorSegredo, docs/SEGREDO.md)
 *   conta    login com a conta do tablet pelo MSAL (AutenticacaoPorConta,
 *            docs/ENTRA.md)
 */
interface Autenticacao {
    val modo: String
    fun token(): String
    fun contaAtual(): String?
    fun entrar(atividade: Activity, aoTerminar: (Result<String>) -> Unit)
    fun sair()
    fun esquecerToken()
}

/**
 * Decide o modo a cada chamada, e nao uma vez na abertura: a credencial pode
 * ser instalada ou apagada pelo adb com o app aberto, e o modo novo vale ja na
 * consulta seguinte.
 */
class AutenticacaoEscolhida(contexto: Context, private val cofre: Cofre, ambiente: String) : Autenticacao {

    private val porConta = AutenticacaoPorConta(contexto, ambiente)
    private val porSegredo = AutenticacaoPorSegredo(cofre, ambiente)

    private val atual: Autenticacao get() = if (cofre.temCredencial) porSegredo else porConta

    fun iniciar() = porConta.iniciar()

    override val modo: String get() = atual.modo
    override fun token() = atual.token()
    override fun contaAtual() = atual.contaAtual()
    override fun entrar(atividade: Activity, aoTerminar: (Result<String>) -> Unit) = atual.entrar(atividade, aoTerminar)
    override fun sair() = atual.sair()
    override fun esquecerToken() = atual.esquecerToken()

    /** Data de vencimento informada ao instalar o segredo (aaaa-mm-dd), ou null. */
    fun segredoVenceEm(): String? = if (cofre.temCredencial) cofre.ler()?.venceEm else null
}
