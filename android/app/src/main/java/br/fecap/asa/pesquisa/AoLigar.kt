package br.fecap.asa.pesquisa

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Quando o tablet liga, garante que o app volte a ser a tela inicial e abre o
 * app.
 *
 * Normalmente nao faria diferenca: com o quiosque ativo o app ja e a tela
 * inicial. Mas se o tablet reiniciar com o quiosque suspenso pela manutencao,
 * a tela inicial do app esta desligada, e sem isto o tablet ligaria na tela
 * normal do Android.
 */
class AoLigar : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!Quiosque.eDono(contexto)) return
        Quiosque.ligarTelaInicial(contexto, true)
        contexto.startActivity(
            Intent(contexto, AtividadePrincipal::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
