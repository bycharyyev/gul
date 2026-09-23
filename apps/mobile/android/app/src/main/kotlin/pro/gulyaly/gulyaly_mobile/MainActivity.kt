package pro.gulyaly.gulyaly_mobile

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.ContactsContract
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
    private var contactResult: MethodChannel.Result? = null

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

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CONTACTS_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "pickPhone" -> pickPhone(result)
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

    /**
     * Hands the choosing to the Contacts app and reads back only what it returns.
     *
     * ACTION_PICK rather than READ_CONTACTS on purpose. The permission would let us read every
     * contact on the phone at any moment; this reads one row, the one the person tapped, through
     * a URI the Contacts app grants us for that single result. Nothing is prompted, nothing is
     * stored, and the app's manifest keeps its one permission -- INTERNET. It also keeps the Play
     * data-safety declaration honest without a word added to it: we never collect contacts.
     */
    private fun pickPhone(result: MethodChannel.Result) {
        // A second tap while the picker is open would otherwise strand the first Result and
        // crash on the duplicate reply.
        contactResult?.success(null)
        contactResult = result
        val intent = Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)
        try {
            startActivityForResult(intent, PICK_CONTACT)
        } catch (_: ActivityNotFoundException) {
            contactResult = null
            result.error("no_picker", "No contacts app on this device", null)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_CONTACT) return
        val reply = contactResult ?: return
        contactResult = null

        val uri = data?.data
        // Cancelling is an ordinary outcome, not a failure: null means "chose nobody".
        if (resultCode != Activity.RESULT_OK || uri == null) {
            reply.success(null)
            return
        }
        try {
            contentResolver.query(
                uri,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ),
                null,
                null,
                null,
            ).use { cursor ->
                if (cursor == null || !cursor.moveToFirst()) {
                    reply.success(null)
                    return
                }
                reply.success(
                    mapOf(
                        "phone" to cursor.getString(0),
                        "name" to cursor.getString(1),
                    ),
                )
            }
        } catch (e: SecurityException) {
            // The grant that came with the result can be gone by the time we read it, e.g. after
            // the process was killed behind the picker. Nothing to recover -- say so plainly.
            reply.error("no_access", e.message, null)
        }
    }

    private fun sharedTextOf(intent: Intent?): String? {
        if (intent == null || intent.action != Intent.ACTION_SEND) return null
        if (intent.type != "text/plain") return null
        return intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() }
    }

    private companion object {
        const val METHOD_CHANNEL = "pro.gulyaly/share"
        const val EVENT_CHANNEL = "pro.gulyaly/share/events"
        const val CONTACTS_CHANNEL = "pro.gulyaly/contacts"
        const val PICK_CONTACT = 4711
    }
}
