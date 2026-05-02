import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { migrateAskConfig } from "../src/config/migrate.ts";
import { CURRENT_ASK_CONFIG_SCHEMA_VERSION } from "../src/config/migrations/index.ts";

const INVALID_CONFIG_PATTERN = /Config was invalid or unsupported/;

const currentConfigFile = {
	schemaVersion: CURRENT_ASK_CONFIG_SCHEMA_VERSION,
	behaviour: DEFAULT_ASK_CONFIG.behaviour,
	keymaps: DEFAULT_ASK_CONFIG.keymaps,
};

test("config migration framework accepts the current schema version", () => {
	const result = migrateAskConfig(currentConfigFile);

	assert.equal(result.migrated, false);
	assert.deepEqual(result.config, DEFAULT_ASK_CONFIG);
});

test("config migration framework rejects unsupported future schema versions", () => {
	assert.throws(
		() =>
			migrateAskConfig({
				...currentConfigFile,
				schemaVersion: CURRENT_ASK_CONFIG_SCHEMA_VERSION + 1,
			}),
		INVALID_CONFIG_PATTERN
	);
});

test("config migration framework rejects unversioned config files", () => {
	assert.throws(
		() =>
			migrateAskConfig({
				behaviour: DEFAULT_ASK_CONFIG.behaviour,
				keymaps: DEFAULT_ASK_CONFIG.keymaps,
			}),
		INVALID_CONFIG_PATTERN
	);
});
