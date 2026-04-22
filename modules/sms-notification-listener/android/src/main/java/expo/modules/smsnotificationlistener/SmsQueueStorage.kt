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

  /**
   * Remove entries with `received_at <= cutoffMs`, preserving anything newer.
   *
   * Used after the JS layer drains a snapshot of the queue: the snapshot is
   * processed, and we only want to delete the entries that were actually
   * read — any notification that landed *during* processing must survive.
   */
  fun clearBefore(context: Context, cutoffMs: Long) {
    synchronized(lock) {
      val queueFile = File(context.filesDir, QUEUE_FILE_NAME)
      if (!queueFile.exists()) return
      val survivors = mutableListOf<String>()
      queueFile.forEachLine { line ->
        if (line.isBlank()) return@forEachLine
        try {
          val entry = JSONObject(line)
          val receivedAt = entry.optLong("received_at", 0L)
          if (receivedAt > cutoffMs) survivors.add(line)
        } catch (_: Exception) {
          // Drop malformed lines — same behaviour as readAll.
        }
      }
      if (survivors.isEmpty()) {
        queueFile.delete()
      } else {
        FileWriter(queueFile, false).use { writer ->
          survivors.forEach { writer.appendLine(it) }
        }
      }
    }
  }
}
