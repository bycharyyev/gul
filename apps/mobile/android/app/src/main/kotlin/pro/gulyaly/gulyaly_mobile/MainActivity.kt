package pro.gulyaly.gulyaly_mobile

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Receives text shared into the app from the system share sheet.
 *
 * Deliberately hand-written rather than a share-receiving package: the entire payload we care
 * about is one string extra on an ACTION_SEND intent, and every such package additionally brings
 * file and image handling, an iOS share extension target, and a release cadence of its own. Two
 * channels and forty lines cover the case exactly.
 *
 * Two channels because a share arrives in two different situations. A cold start hands the intent
 * to the activity before Dart exists, so that text has to wait somewhere until Dart asks for it.
 * A share into an already-running app arrives at onNewIntent, long after Dart started, and has to
 * be pushed. `pending` bridges the gap in both directions, including the narrow case where a
 * second share lands before the stream listener has attached.
 */
class MainActivity : FlutterActivity() {
    private var pending: String? = null
    private var events: EventChannel.EventSink? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        pending = sharedTextOf(intent)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    // Taking it clears it: the same share must not reopen the buying form every
                    // time the app is resumed.
                    "takePending" -> {
                        result.success(pending)
                        pending = null
                    }
                    else -> result.notImplemented()
                }
            }

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL)
            .setStreamHandler(
                object : EventChannel.StreamHandler {
                    override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                        events = sink
                        val waiting = pending
                        if (waiting != null && sink != null) {
                            pending = null
                            sink.success(waiting)
                        }
                    }

                    override fun onCancel(arguments: Any?) {
                        events = null
                    }
                },
            )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Without this, getIntent() keeps returning the intent that originally launched the
        // activity, and a second share would replay the first one's link.
        setIntent(intent)
        val text = sharedTextOf(intent) ?: return
        val sink = events
        if (sink == null) pending = text else sink.success(text)
    }

    private fun sharedTextOf(intent: Intent?): String? {
        if (intent == null || intent.action != Intent.ACTION_SEND) return null
        if (intent.type != "text/plain") return null
        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() }
    }

    private companion object {
        const val METHOD_CHANNEL = "pro.gulyaly/share"
        const val EVENT_CHANNEL = "pro.gulyaly/share/events"
    }
}
