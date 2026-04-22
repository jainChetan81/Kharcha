package expo.modules.smsnotificationlistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject

class SmsNotificationListenerService : NotificationListenerService() {

  companion object {
    private const val TAG = "KharchaSmsListener"

    // Indian SMS sender IDs follow a loose pattern: two letters (operator
    // code), dash, then 4–8 uppercase letters or digits. Examples:
    //   bank rails  — VM-HDFCBK, AD-ICICIB, JD-AXISBK, JK-KOTAKB
    //   fintech     — BZ-PAYTMB, PP-PHNPBK, AX-GOOGLE
    //   numeric tail — AX-ICICI1 (used by some regional senders)
    // Widened from [A-Z]{4,6} to [A-Z0-9]{4,8} so fintechs and numeric
    // suffixes aren't dropped at the notification layer. The parser layer
    // (regex fallback → Gemini later) decides whether the text is actually
    // a transaction.
    private val SMS_SENDER_REGEX = Regex("^[A-Z]{2}-[A-Z0-9]{4,8}$")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    if (!SmsListenerPrefs.isEnabled(applicationContext)) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: return
    if (!SMS_SENDER_REGEX.matches(title)) return

    val text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
      ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
      ?: return

    val entry = JSONObject().apply {
      put("text", text)
      put("sender", title)
      put("package", sbn.packageName)
      put("received_at", System.currentTimeMillis())
    }

    try {
      SmsQueueStorage.append(applicationContext, entry)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to queue SMS notification", e)
    }
  }
}
