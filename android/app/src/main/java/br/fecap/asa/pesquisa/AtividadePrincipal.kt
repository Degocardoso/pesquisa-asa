package br.fecap.asa.pesquisa

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * A unica tela do app: um WebView com a interface da pasta web/.
 *
 * Toda a regra da pesquisa vive no JavaScript. Aqui fica so o que o navegador
 * nao consegue fazer: login (MSAL), chamada ao CRM com o token, quiosque, tela
 * acesa e PIN.
 */
class AtividadePrincipal : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var ponte: Ponte
    private lateinit var rede: Rede

    // Ligado pela manutencao para atualizar o app. Volta a desligar quando a
    // pessoa sai do app e retorna a ele (onRestart).
    private var quiosqueSuspenso = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val ambiente = getString(R.string.ambiente_dataverse)
        val autenticacao = Autenticacao(applicationContext, ambiente).also { it.iniciar() }
        val instalacao = Instalacao(applicationContext)
        val dataverse = ClienteDataverse(ambiente, getString(R.string.versao_da_api), autenticacao)

        // Servir a interface por https em vez de file:// e o que permite
        // modulos JavaScript (import) e fetch dos arquivos JSON.
        val carregador = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        setContentView(webView)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        // Toque longo nao abre menu de copiar nem lupa num tablet publico. O
        // JavaScript continua recebendo o toque (e o que abre a manutencao).
        webView.setOnLongClickListener { true }
        webView.isLongClickable = false
        webView.isHapticFeedbackEnabled = false

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                carregador.shouldInterceptRequest(request.url)

            // O WebView so navega na propria interface. Qualquer outro endereco
            // e recusado, e a ponte com o token nunca fica exposta a ele.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != HOST
        }

        ponte = Ponte(this, webView, instalacao, autenticacao, dataverse)
        webView.addJavascriptInterface(ponte, "PonteAndroid")
        webView.loadUrl("https://$HOST/assets/web/index.html")

        rede = Rede(applicationContext) { online ->
            ponte.evento("rede", JSONObject().put("online", online))
        }
        rede.iniciar()

        // Voltar nao faz nada: nao ha para onde voltar.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {}
        })
    }

    override fun onResume() {
        super.onResume()
        esconderBarras()
        if (!quiosqueSuspenso) {
            Quiosque.preparar(this)
            Quiosque.entrar(this)
        }
    }

    override fun onRestart() {
        super.onRestart()
        quiosqueSuspenso = false
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) esconderBarras()
    }

    override fun onDestroy() {
        rede.parar()
        webView.destroy()
        super.onDestroy()
    }

    fun suspenderQuiosque() {
        quiosqueSuspenso = true
        Quiosque.sair(this)
    }

    private fun esconderBarras() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    companion object {
        const val HOST = "appassets.androidplatform.net"
    }
}
