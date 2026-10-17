package br.fecap.asa.pesquisa

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Transporte HTTP para a Web API do Dataverse.
 *
 * Nao sabe nada de pesquisa nem de colunas: recebe metodo, caminho relativo e
 * corpo prontos do JavaScript (web/modelo/dataverse.js), poe o endereco do
 * ambiente e o token, e devolve status e corpo. Fazer a chamada aqui, e nao
 * por fetch no WebView, evita depender de CORS e mantem o token fora do
 * JavaScript.
 */
class ClienteDataverse(
    ambiente: String,
    versaoDaApi: String,
    private val autenticacao: Autenticacao,
) {
    private val base = "${ambiente.trimEnd('/')}/api/data/$versaoDaApi/"

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    fun requisitar(pedido: JSONObject): JSONObject {
        val metodo = pedido.getString("metodo")
        if (metodo !in METODOS_PERMITIDOS) throw ErroDaPonte("erro", "Metodo nao permitido: $metodo")

        // O token so pode ir para o Dataverse: caminho relativo, sem esquema,
        // host ou barra inicial que permitiriam escapar da base.
        val caminho = pedido.getString("caminho")
        if (caminho.contains("://") || caminho.startsWith("/") || caminho.contains("..")) {
            throw ErroDaPonte("erro", "Caminho invalido.")
        }

        val token = autenticacao.token()

        val corpo = if (pedido.has("corpo") && !pedido.isNull("corpo")) {
            pedido.get("corpo").toString().toRequestBody(JSON)
        } else {
            null
        }

        val requisicao = Request.Builder()
            .url(base + caminho)
            .method(metodo, corpo)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .header("OData-Version", "4.0")
            .header("OData-MaxVersion", "4.0")

        pedido.optJSONObject("cabecalhos")?.let { cabecalhos ->
            cabecalhos.keys().forEach { nome ->
                if (nome in CABECALHOS_PERMITIDOS) requisicao.header(nome, cabecalhos.getString(nome))
            }
        }

        try {
            http.newCall(requisicao.build()).execute().use { resposta ->
                val texto = resposta.body?.string().orEmpty()
                val corpoDaResposta: Any = when {
                    texto.isBlank() -> ""
                    else -> try { JSONObject(texto) } catch (_: JSONException) { texto }
                }
                return JSONObject()
                    .put("status", resposta.code)
                    .put("corpo", corpoDaResposta)
            }
        } catch (erro: IOException) {
            throw ErroDaPonte("rede", erro.message ?: "Falha de rede.")
        }
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
        val METODOS_PERMITIDOS = setOf("GET", "PATCH")
        val CABECALHOS_PERMITIDOS = setOf("If-Match", "Prefer")
    }
}
