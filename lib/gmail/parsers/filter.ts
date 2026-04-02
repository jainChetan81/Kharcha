export type FilterResult = {
  accepted: boolean;
  reason?: string;
};

const AMOUNT_PATTERN = /(?:INR|Rs\.?|₹)\s*[\d,]+\.?\d*/i;

const REJECT_KEYWORDS = [
  "otp",
  "one time password",
  "verification code",
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "threads",
  "e-mailer",
  "click here to view",
  "unable to view",
  "unsubscribe",
  "newsletter",
  "phone banking numbers",
  "reward points",
  "offers for you",
  "exclusive offer",
  "pre-approved",
  "effortless",
  "experience today",
  "bill management",
  "reminders, and secure",
  "download the app",
  "apply now",
];

export function filterEmail(body: string): FilterResult {
  if (body.length < 50) {
    return { accepted: false, reason: "too short" };
  }

  const lower = body.toLowerCase();

  for (const keyword of REJECT_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { accepted: false, reason: `contains "${keyword}"` };
    }
  }

  if (!AMOUNT_PATTERN.test(body)) {
    return { accepted: false, reason: "no amount found" };
  }

  return { accepted: true };
}
