import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing is read from android/key.properties, which is git-ignored and lives only on
// the machine that cuts releases. When it is absent -- every CI checkout, every other
// developer -- the release build type simply has no signing config, and Gradle fails loudly
// instead of quietly producing an APK signed with the debug key.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val hasReleaseKeystore = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "pro.gulyaly.gulyaly_mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // The permanent store identity. Chosen deliberately over the scaffolded
        // `pro.gulyaly.gulyaly_mobile`: an application id cannot be changed after the first
        // publish without shipping a different app, so it had to be settled before release.
        applicationId = "pro.gulyaly.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            // No fallback to the debug key. A debug-signed release cannot go to Play, and if
            // sideloaded it is signed by a key that ships with every Android SDK on earth.
            signingConfig = if (hasReleaseKeystore) signingConfigs.getByName("release") else null

            // R8: strips unused code and resources, and renames what is left. Roughly halves the
            // APK and makes casual decompilation meaningfully harder. Flutter's own Dart code is
            // AOT-compiled and unaffected -- this is about the Java/Kotlin side and the plugins.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

flutter {
    source = "../.."
}
