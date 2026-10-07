ALTER TABLE `job` ADD `mode` text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `error` text;