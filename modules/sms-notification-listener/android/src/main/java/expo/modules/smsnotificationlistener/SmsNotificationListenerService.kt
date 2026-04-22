package expo.modules.smsnotificationlistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject

class SmsNotificationListenerService : NotificationListenerService() {

  companion object {
    private const val TAG = "KharchaSmsListener"

    // Indian bank SMS sender IDs follow a pattern like "VM-HDFCBK", "AD-ICICIB",
    // "JD-AXISBK". Two letters (operator code), dash, 4-6 letters (bank code).
    // Matching this at the notification-title layer filters out nearly all
    // non-SMS notifications without needing a package-name whitelist.
    private val SMS_SENDER_REGEX = Regex("^[A-Z]{2}-[A-Z]{4,6}$")
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
