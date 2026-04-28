import {
	type AskConfigurableKeyAction,
	normalizeConfiguredKeymaps,
} from "../constants/keymaps.ts";
import { normalizeAskConfig } from "./defaults.ts";
import type { AskConfig, AskConfigFileV1 } from "./schema.ts";
import { validateAskConfigFileV1 } from "./schema.ts";

export class AskConfigMigrationError extends Error {
	readonly reason: "invalid_or_unsupported" | "migration_failed";

	constructor(
		message: string,
		reason: "invalid_or_unsupported" | "migration_failed"
	) {
		super(message);
		this.reason = reason;
	}
}

export interface AskConfigMigrationResult {
	config: AskConfig;
	migrated: boolean;
	notice?: string;
}

export function migrateAskConfig(raw: unknown): AskConfigMigrationResult {
	if (!(raw && typeof raw === "object")) {
		throw new AskConfigMigrationError(
			"Config was invalid or unsupported.",
			"invalid_or_unsupported"
		);
	}

	if (!("schemaVersion" in raw)) {
		throw new AskConfigMigrationError(
			"Config was invalid or unsupported.",
			"invalid_or_unsupported"
		);
	}

	if ((raw as { schemaVersion?: unknown }).schemaVersion !== 1) {
		throw new AskConfigMigrationError(
			"Config was invalid or unsupported.",
			"invalid_or_unsupported"
		);
	}

	if (!validateAskConfigFileV1.Check(raw)) {
		throw new AskConfigMigrationError(
			"Config was invalid or unsupported.",
			"invalid_or_unsupported"
		);
	}

	const config = normalizeAskConfig(raw as AskConfigFileV1);
	const keymapsResult = normalizeConfiguredKeymaps(
		(raw as AskConfigFileV1).keymaps as
			| Partial<Record<AskConfigurableKeyAction, unknown>>
			| undefined
	);
	if (!keymapsResult.ok) {
		return {
			config: {
				...config,
				keymaps: normalizeAskConfig().keymaps,
			},
			migrated: false,
			notice: `${keymapsResult.error} Using default ask keymaps for this session. Edit the config and restart pi or run /reload.`,
		};
	}

	return {
		config: {
			...config,
			keymaps: keymapsResult.keymaps,
		},
		migrated: false,
	};
}
