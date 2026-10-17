package br.fecap.asa.pesquisa

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * O que muda de um tablet para outro: qual grupo de mesas ele atende e o PIN da
 * manutencao. Fica no proprio aparelho, para que os tres tablets usem o mesmo
 * APK.
 *
 * O PIN e guardado so como hash com sal. A conferencia acontece aqui, nunca no
 * JavaScript, e toda acao protegida pede o PIN de novo.
 */
class Instalacao(contexto: Context) {

    private val preferencias = contexto.getSharedPreferences("instalacao", Context.MODE_PRIVATE)

    val grupo: String? get() = preferencias.getString(GRUPO, null)

    val temPin: Boolean get() = preferencias.contains(PIN_HASH)

    fun conferirPin(pin: String?): Boolean {
        if (pin.isNullOrEmpty()) return false
        val sal = preferencias.getString(PIN_SAL, null) ?: return false
        val guardado = preferencias.getString(PIN_HASH, null) ?: return false
        return MessageDigest.isEqual(resumo(sal, pin).toByteArray(), guardado.toByteArray())
    }

    fun exigirPin(pin: String?) {
        if (!conferirPin(pin)) throw ErroDaPonte("erro", "PIN incorreto.")
    }

    /** Na primeira vez nao ha PIN atual; depois disso, so troca quem sabe o atual. */
    fun definirPin(atual: String?, novo: String) {
        if (temPin) exigirPin(atual)
        if (!FORMATO_DO_PIN.matches(novo)) throw ErroDaPonte("erro", "O PIN deve ter de 4 a 8 numeros.")
        val sal = ByteArray(16).also { SecureRandom().nextBytes(it) }
            .let { Base64.encodeToString(it, Base64.NO_WRAP) }
        preferencias.edit()
            .putString(PIN_SAL, sal)
            .putString(PIN_HASH, resumo(sal, novo))
            .apply()
    }

    /**
     * Os grupos (quais mesas cada um atende) estao em web/configuracao.json.
     * Aqui so se guarda a chave escolhida, sem repetir a lista.
     */
    fun definirGrupo(pin: String?, novo: String) {
        exigirPin(pin)
        if (!FORMATO_DO_GRUPO.matches(novo)) throw ErroDaPonte("erro", "Grupo invalido: $novo")
        preferencias.edit().putString(GRUPO, novo).apply()
    }

    private fun resumo(sal: String, pin: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest((sal + pin).toByteArray())
            .joinToString("") { "%02x".format(it) }

    private companion object {
        const val GRUPO = "grupo"
        const val PIN_SAL = "pin_sal"
        const val PIN_HASH = "pin_hash"
        val FORMATO_DO_PIN = Regex("^[0-9]{4,8}$")
        val FORMATO_DO_GRUPO = Regex("^[0-9]{1,4}$")
    }
}
