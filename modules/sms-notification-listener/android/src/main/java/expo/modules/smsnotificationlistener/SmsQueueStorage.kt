package expo.modules.smsnotificationlistener

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileWriter

object SmsQueueStorage {
  private const val QUEUE_FILE_NAME = "sms_queue.jsonl"
  private val lock = Any()

  fun append(context: Context, entry: JSONObject) {
    synchronized(lock) {
      val queueFile = File(context.filesDir, QUEUE_FILE_NAME)
      FileWriter(queueFile, true).use { writer ->
        writer.appendLine(entry.toString())
      }
    }
  }

  fun readAll(context: Context): List<JSONObject> {
    synchronized(lock) {
      val result = mutableListOf<JSONObject>()
      val queueFile = File(context.filesDir, QUEUE_FILE_NAME)
      if (!queueFile.exists()) return result
      queueFile.forEachLine { line ->
        if (line.isNotBlank()) {
          try {
            result.add(JSONObject(line))
          } catch (_: Exception) {
            // Skip malformed lines
          }
        }
      }
      return result
    }
  }

  fun clear(context: Context) {
    synchronized(lock) {
      val queueFile = File(context.filesDir, QUEUE_FILE_NAME)
      if (queueFile.exists()) queueFile.delete()
    }
  }
}
