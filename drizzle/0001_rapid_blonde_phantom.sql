ALTER TABLE `channels` ADD `is_global_help` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `instruction_cards` ADD `is_global_resource` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `instruction_cards` ADD `conversation_history` text;