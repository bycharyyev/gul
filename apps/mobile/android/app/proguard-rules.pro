# Flutter's embedding is reached reflectively by the engine, so R8 cannot see the references and
# would strip it. These are the rules Flutter documents for a minified release build.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# flutter_secure_storage reaches androidx.security.crypto through the plugin channel.
-keep class androidx.security.crypto.** { *; }

# Strip logging from release builds outright. The app never logs a body or a header, but an
# accidental future `print` should not reach a user's device log either.
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Flutter's embedding contains PlayStoreDeferredComponentManager, which references the Play Core
# split-install API. This app does not use deferred components, so that library is not on the
# classpath and R8 fails the build on the dangling references. Silencing them is the documented
# fix; the code path is unreachable without the library.
-dontwarn com.google.android.play.core.**
-dontwarn io.flutter.embedding.engine.deferredcomponents.**
