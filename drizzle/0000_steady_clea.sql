CREATE TABLE `import_batches` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`work_count` integer NOT NULL,
	`light_count` integer NOT NULL,
	`note_count` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `light_days` (
	`user_id` text NOT NULL,
	`work_id` text NOT NULL,
	`light_date` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `work_id`, `light_date`)
);
--> statement-breakpoint
CREATE INDEX `light_days_user_date_idx` ON `light_days` (`user_id`,`light_date`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`work_id` text NOT NULL,
	`note_date` text NOT NULL,
	`body` text NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `notes_user_work_date_idx` ON `notes` (`user_id`,`work_id`,`note_date`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`migrated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `works` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`archive` text NOT NULL,
	`title` text NOT NULL,
	`english` text NOT NULL,
	`type` text NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`creator` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`rating` text DEFAULT '' NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`color` text NOT NULL,
	`timeline_colors` text NOT NULL,
	`cover_key` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `works_user_updated_idx` ON `works` (`user_id`,`updated_at`);