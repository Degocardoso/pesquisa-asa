package br.fecap.asa.pesquisa

import android.app.admin.DeviceAdminReceiver

/**
 * Existe so para o app poder ser registrado como dono do dispositivo
 * (adb shell dpm set-device-owner br.fecap.asa.pesquisa/.Administrador).
 */
class Administrador : DeviceAdminReceiver()
