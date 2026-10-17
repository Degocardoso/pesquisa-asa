package br.fecap.asa.pesquisa

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network

/**
 * Avisa a interface quando a rede cai ou volta.
 *
 * Nao e daqui que a tela decide mostrar "sem conexao": isso vem do resultado
 * das consultas, que tambem pega o Wi-Fi conectado sem internet. Este aviso
 * serve para a volta ser imediata, sem esperar o proximo intervalo.
 */
class Rede(contexto: Context, private val aoMudar: (Boolean) -> Unit) {

    private val conectividade = contexto.getSystemService(ConnectivityManager::class.java)

    private val retorno = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = aoMudar(true)
        override fun onLost(network: Network) = aoMudar(false)
    }

    fun iniciar() = conectividade.registerDefaultNetworkCallback(retorno)

    fun parar() {
        runCatching { conectividade.unregisterNetworkCallback(retorno) }
    }
}
