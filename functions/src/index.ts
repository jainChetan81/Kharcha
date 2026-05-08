import { initializeApp } from "firebase-admin/app";

initializeApp();

export { postmarkWebhook } from "./postmark-webhook";
export { aiParse } from "./ai-parse";
