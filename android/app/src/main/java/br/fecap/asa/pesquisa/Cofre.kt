package br.fecap.asa.pesquisa

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Guarda a credencial de aplicativo do tablet.
 *
 * O segredo nao vai dentro do APK: e instalado em cada tablet pelo adb
 * (docs/SEGREDO.md). Assim uma copia do APK no OneDrive, num e-mail ou num
 * pendrive nao entrega acesso ao CRM, e trocar o segredo vencido nao exige
 * gerar outro APK.
 *
 * No aparelho, o segredo fica cifrado com uma chave do Android Keystore, que
 * nao sai do hardware do tablet. Mesmo quem conseguisse copiar os arquivos do
 * app nao leria o segredo.
 */
class Cofre(contexto: Context) {

    data class Credencial(val tenant: String, val cliente: String, val segredo: String, val venceEm: String?)

    private val preferencias = contexto.getSharedPreferences("credencial", Context.MODE_PRIVATE)

    val temCredencial: Boolean get() = preferencias.contains(SEGREDO)

    fun guardar(credencial: Credencial) {
        val cifra = Cipher.getInstance(TRANSFORMACAO).apply { init(Cipher.ENCRYPT_MODE, chave()) }
        val cifrado = cifra.doFinal(credencial.segredo.toByteArray(Charsets.UTF_8))
        preferencias.edit()
            .putString(TENANT, credencial.tenant)
            .putString(CLIENTE, credencial.cliente)
            .putString(VENCE_EM, credencial.venceEm)
            .putString(IV, Base64.encodeToString(cifra.iv, Base64.NO_WRAP))
            .putString(SEGREDO, Base64.encodeToString(cifrado, Base64.NO_WRAP))
            .apply()
    }

    fun ler(): Credencial? {
        val cifrado = preferencias.getString(SEGREDO, null) ?: return null
        val iv = preferencias.getString(IV, null) ?: return null
        val cifra = Cipher.getInstance(TRANSFORMACAO).apply {
            init(Cipher.DECRYPT_MODE, chave(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        }
        val segredo = String(cifra.doFinal(Base64.decode(cifrado, Base64.NO_WRAP)), Charsets.UTF_8)
        return Credencial(
            tenant = preferencias.getString(TENANT, "").orEmpty(),
            cliente = preferencias.getString(CLIENTE, "").orEmpty(),
            segredo = segredo,
            venceEm = preferencias.getString(VENCE_EM, null),
        )
    }

    fun apagar() {
        preferencias.edit().clear().apply()
    }

    private fun chave(): SecretKey {
        val armazem = KeyStore.getInstance(ARMAZEM).apply { load(null) }
        (armazem.getKey(APELIDO, null) as? SecretKey)?.let { return it }
        val gerador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ARMAZEM)
        gerador.init(
            KeyGenParameterSpec.Builder(APELIDO, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gerador.generateKey()
    }

    private companion object {
        const val ARMAZEM = "AndroidKeyStore"
        const val APELIDO = "credencial-do-tablet"
        const val TRANSFORMACAO = "AES/GCM/NoPadding"
        const val TENANT = "tenant"
        const val CLIENTE = "cliente"
        const val SEGREDO = "segredo"
        const val IV = "iv"
        const val VENCE_EM = "vence_em"
    }
}
