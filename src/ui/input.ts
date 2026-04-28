import type { AskConfig } from "../config/schema.ts";
import {
	getAskKeyBindings,
	matchesBinding,
	matchesDigitShortcut,
} from "../constants/keymaps.ts";
import type { AskState } from "../types.ts";

export type AskInputCommand =
	| { kind: "moveTab"; delta: 1 | -1 }
	| { kind: "moveOption"; delta: 1 | -1 }
	| { kind: "toggleMulti" }
	| { kind: "openQuestionNote" }
	| { kind: "openOptionNote" }
	| { kind: "confirm" }
	| { kind: "cancel" }
	| { kind: "dismiss" }
	| { kind: "showSettings" }
	| { kind: "numberShortcut"; digit: number }
	| { kind: "editMoveTab"; delta: 1 | -1 }
	| { kind: "editMoveOption"; delta: 1 | -1 }
	| { kind: "editClose" }
	| { kind: "delegateToEditor" }
	| { kind: "ignore" };

export function getInputCommand(
	state: AskState,
	config: AskConfig,
	data: string,
	editingText = ""
): AskInputCommand {
	const bindings = getAskKeyBindings(config);
	if (matchesBinding(data, bindings.dismiss)) {
		return { kind: "dismiss" };
	}
	if (matchesBinding(data, bindings.settings) && editingText.length === 0) {
		return { kind: "showSettings" };
	}

	if (state.view.kind === "input" || state.view.kind === "note") {
		return getEditingInputCommand(bindings, data, editingText);
	}

	return getNavigationInputCommand(bindings, data);
}

function getEditingInputCommand(
	bindings: ReturnType<typeof getAskKeyBindings>,
	data: string,
	editingText: string
): AskInputCommand {
	if (matchesBinding(data, bindings.cancel)) {
		return { kind: "editClose" };
	}
	if (editingText.length === 0) {
		if (matchesBinding(data, bindings.nextTab)) {
			return { kind: "editMoveTab", delta: 1 };
		}
		if (matchesBinding(data, bindings.previousTab)) {
			return { kind: "editMoveTab", delta: -1 };
		}
		if (matchesBinding(data, bindings.previousOption)) {
			return { kind: "editMoveOption", delta: -1 };
		}
		if (matchesBinding(data, bindings.nextOption)) {
			return { kind: "editMoveOption", delta: 1 };
		}
	}
	return { kind: "delegateToEditor" };
}

function getNavigationInputCommand(
	bindings: ReturnType<typeof getAskKeyBindings>,
	data: string
): AskInputCommand {
	if (matchesBinding(data, bindings.nextTab)) {
		return { kind: "moveTab", delta: 1 };
	}
	if (matchesBinding(data, bindings.previousTab)) {
		return { kind: "moveTab", delta: -1 };
	}
	if (matchesBinding(data, bindings.previousOption)) {
		return { kind: "moveOption", delta: -1 };
	}
	if (matchesBinding(data, bindings.nextOption)) {
		return { kind: "moveOption", delta: 1 };
	}
	if (matchesBinding(data, bindings.toggle)) {
		return { kind: "toggleMulti" };
	}
	if (matchesBinding(data, bindings.confirm)) {
		return { kind: "confirm" };
	}
	if (matchesBinding(data, bindings.cancel)) {
		return { kind: "cancel" };
	}
	if (matchesBinding(data, bindings.questionNote)) {
		return { kind: "openQuestionNote" };
	}
	if (matchesBinding(data, bindings.optionNote)) {
		return { kind: "openOptionNote" };
	}

	const digit = matchesDigitShortcut(data);
	return digit === null
		? { kind: "ignore" }
		: { kind: "numberShortcut", digit };
}
