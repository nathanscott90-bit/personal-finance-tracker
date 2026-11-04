DROP TABLE `simplefin_accounts`;--> statement-breakpoint
-- Saved settings of the removed bank sync and wall display, including any
-- stored bank credentials. GLOB, not LIKE: "_" is a wildcard in LIKE.
DELETE FROM `settings` WHERE `key` GLOB 'eb_*' OR `key` GLOB 'simplefin_*' OR `key` GLOB 'wall_token_*';
