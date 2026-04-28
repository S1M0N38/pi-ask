import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAskConfigPath, getAskConfigStore } from "../config/store.ts";
import { AskSettingsModal } from "./settings-modal.ts";

export async function showAskSettingsModal(
	ui: Pick<ExtensionContext, "ui">["ui"]
): Promise<void> {
	const store = getAskConfigStore();
	const { config, notice } = await store.ensureLoaded();
	return ui.custom<void>(
		(tui, theme, _keybindings, done) =>
			new AskSettingsModal(theme, {
				configPath: getAskConfigPath(),
				notice,
				onClose: () => {
					done();
				},
				onSave: async (nextConfig) => store.save(nextConfig),
				savedConfig: config,
				tui,
			}),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				margin: 1,
				maxHeight: "90%",
				minWidth: 26,
				width: 72,
			},
		}
	);
}
