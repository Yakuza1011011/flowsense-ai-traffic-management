CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`road_segment_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`road_segment_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`timestamp` text NOT NULL,
	`road_segment_id` text NOT NULL,
	`vehicle_count` integer NOT NULL,
	`average_speed_kmh` real NOT NULL,
	`occupancy_percent` real NOT NULL,
	`interval_minutes` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`timestamp`, `road_segment_id`)
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`road_segment_id` text NOT NULL,
	`issued_at` text NOT NULL,
	`horizon` integer NOT NULL,
	`speed` real NOT NULL,
	`model_version` text NOT NULL,
	PRIMARY KEY(`road_segment_id`, `issued_at`, `horizon`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_plans` (
	`road_segment_id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`row_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
