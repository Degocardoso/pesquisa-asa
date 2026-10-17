package br.fecap.asa.pesquisa

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
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
    private lateinit var instalacao: Instalacao
    private lateinit var cofre: Cofre
    private lateinit var autenticacao: AutenticacaoEscolhida

    // Ligado pela manutencao para atualizar o app. Volta a desligar quando a
    // pessoa sai do app e retorna a ele (onRestart).
    private var quiosqueSuspenso = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val ambiente = getString(R.string.ambiente_dataverse)
        instalacao = Instalacao(applicationContext)
        cofre = Cofre(applicationContext)
        autenticacao = AutenticacaoEscolhida(applicationContext, cofre, ambiente).also { it.iniciar() }
        val dataverse = ClienteDataverse(ambiente, getString(R.string.versao_da_api), autenticacao)

        // Servir a interface por https em vez de file:// e o que permite
        // modulos JavaScript (import) e fetch dos arquivos JSON.
        val carregador = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // So no build de debug: deixa ver o console do JavaScript pelo Chrome
        // do computador (chrome://inspect). No APK de producao fica desligado.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
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

        receberCredencial(intent)

        // Voltar nao faz nada: nao ha para onde voltar.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {}
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        receberCredencial(intent)
    }

    override fun onResume() {
        super.onResume()
        esconderBarras()
        if (!quiosqueSuspenso) {
            // A depuracao USB so e bloqueada com a instalacao completa: antes
            // disso o adb ainda e o caminho para instalar a credencial.
            val instalacaoCompleta = instalacao.temPin && instalacao.grupo != null && cofre.temCredencial
            Quiosque.preparar(this, bloquearDepuracao = instalacaoCompleta)
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

    /**
     * Instala ou apaga a credencial de aplicativo vinda do adb
     * (docs/SEGREDO.md). Com PIN ja definido, o comando tem que trazer o PIN:
     * sem isso qualquer app no tablet poderia trocar a credencial.
     */
    private fun receberCredencial(pedido: Intent?) {
        if (pedido == null) return
        val apagar = pedido.getBooleanExtra(EXTRA_APAGAR, false)
        val segredo = pedido.getStringExtra(EXTRA_SEGREDO)
        if (!apagar && segredo == null) return

        // O segredo nao fica guardado no Intent da atividade depois de lido.
        setIntent(Intent(pedido).apply { removeExtra(EXTRA_SEGREDO) })

        if (instalacao.temPin && !instalacao.conferirPin(pedido.getStringExtra(EXTRA_PIN))) {
            avisar("PIN incorreto: nada foi alterado.")
            return
        }

        if (apagar) {
            cofre.apagar()
            autenticacao.esquecerToken()
            avisar("Credencial apagada. O tablet volta a usar a conta (login).")
        } else {
            val tenant = pedido.getStringExtra(EXTRA_TENANT)
            val cliente = pedido.getStringExtra(EXTRA_CLIENTE)
            val venceEm = pedido.getStringExtra(EXTRA_VENCE_EM)
            if (tenant.isNullOrBlank() || cliente.isNullOrBlank() || segredo.isNullOrBlank()) {
                avisar("Faltou tenant, cliente ou segredo: nada foi alterado.")
                return
            }
            if (venceEm != null && !FORMATO_DE_DATA.matches(venceEm)) {
                avisar("venceEm deve estar no formato aaaa-mm-dd: nada foi alterado.")
                return
            }
            cofre.guardar(Cofre.Credencial(tenant.trim(), cliente.trim(), segredo.trim(), venceEm))
            autenticacao.esquecerToken()
            avisar("Credencial instalada.")
        }
        ponte.evento("credencial", JSONObject())
    }

    private fun avisar(texto: String) {
        Toast.makeText(this, texto, Toast.LENGTH_LONG).show()
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
        private const val EXTRA_TENANT = "tenant"
        private const val EXTRA_CLIENTE = "cliente"
        private const val EXTRA_SEGREDO = "segredo"
        private const val EXTRA_VENCE_EM = "venceEm"
        private const val EXTRA_PIN = "pin"
        private const val EXTRA_APAGAR = "apagarCredencial"
        private val FORMATO_DE_DATA = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    }
}
