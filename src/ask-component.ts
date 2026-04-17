import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import {
	applyNumberShortcut,
	cancelFlow,
	confirmCurrentSelection,
	createInitialState,
	enterInputMode,
	getAnswer,
	getCurrentQuestion,
	getRenderableOptions,
	isQuestionAnswered,
	isSubmitTab,
	moveOption,
	moveTab,
	saveCustomAnswer,
	submitCustomAnswer,
	toAskResult,
	toggleCurrentMultiOption,
} from "./state.ts";
import type { AskParams, AskResult, AskState } from "./types.ts";

export async function runAskFlow(
	ctx: ExtensionContext,
	params: AskParams,
): Promise<AskResult> {
	return ctx.ui.custom<AskResult>((tui, theme, keybindings, done) => {
		let state: AskState = createInitialState(params);
		let cachedLines: string[] | undefined;
		let suppressAutoInputForSelection = false;
		const newLineHint = formatKeybindingLabel(
			keybindings.getKeys("tui.input.newLine")[0] ?? "shift+enter",
		);

		const editorTheme: EditorTheme = {
			borderColor: (s) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			},
		};
		const editor = new Editor(tui, editorTheme);

		editor.onSubmit = (value) => {
			suppressAutoInputForSelection = false;
			state = submitCustomAnswer(state, value);
			editor.setText("");
			refresh();
			maybeFinish();
		};

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function maybeFinish() {
			if (state.completed) {
				done(toAskResult(state));
			}
		}

		function hydrateEditorForInputMode() {
			if (state.mode !== "input" || !state.inputQuestionId) {
				return;
			}
			const existingText =
				getAnswer(state, state.inputQuestionId)?.customText ?? "";
			editor.setText(existingText);
		}

		function syncInputModeWithSelection() {
			if (isSubmitTab(state)) {
				return;
			}

			const question = getCurrentQuestion(state);
			if (!question) {
				return;
			}

			const option = getRenderableOptions(question)[state.optionIndex];
			if (
				!option?.isOther ||
				suppressAutoInputForSelection ||
				state.mode === "input"
			) {
				return;
			}

			state = enterInputMode(state, question.id);
			hydrateEditorForInputMode();
		}

		syncInputModeWithSelection();

		function handleInput(data: string) {
			if (state.mode === "input") {
				if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
					state = saveCustomAnswer(state, editor.getText());
					suppressAutoInputForSelection = false;
					state = moveTab(state, 1);
					syncInputModeWithSelection();
					refresh();
					return;
				}
				if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
					state = saveCustomAnswer(state, editor.getText());
					suppressAutoInputForSelection = false;
					state = moveTab(state, -1);
					syncInputModeWithSelection();
					refresh();
					return;
				}
				if (matchesKey(data, Key.escape)) {
					state = saveCustomAnswer(state, editor.getText());
					suppressAutoInputForSelection = true;
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
				suppressAutoInputForSelection = false;
				state = moveTab(state, 1);
				syncInputModeWithSelection();
				refresh();
				return;
			}
			if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
				suppressAutoInputForSelection = false;
				state = moveTab(state, -1);
				syncInputModeWithSelection();
				refresh();
				return;
			}
			if (matchesKey(data, Key.up)) {
				suppressAutoInputForSelection = false;
				state = moveOption(state, -1);
				syncInputModeWithSelection();
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				suppressAutoInputForSelection = false;
				state = moveOption(state, 1);
				syncInputModeWithSelection();
				refresh();
				return;
			}
			if (matchesKey(data, Key.space)) {
				const question = getCurrentQuestion(state);
				if (question?.type === "multi") {
					suppressAutoInputForSelection = false;
					state = toggleCurrentMultiOption(state);
					if (state.mode === "input") {
						hydrateEditorForInputMode();
					}
					refresh();
					return;
				}
			}
			if (matchesKey(data, Key.enter)) {
				suppressAutoInputForSelection = false;
				state = confirmCurrentSelection(state);
				if (state.mode === "input") {
					hydrateEditorForInputMode();
				}
				refresh();
				maybeFinish();
				return;
			}
			if (matchesKey(data, Key.escape)) {
				state = cancelFlow(state);
				refresh();
				maybeFinish();
				return;
			}

			const digit = parseDigit(data);
			if (digit !== null) {
				suppressAutoInputForSelection = false;
				state = applyNumberShortcut(state, digit);
				if (state.mode === "input") {
					hydrateEditorForInputMode();
				}
				refresh();
				return;
			}
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;

			const lines: string[] = [];
			const add = (text = "") => lines.push(truncateToWidth(text, width));
			const question = getCurrentQuestion(state);
			const options = getRenderableOptions(question);

			add(theme.fg("accent", "─".repeat(Math.max(1, width))));

			if (state.title) {
				add(` ${theme.fg("accent", theme.bold(state.title))}`);
				add();
			}

			add(renderTabs(state, theme, width));
			add();

			if (isSubmitTab(state)) {
				renderSubmit(lines, state, theme, width);
			} else if (question) {
				add(` ${theme.fg("text", question.prompt)}`);
				add();

				const isMulti = question.type === "multi";
				const answer = getAnswer(state, question.id);
				for (let i = 0; i < options.length; i++) {
					const option = options[i];
					const selected = i === state.optionIndex;
					const isAnsweredOption = option.isOther
						? !!answer?.customText
						: !!answer?.values.includes(option.value);
					const pointer = selected ? theme.fg("accent", "❯ ") : "  ";
					const prefix =
						isMulti && !option.isOther
							? `[${isAnsweredOption ? "x" : " "}] `
							: "";
					const optionColor = isAnsweredOption
						? "success"
						: selected
							? "accent"
							: "text";
					add(
						`${pointer}${theme.fg(optionColor, `${i + 1}. ${prefix}${option.label}`)}`,
					);
					if (option.description) {
						add(`     ${theme.fg("muted", option.description)}`);
					}
					if (question.type === "code-review" && selected && option.preview) {
						add();
						for (const previewLine of option.preview.split("\n")) {
							add(`     ${theme.fg("dim", previewLine)}`);
						}
						add();
					}
					if (option.isOther && selected && state.mode === "input") {
						for (const editorLine of editor.render(Math.max(8, width - 7))) {
							add(`     ${renderInputLine(editorLine, width - 5, theme)}`);
						}
						add(
							`     ${theme.fg("dim", `${newLineHint} newline · Enter submit · Esc save and close`)}`,
						);
					}
					if (option.isOther && state.mode !== "input") {
						const customText = answer?.customText;
						if (customText) {
							for (const customLine of customText.split("\n")) {
								add(`     ${theme.fg("muted", customLine)}`);
							}
						}
					}
				}
			}

			const footer = renderFooter(state, theme);
			if (footer) {
				add();
				add(footer);
			}
			add(theme.fg("accent", "─".repeat(Math.max(1, width))));

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate() {
				cachedLines = undefined;
			},
			handleInput,
		};
	});
}

function renderTabs(
	state: AskState,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
): string {
	const segments: string[] = [theme.fg("dim", "← ")];
	for (let index = 0; index < state.questions.length; index++) {
		const question = state.questions[index];
		const active = state.currentTab === index;
		const answered = isQuestionAnswered(state, question.id);
		const marker = answered ? "☒" : "☐";
		const text = ` ${marker} ${question.label} `;
		segments.push(
			active
				? theme.bg("selectedBg", theme.fg("text", text))
				: theme.fg(answered ? "success" : "muted", text),
		);
	}

	const submitActive = isSubmitTab(state);
	const submitText = " ✔ Submit ";
	segments.push(
		submitActive
			? theme.bg("selectedBg", theme.fg("text", submitText))
			: theme.fg("success", submitText),
	);
	segments.push(theme.fg("dim", " →"));

	return truncateToWidth(` ${segments.join(" ")}`, width);
}

function renderSubmit(
	lines: string[],
	state: AskState,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
) {
	const add = (text = "") => lines.push(truncateToWidth(text, width));
	add(` ${theme.fg("accent", theme.bold("Review your answers"))}`);
	add();

	for (const question of state.questions) {
		const answer = getAnswer(state, question.id);
		add(` ${theme.fg("muted", `● ${question.prompt}`)}`);
		if (!answer) {
			add(`   ${theme.fg("warning", "→ (unanswered)")}`);
			continue;
		}
		const answerText = answer.customText ?? answer.labels.join(", ");
		add(
			`   ${theme.fg(answer.customText ? "text" : "success", `→ ${answerText}`)}`,
		);
	}

	add();
	add(` ${theme.fg("success", "Ready to submit your answers?")}`);
	add();

	const options = ["Submit answers", "Cancel"];
	for (let i = 0; i < options.length; i++) {
		const selected = i === state.submitIndex;
		const prefix = selected ? theme.fg("accent", "❯ ") : "  ";
		add(
			`${prefix}${theme.fg(selected ? "accent" : "text", `${i + 1}. ${options[i]}`)}`,
		);
	}
}

function renderFooter(
	state: AskState,
	theme: ExtensionContext["ui"]["theme"],
): string {
	if (state.mode === "input") {
		return "";
	}

	const question = getCurrentQuestion(state);
	if (isSubmitTab(state)) {
		return theme.fg("dim", " ↑↓ select · Enter confirm · Esc cancel");
	}
	if (question?.type === "multi") {
		return theme.fg(
			"dim",
			" ⇆ tab · ↑↓ select · space toggle · enter continue · esc dismiss · 1-9 quick toggle",
		);
	}
	return theme.fg("dim", " ⇆ tab · ↑↓ select · enter confirm · esc dismiss");
}

function parseDigit(data: string): number | null {
	return /^[1-9]$/.test(data) ? Number(data) : null;
}

function renderInputLine(
	line: string,
	availableWidth: number,
	theme: ExtensionContext["ui"]["theme"],
): string {
	const innerWidth = Math.max(4, availableWidth - 2);
	const truncated = truncateToWidth(line, innerWidth);
	const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
	return theme.bg("toolPendingBg", ` ${truncated}${padding} `);
}

function formatKeybindingLabel(key: string): string {
	return key
		.split("+")
		.map((part) => {
			if (part.length <= 1) {
				return part.toUpperCase();
			}
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join("+");
}
