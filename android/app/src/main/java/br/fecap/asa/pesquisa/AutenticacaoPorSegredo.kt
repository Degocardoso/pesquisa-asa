package br.fecap.asa.pesquisa

import android.app.Activity
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Acesso com a credencial de aplicativo propria dos tablets (client
 * credentials), a mesma abordagem do totem: token em memoria, renovado antes
 * de expirar.
 *
 * O registro precisa ser so dos tablets, nunca o do totem: se um segredo vazar
 * e for trocado, o totem nao para junto. No Dataverse, o usuario de aplicativo
 * desse registro deve ter um papel que so le e grava ret_relacionamento.
 */
class AutenticacaoPorSegredo(private val cofre: Cofre, ambiente: String) : Autenticacao {

    override val modo = "segredo"

    private val escopo = "${ambiente.trimEnd('/')}/.default"

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val tranca = Any()
    @Volatile private var token: String? = null
    @Volatile private var expiraEm = 0L

    override fun token(): String {
        synchronized(tranca) {
            // 60 s de folga para nao usar um token que expira no meio da chamada.
            val guardado = token
            if (guardado != null && System.currentTimeMillis() < expiraEm - 60_000) return guardado
            return renovar()
        }
    }

    private fun renovar(): String {
        val credencial = cofre.ler()
            ?: throw ErroDaPonte("configuracao", "Nenhuma credencial neste tablet. Veja docs/SEGREDO.md.")

        val corpo = FormBody.Builder()
            .add("client_id", credencial.cliente)
            .add("client_secret", credencial.segredo)
            .add("scope", escopo)
            .add("grant_type", "client_credentials")
            .build()
        val pedido = Request.Builder()
            .url("https://login.microsoftonline.com/${credencial.tenant}/oauth2/v2.0/token")
            .post(corpo)
            .build()

        try {
            http.newCall(pedido).execute().use { resposta ->
                val texto = resposta.body?.string().orEmpty()
                if (resposta.code >= 500) throw ErroDaPonte("rede", "O login da Microsoft esta indisponivel.")
                if (!resposta.isSuccessful) {
                    val motivo = runCatching { JSONObject(texto).optString("error_description") }
                        .getOrDefault(texto)
                        .take(300)
                    // Segredo vencido ou digitado errado cai aqui. A tela mostra
                    // "instalacao incompleta" e o diagnostico mostra o motivo.
                    throw ErroDaPonte("configuracao", "O Entra recusou a credencial do tablet: $motivo")
                }
                val json = JSONObject(texto)
                val novo = json.getString("access_token")
                token = novo
                expiraEm = System.currentTimeMillis() + json.optLong("expires_in", 3600) * 1000
                return novo
            }
        } catch (erro: IOException) {
            throw ErroDaPonte("rede", erro.message ?: "Falha de rede.")
        }
    }

    override fun contaAtual(): String? {
        val credencial = cofre.ler() ?: return null
        return "aplicativo ${credencial.cliente.take(8)}… (segredo do tablet)"
    }

    override fun entrar(atividade: Activity, aoTerminar: (Result<String>) -> Unit) {
        aoTerminar(Result.failure(ErroDaPonte(
            "erro", "Este tablet usa segredo de aplicativo: nao ha login. Veja docs/SEGREDO.md.")))
    }

    override fun sair() {
        throw ErroDaPonte("erro", "Para tirar o segredo deste tablet, use o comando de docs/SEGREDO.md.")
    }

    override fun esquecerToken() {
        synchronized(tranca) {
            token = null
            expiraEm = 0L
        }
    }
}
