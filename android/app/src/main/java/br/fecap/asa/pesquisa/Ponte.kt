package br.fecap.asa.pesquisa

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.Executors

/** Erro que vai para o JavaScript com um tipo que ele sabe tratar. */
class ErroDaPonte(val tipo: String, mensagem: String) : Exception(mensagem)

/**
 * O que o JavaScript pode pedir para a casca.
 *
 * Um unico metodo exposto, chamar(id, metodo, argumentos), e a resposta
 * volta por window.__ponte.responder(id, ok, valor). O contrato do lado do
 * JavaScript esta em web/plataforma.js.
 *
 * Cada pedido roda numa thread propria: o JavaScript nunca espera a thread da
 * tela, e a consulta ao CRM nao fica presa atras de uma gravacao.
 */
class Ponte(
    private val atividade: AtividadePrincipal,
    private val webView: WebView,
    private val instalacao: Instalacao,
    private val autenticacao: Autenticacao,
    private val dataverse: ClienteDataverse,
) {
    private val executor = Executors.newCachedThreadPool()

    @JavascriptInterface
    fun chamar(id: String, metodo: String, argumentos: String) {
        executor.execute {
            try {
                val args = JSONObject(argumentos)
                when (metodo) {
                    "instalacao" -> responder(id, descreverInstalacao())
                    "conferirPin" -> responder(id, instalacao.conferirPin(args.optString("pin")))
                    "definirPin" -> {
                        instalacao.definirPin(textoOuNulo(args, "atual"), args.getString("novo"))
                        responder(id, null)
                    }
                    "definirGrupo" -> {
                        instalacao.definirGrupo(args.optString("pin"), args.getString("grupo"))
                        responder(id, null)
                    }
                    "entrar" -> {
                        instalacao.exigirPin(args.optString("pin"))
                        autenticacao.entrar(atividade) { resultado ->
                            resultado.fold({ conta -> responder(id, conta) }, { erro -> falhar(id, erro) })
                        }
                    }
                    "sair" -> {
                        instalacao.exigirPin(args.optString("pin"))
                        autenticacao.sair()
                        responder(id, null)
                    }
                    "sairDoQuiosque" -> {
                        instalacao.exigirPin(args.optString("pin"))
                        atividade.runOnUiThread { atividade.suspenderQuiosque() }
                        responder(id, null)
                    }
                    "requisitar" -> responder(id, dataverse.requisitar(args))
                    else -> throw ErroDaPonte("erro", "Metodo desconhecido: $metodo")
                }
            } catch (erro: Exception) {
                falhar(id, erro)
            }
        }
    }

    fun evento(nome: String, valor: JSONObject) {
        executar("window.__ponte && window.__ponte.evento(${JSONObject.quote(nome)}, $valor)")
    }

    private fun descreverInstalacao(): JSONObject = JSONObject()
        .put("grupo", instalacao.grupo ?: JSONObject.NULL)
        .put("temPin", instalacao.temPin)
        .put("conta", autenticacao.contaAtual() ?: JSONObject.NULL)
        .put("quiosque", Quiosque.estado(atividade))
        .put("versao", BuildConfig.VERSION_NAME)

    private fun responder(id: String, valor: Any?) {
        val json = when (valor) {
            null -> "null"
            is String -> JSONObject.quote(valor)
            else -> valor.toString() // JSONObject e Boolean ja saem como JSON valido
        }
        executar("window.__ponte.responder(${JSONObject.quote(id)}, true, $json)")
    }

    private fun falhar(id: String, erro: Throwable) {
        val corpo = JSONObject()
            .put("tipo", (erro as? ErroDaPonte)?.tipo ?: "erro")
            .put("mensagem", erro.message ?: erro.javaClass.simpleName)
        executar("window.__ponte.responder(${JSONObject.quote(id)}, false, $corpo)")
    }

    private fun executar(js: String) {
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun textoOuNulo(args: JSONObject, chave: String): String? =
        if (args.isNull(chave)) null else args.getString(chave)
}
