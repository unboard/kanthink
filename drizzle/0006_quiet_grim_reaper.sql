CREATE TABLE `folder_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`user_id` text,
	`email` text,
	`role` text NOT NULL,
	`invited_by` text,
	`invited_at` integer,
	`accepted_at` integer,
	`created_at` integer,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `folder_shares_folder_idx` ON `folder_shares` (`folder_id`);--> statement-breakpoint
CREATE INDEX `folder_shares_user_idx` ON `folder_shares` (`user_id`);--> statement-breakpoint
CREATE INDEX `folder_shares_email_idx` ON `folder_shares` (`email`);--> statement-breakpoint
ALTER TABLE `channel_shares` ADD `folder_share_id` text REFERENCES folder_shares(id);--> statement-breakpoint
CREATE INDEX `channel_shares_folder_share_idx` ON `channel_shares` (`folder_share_id`);