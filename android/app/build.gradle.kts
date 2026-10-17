import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Chave de assinatura e hash ficam fora do repositorio (ver docs/ENTRA.md).
// O hash da assinatura faz parte do endereco de retorno do login: se a chave
// mudar, o registro no Entra tem que mudar junto.
val assinatura = Properties().apply {
    val arquivo = rootProject.file("assinatura.properties")
    if (arquivo.exists()) arquivo.inputStream().use { load(it) }
}

android {
    namespace = "br.fecap.asa.pesquisa"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.fecap.asa.pesquisa"
        // Os tablets estao no Android 15; 28 deixa margem para um tablet
        // reserva mais antigo sem perder nada do que o app usa.
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["hashDaAssinatura"] = assinatura.getProperty("hashDaAssinatura", "PREENCHER")
    }

    val temAssinatura = assinatura.getProperty("arquivo") != null
    if (temAssinatura) {
        signingConfigs.create("instituicao") {
            storeFile = rootProject.file(assinatura.getProperty("arquivo"))
            storePassword = assinatura.getProperty("senhaDoArquivo")
            keyAlias = assinatura.getProperty("apelido")
            keyPassword = assinatura.getProperty("senhaDaChave")
        }
    }

    buildTypes {
        // Debug e release assinados com a mesma chave: o login so funciona
        // com o hash registrado no Entra, e a chave de debug padrao do
        // Android Studio quebraria o login no teste. Sem assinatura.properties
        // o build ainda sai (com a chave padrao), so o login nao funciona.
        getByName("debug") {
            if (temAssinatura) signingConfig = signingConfigs.getByName("instituicao")
        }
        getByName("release") {
            isMinifyEnabled = false
            if (temAssinatura) signingConfig = signingConfigs.getByName("instituicao")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }

    // A interface vem da pasta web/ do repositorio, copiada a cada build. Nao
    // existe copia dela dentro de android/ para nao divergir.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("gerado/assets"))
}

val copiarInterface by tasks.registering(Sync::class) {
    from(rootProject.file("../web")) {
        // O simulador so serve no navegador do computador.
        exclude("simulador/**")
    }
    into(layout.buildDirectory.dir("gerado/assets/web"))
}
tasks.named("preBuild") { dependsOn(copiarInterface) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.microsoft.identity.client:msal:5.4.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
