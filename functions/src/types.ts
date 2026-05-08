import type { TransactionType } from "./constants";

export type ParsedTransaction = {
  amount: number;
  merchant: string;
  date: string;
  type: TransactionType;
};

export type PostmarkEmailAddress = {
  Email: string;
  Name: string;
  MailboxHash?: string;
};

export type PostmarkInboundEmail = {
  From: string;
  ToFull: PostmarkEmailAddress[];
  BccFull?: PostmarkEmailAddress[];
  OriginalRecipient?: string;
  Subject: string;
  TextBody: string;
  HtmlBody: string;
  MessageID?: string;
};
