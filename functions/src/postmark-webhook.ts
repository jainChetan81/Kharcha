import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import {
  COLLECTIONS,
  ERROR_MESSAGES,
  SOURCE_TYPE,
} from "./constants";
import { parseWithGemini } from "./gemini";
import { parseEmail } from "./parsers";
import { stripHtml } from "./parsers/utils";
import type { PostmarkInboundEmail } from "./types";
import { parsedTransactionSchema } from "./validation";

const POSTMARK_WEBHOOK_TOKEN = defineSecret("POSTMARK_WEBHOOK_TOKEN");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const OTP_KEYWORDS = ["otp", "one time password", "verification code"];

// Postmark POSTs the parsed inbound email as JSON to this URL. The token in
// the path is the only auth — anyone with the full URL can post, so the
// secret is the URL itself.
//
// Once deployed: https://<region>-kharcha-jainchetan.cloudfunctions.net/postmarkWebhook/email/<TOKEN>
// Configure that URL in Postmark's inbound webhook settings.
export const postmarkWebhook = onRequest(
  {
    region: "asia-south1",
    secrets: [POSTMARK_WEBHOOK_TOKEN, GEMINI_API_KEY],
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: false,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // URL shape: /email/:token (mounted under /postmarkWebhook by Functions)
    const match = req.path.match(/^\/email\/([^/]+)$/);
    if (!match) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const token = match[1];

    if (token !== POSTMARK_WEBHOOK_TOKEN.value()) {
      res.status(401).json({ error: ERROR_MESSAGES.INVALID_WEBHOOK_TOKEN });
      return;
    }

    let body: PostmarkInboundEmail;
    try {
      body =
        typeof req.body === "string"
          ? (JSON.parse(req.body) as PostmarkInboundEmail)
          : (req.body as PostmarkInboundEmail);
    } catch {
      res.status(400).json({ ok: false, error: "Invalid JSON body" });
      return;
    }

    const {
      From,
      ToFull,
      BccFull,
      OriginalRecipient,
      Subject,
      TextBody,
      HtmlBody,
      MessageID,
    } = body;

    const messageId = MessageID ?? null;

    if (!From) {
      res.json({
        ok: true,
        parsed: false,
        message: ERROR_MESSAGES.MISSING_FIELDS,
      });
      return;
    }

    // Gmail forwarding puts the sync+ address in Bcc, not To. Check ToFull
    // first, then BccFull, then OriginalRecipient.
    const allRecipients = [...(ToFull || []), ...(BccFull || [])];
    const syncRecipient = allRecipients.find((r) =>
      /sync\+[^@]+@/.test(r.Email),
    );
    const toEmail =
      syncRecipient?.Email || OriginalRecipient || ToFull?.[0]?.Email || "";

    logger.info("[webhook] received", {
      from: From.split("@")[1] ?? "unknown",
      to: toEmail.split("@")[0] ?? "unknown",
    });

    const toMatch = toEmail.match(/sync\+([^@]+)@/);
    if (!toMatch) {
      res.json({
        ok: true,
        parsed: false,
        message: ERROR_MESSAGES.NOT_FORWARDING_ADDRESS,
      });
      return;
    }

    const forwardingEmail = toEmail;
    const db = getFirestore();

    const deviceQuery = await db
      .collection(COLLECTIONS.DEVICES)
      .where("forwarding_email", "==", forwardingEmail)
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      res.json({
        ok: true,
        parsed: false,
        message: ERROR_MESSAGES.DEVICE_NOT_FOUND,
      });
      return;
    }

    const deviceDoc = deviceQuery.docs[0];
    const deviceUid = deviceDoc.id;

    const subjectLower = (Subject || "").toLowerCase();
    if (OTP_KEYWORDS.some((kw) => subjectLower.includes(kw))) {
      res.json({
        ok: true,
        parsed: false,
        message: ERROR_MESSAGES.OTP_EMAIL,
      });
      return;
    }

    // Try regex parsers first (Subject + body combinations)
    const emailBody = TextBody || HtmlBody || "";
    let parsed = parseEmail(From, Subject, emailBody);
    if (!parsed && emailBody !== TextBody && TextBody) {
      parsed = parseEmail(From, Subject, TextBody);
    }

    let parsedBy = parsed ? "regex" : null;

    // Gemini fallback — single attempt after all regex fails.
    if (!parsed) {
      logger.info("[webhook] regex failed, trying Gemini");
      const cleanBody = stripHtml(TextBody || HtmlBody || "");
      const text = `Subject: ${Subject}\n\nBody:\n${cleanBody}`;
      const geminiResult = await parseWithGemini(
        GEMINI_API_KEY.value(),
        text,
        [],
      );
      if (geminiResult.parsed) {
        parsed = {
          amount: geminiResult.parsed.amount,
          merchant: geminiResult.parsed.merchant ?? "Unknown",
          date: geminiResult.parsed.date,
          type: geminiResult.parsed.type,
        };
        parsedBy = "gemini";
      } else if (geminiResult.error) {
        logger.warn("[webhook] gemini error", {
          error: geminiResult.error,
          message: geminiResult.errorMessage,
        });
      }
    }

    if (!parsed) {
      res.json({
        ok: true,
        parsed: false,
        message: ERROR_MESSAGES.UNPARSEABLE_EMAIL,
      });
      return;
    }

    const validated = parsedTransactionSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn("[webhook] validation failed", {
        message: validated.error.message,
      });
      res.json({ ok: true, parsed: false, message: "Validation failed" });
      return;
    }

    // Dedup by Postmark message id
    if (messageId) {
      const existing = await db
        .collection(COLLECTIONS.TRANSACTIONS)
        .where("postmark_message_id", "==", messageId)
        .limit(1)
        .get();
      if (!existing.empty) {
        logger.info("[webhook] duplicate message_id, skipping", { messageId });
        res.json({ ok: true, parsed: true, duplicate: true });
        return;
      }
    }

    await db.collection(COLLECTIONS.TRANSACTIONS).add({
      device_uid: deviceUid,
      amount: String(validated.data.amount),
      merchant: validated.data.merchant,
      date: validated.data.date,
      type: validated.data.type,
      source: From,
      source_type: SOURCE_TYPE.SYNCED,
      postmark_message_id: messageId,
      created_at: FieldValue.serverTimestamp(),
      fetched_at: null,
    });

    logger.info("[webhook] saved transaction", {
      device: deviceUid.slice(0, 8),
      parsedBy,
    });
    res.json({ ok: true, parsed: true });
  },
);
