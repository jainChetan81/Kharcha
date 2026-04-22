package expo.modules.smsnotificationlistener

import android.content.Context

object SmsListenerPrefs {
  private const val PREFS_NAME = "sms_notification_listener"
  private const val KEY_ENABLED = "enabled"

  fun isEnabled(context: Context): Boolean {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getBoolean(KEY_ENABLED, false)
  }

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
  }
}
