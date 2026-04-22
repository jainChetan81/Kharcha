package expo.modules.smsnotificationlistener

import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class SmsNotificationListenerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("SmsNotificationListener")

    Function("isNotificationAccessGranted") {
      val context = appContext.reactContext ?: return@Function false
      val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(context)
      return@Function enabledPackages.contains(context.packageName)
    }

    Function("openNotificationAccessSettings") {
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      null
    }

    Function("setEnabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@Function null
      SmsListenerPrefs.setEnabled(context, enabled)
      null
    }

    Function("isEnabled") {
      val context = appContext.reactContext ?: return@Function false
      return@Function SmsListenerPrefs.isEnabled(context)
    }

    // Returns a JSON-encoded array of queue entries. JS parses.
    // Using a string keeps the bridge surface simple and portable.
    Function("readQueue") {
      val context = appContext.reactContext ?: return@Function "[]"
      val array = JSONArray()
      SmsQueueStorage.readAll(context).forEach { array.put(it) }
      return@Function array.toString()
    }

    Function("clearQueue") {
      val context = appContext.reactContext ?: return@Function null
      SmsQueueStorage.clear(context)
      null
    }
  }
}
