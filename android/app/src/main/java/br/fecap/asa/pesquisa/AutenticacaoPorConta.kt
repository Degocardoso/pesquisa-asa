package br.fecap.asa.pesquisa

import android.app.Activity
import android.content.Context
import com.microsoft.identity.client.AcquireTokenSilentParameters
import com.microsoft.identity.client.AuthenticationCallback
import com.microsoft.identity.client.IAuthenticationResult
import com.microsoft.identity.client.IPublicClientApplication
import com.microsoft.identity.client.ISingleAccountPublicClientApplication
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.SignInParameters
import com.microsoft.identity.client.exception.MsalClientException
import com.microsoft.identity.client.exception.MsalException
import com.microsoft.identity.client.exception.MsalUiRequiredException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Acesso pela conta da instituicao (tablet01, tablet02, tablet03), com login
 * pela biblioteca oficial MSAL. Usado quando o tablet nao tem credencial de
 * aplicativo instalada (ver AutenticacaoPorSegredo).
 *
 * Registro no Entra como aplicativo movel (cliente publico), nunca SPA: o token
 * de atualizacao de SPA dura 24 horas fixas; o de aplicativo movel dura 90 dias
 * e renova a cada uso, entao um tablet em uso nao pede login de novo.
 *
 * Os metodos sincronos (token, sair, contaAtual) rodam nas threads da Ponte,
 * nunca na thread da tela: o MSAL proibe chamada sincrona nela.
 */
class AutenticacaoPorConta(private val contexto: Context, ambiente: String) : Autenticacao {

    override val modo = "conta"

    private val escopos = listOf("${ambiente.trimEnd('/')}/user_impersonation")

    @Volatile private var aplicacao: ISingleAccountPublicClientApplication? = null
    @Volatile private var falhaAoIniciar: String? = null
    private val pronta = CountDownLatch(1)

    fun iniciar() {
        try {
            PublicClientApplication.createSingleAccountPublicClientApplication(
                contexto,
                R.raw.msal_config,
                object : IPublicClientApplication.ISingleAccountApplicationCreatedListener {
                    override fun onCreated(application: ISingleAccountPublicClientApplication) {
                        aplicacao = application
                        pronta.countDown()
                    }

                    override fun onError(exception: MsalException) {
                        falhaAoIniciar = exception.message
                        pronta.countDown()
                    }
                },
            )
        } catch (erro: Exception) {
            falhaAoIniciar = erro.message
            pronta.countDown()
        }
    }

    private fun msal(): ISingleAccountPublicClientApplication {
        pronta.await(ESPERA_PELO_MSAL_EM_SEGUNDOS, TimeUnit.SECONDS)
        return aplicacao ?: throw ErroDaPonte(
            "configuracao",
            "Login nao configurado (${falhaAoIniciar ?: "o MSAL nao respondeu"}). Veja docs/ENTRA.md.",
        )
    }

    override fun contaAtual(): String? = try {
        msal().currentAccount.currentAccount?.username
    } catch (erro: Exception) {
        null
    }

    override fun token(): String {
        val app = msal()
        val conta = app.currentAccount.currentAccount
            ?: throw ErroDaPonte("autenticacao", "Nenhuma conta conectada neste tablet.")
        val parametros = AcquireTokenSilentParameters.Builder()
            .forAccount(conta)
            .fromAuthority(conta.authority)
            .withScopes(escopos)
            .build()
        try {
            return app.acquireTokenSilent(parametros).accessToken
        } catch (erro: MsalUiRequiredException) {
            throw ErroDaPonte("autenticacao", "O login do tablet expirou. Entre de novo pela manutencao.")
        } catch (erro: MsalClientException) {
            // Sem rede o MSAL nao consegue renovar o token. Isso nao e login
            // vencido: a tela tem que dizer "sem conexao", nao "chame o suporte".
            if (erro.errorCode in CODIGOS_DE_REDE) throw ErroDaPonte("rede", erro.message ?: "Sem rede.")
            throw ErroDaPonte("autenticacao", erro.message ?: erro.errorCode)
        } catch (erro: MsalException) {
            throw ErroDaPonte("autenticacao", erro.message ?: erro.errorCode)
        }
    }

    /** Login interativo, pedido pela manutencao. Abre a tela da Microsoft dentro do app. */
    override fun entrar(atividade: Activity, aoTerminar: (Result<String>) -> Unit) {
        val app = msal()
        atividade.runOnUiThread {
            val parametros = SignInParameters.builder()
                .withActivity(atividade)
                .withScopes(escopos)
                .withCallback(object : AuthenticationCallback {
                    override fun onSuccess(resultado: IAuthenticationResult) {
                        aoTerminar(Result.success(resultado.account.username))
                    }

                    override fun onError(erro: MsalException) {
                        aoTerminar(Result.failure(ErroDaPonte("autenticacao", erro.message ?: erro.errorCode)))
                    }

                    override fun onCancel() {
                        aoTerminar(Result.failure(ErroDaPonte("erro", "Login cancelado.")))
                    }
                })
                .build()
            app.signIn(parametros)
        }
    }

    override fun sair() {
        msal().signOut()
    }

    override fun esquecerToken() {
        // O MSAL guarda e renova o token sozinho.
    }

    private companion object {
        const val ESPERA_PELO_MSAL_EM_SEGUNDOS = 20L
        val CODIGOS_DE_REDE = setOf("device_network_not_available", "io_error")
    }
}
