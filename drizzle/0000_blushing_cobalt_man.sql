CREATE TABLE IF NOT EXISTS `bank_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank_id` integer NOT NULL,
	`email` text NOT NULL,
	`is_default` integer DEFAULT 0,
	FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `banks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`parser_key` text,
	`is_default` integer DEFAULT 0,
	`is_active` integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer,
	`amount` real NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `budgets_category_id_unique` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'expense' NOT NULL,
	`is_default` integer DEFAULT 0,
	`sort_order` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`instrument_type` text DEFAULT 'mutual_fund' NOT NULL,
	`units` real DEFAULT 0 NOT NULL,
	`avg_cost` real DEFAULT 0 NOT NULL,
	`invested` real DEFAULT 0 NOT NULL,
	`note` text,
	`is_closed` integer DEFAULT 0,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT 0,
	`sort_order` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`billing_day` integer NOT NULL,
	`billing_days` text DEFAULT '[]' NOT NULL,
	`category_id` integer,
	`source_id` integer,
	`type` text DEFAULT 'expense' NOT NULL,
	`holding_id` integer,
	`investment_kind` text,
	`default_units` real,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT '(datetime(''now''))',
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`start_date` text,
	`end_date` text,
	`color` text,
	`emoji` text,
	`created_at` text DEFAULT '(datetime(''now''))'
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transaction_tags` (
	`transaction_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`transaction_id`, `tag_id`),
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'expense' NOT NULL,
	`amount` real NOT NULL,
	`merchant` text,
	`category_id` integer,
	`source_id` integer,
	`destination_source_id` integer,
	`subscription_id` integer,
	`holding_id` integer,
	`investment_kind` text,
	`units` real,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`gmail_message_id` text,
	`mini_transaction_id` integer,
	`reference_number` text,
	`parsed_by` text,
	`reimbursement_status` text DEFAULT 'none' NOT NULL,
	`reimbursable_amount` real,
	`reimbursed_at` text,
	`date` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT '(datetime(''now''))',
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE no action
);