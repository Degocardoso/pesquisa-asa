package br.fecap.asa.pesquisa

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.provider.Settings

/**
 * Modo quiosque.
 *
 * Com o app como dono do dispositivo (docs/QUIOSQUE.md), o bloqueio e total:
 * sem barra de status, sem botao de Inicio ou de apps recentes, sem tela de
 * bloqueio, e o app abre sozinho quando o tablet liga.
 *
 * Sem ser dono, o Android so oferece a fixacao de tela, que pede confirmacao e
 * pode ser desfeita segurando Voltar + Visao geral. Serve para teste, nao para
 * producao.
 *
 * Quando o Intune for configurado, ele assume este papel e o app deixa de ser
 * dono do dispositivo.
 */
object Quiosque {

    private fun politicas(contexto: Context) =
        contexto.getSystemService(DevicePolicyManager::class.java)

    private fun administrador(contexto: Context) = ComponentName(contexto, Administrador::class.java)

    fun eDono(contexto: Context): Boolean = politicas(contexto).isDeviceOwnerApp(contexto.packageName)

    /** Aplicado a cada retorno ao app. Repetir e inofensivo e cobre um reinicio. */
    fun preparar(atividade: Activity) {
        if (!eDono(atividade)) return
        val dpm = politicas(atividade)
        val admin = administrador(atividade)

        dpm.setLockTaskPackages(admin, arrayOf(atividade.packageName))
        dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)

        val inicio = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        dpm.addPersistentPreferredActivity(admin, inicio, ComponentName(atividade, AtividadePrincipal::class.java))

        dpm.setKeyguardDisabled(admin, true)
        dpm.setStatusBarDisabled(admin, true)

        // A tela fica acesa enquanto o app esta aberto (FLAG_KEEP_SCREEN_ON),
        // mas isso nao cobre o tablet antes de o app abrir. Na tomada, nunca
        // apaga.
        val naTomada = BatteryManager.BATTERY_PLUGGED_AC or
            BatteryManager.BATTERY_PLUGGED_USB or
            BatteryManager.BATTERY_PLUGGED_WIRELESS
        dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, naTomada.toString())
    }

    fun entrar(atividade: Activity) {
        val gerenciador = atividade.getSystemService(ActivityManager::class.java)
        if (gerenciador.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            atividade.startLockTask()
        }
    }

    /** Libera o tablet para atualizar o app. A tela inicial do Android volta a funcionar. */
    fun sair(atividade: Activity) {
        if (eDono(atividade)) {
            val dpm = politicas(atividade)
            val admin = administrador(atividade)
            dpm.clearPackagePersistentPreferredActivities(admin, atividade.packageName)
            dpm.setStatusBarDisabled(admin, false)
        }
        atividade.stopLockTask()
    }

    fun estado(contexto: Context): String {
        val gerenciador = contexto.getSystemService(ActivityManager::class.java)
        return when (gerenciador.lockTaskModeState) {
            ActivityManager.LOCK_TASK_MODE_LOCKED -> "ativo (dono do dispositivo)"
            ActivityManager.LOCK_TASK_MODE_PINNED -> "fixacao de tela (sem dono do dispositivo)"
            else -> if (eDono(contexto)) "inativo (suspenso pela manutencao)" else "inativo"
        }
    }
}
