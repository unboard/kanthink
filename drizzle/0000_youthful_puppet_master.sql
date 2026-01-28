CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`column_id` text NOT NULL,
	`title` text NOT NULL,
	`messages` text DEFAULT '[]',
	`cover_image_url` text,
	`summary` text,
	`summary_updated_at` integer,
	`source` text DEFAULT 'manual',
	`properties` text,
	`tags` text,
	`position` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false,
	`hide_completed_tasks` integer DEFAULT false,
	`created_by_instruction_id` text,
	`processed_by_instructions` text,
	`spawned_channel_ids` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cards_channel_idx` ON `cards` (`channel_id`);--> statement-breakpoint
CREATE INDEX `cards_column_idx` ON `cards` (`column_id`);--> statement-breakpoint
CREATE INDEX `cards_position_idx` ON `cards` (`column_id`,`is_archived`,`position`);--> statement-breakpoint
CREATE TABLE `channel_invite_links` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`token` text NOT NULL,
	`default_role` text DEFAULT 'viewer',
	`requires_approval` integer DEFAULT false,
	`expires_at` integer,
	`max_uses` integer,
	`use_count` integer DEFAULT 0,
	`created_by` text,
	`created_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_invite_links_token_unique` ON `channel_invite_links` (`token`);--> statement-breakpoint
CREATE INDEX `channel_invite_links_channel_idx` ON `channel_invite_links` (`channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channel_invite_links_token` ON `channel_invite_links` (`token`);--> statement-breakpoint
CREATE TABLE `channel_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`user_id` text,
	`email` text,
	`role` text NOT NULL,
	`invited_by` text,
	`invited_at` integer,
	`accepted_at` integer,
	`created_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `channel_shares_channel_idx` ON `channel_shares` (`channel_id`);--> statement-breakpoint
CREATE INDEX `channel_shares_user_idx` ON `channel_shares` (`user_id`);--> statement-breakpoint
CREATE INDEX `channel_shares_email_idx` ON `channel_shares` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `channel_shares_channel_user` ON `channel_shares` (`channel_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`status` text DEFAULT 'active',
	`ai_instructions` text DEFAULT '',
	`include_backside_in_ai` integer DEFAULT false,
	`suggestion_mode` text DEFAULT 'off',
	`property_definitions` text,
	`tag_definitions` text,
	`questions` text,
	`instruction_history` text,
	`unlinked_task_order` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channels_owner_idx` ON `channels` (`owner_id`);--> statement-breakpoint
CREATE TABLE `columns` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`name` text NOT NULL,
	`instructions` text,
	`processing_prompt` text,
	`auto_process` integer DEFAULT false,
	`is_ai_target` integer DEFAULT false,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `columns_channel_idx` ON `columns` (`channel_id`);--> statement-breakpoint
CREATE INDEX `columns_position_idx` ON `columns` (`channel_id`,`position`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_collapsed` integer DEFAULT false,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folders_user_idx` ON `folders` (`user_id`);--> statement-breakpoint
CREATE TABLE `instruction_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`context_columns` text,
	`run_mode` text DEFAULT 'manual',
	`card_count` integer,
	`interview_questions` text,
	`is_enabled` integer DEFAULT false,
	`triggers` text,
	`safeguards` text,
	`last_executed_at` integer,
	`next_scheduled_run` integer,
	`daily_execution_count` integer DEFAULT 0,
	`daily_count_reset_at` integer,
	`execution_history` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `instruction_cards_channel_idx` ON `instruction_cards` (`channel_id`);--> statement-breakpoint
CREATE TABLE `instruction_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`instruction_id` text NOT NULL,
	`instruction_title` text NOT NULL,
	`changes` text NOT NULL,
	`undone` integer DEFAULT false,
	`timestamp` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instruction_id`) REFERENCES `instruction_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `instruction_runs_channel_idx` ON `instruction_runs` (`channel_id`);--> statement-breakpoint
CREATE INDEX `instruction_runs_instruction_idx` ON `instruction_runs` (`instruction_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`card_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '',
	`status` text DEFAULT 'not_started',
	`assigned_to` text,
	`due_date` integer,
	`completed_at` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_channel_idx` ON `tasks` (`channel_id`);--> statement-breakpoint
CREATE INDEX `tasks_card_idx` ON `tasks` (`card_id`);--> statement-breakpoint
CREATE TABLE `usage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_type` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_channel_org` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`folder_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_channel_org_unique` ON `user_channel_org` (`user_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `user_channel_org_user_idx` ON `user_channel_org` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_channel_org_folder_idx` ON `user_channel_org` (`folder_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`email_verified` integer,
	`image` text,
	`stripe_customer_id` text,
	`subscription_id` text,
	`subscription_status` text DEFAULT 'free',
	`tier` text DEFAULT 'free',
	`current_period_end` integer,
	`byok_provider` text,
	`byok_api_key` text,
	`byok_model` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
