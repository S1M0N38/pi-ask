import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
} from "@mariozechner/pi-tui";
import {
	allRequiredAnswered,
	applyNumberShortcut,
	cancelFlow,
	confirmCurrentSelection,
	createInitialState,
	getAnswer,
	getCurrentQuestion,
	getRenderableOptions,
	isQuestionAnswered,
	isSubmitTab,
	moveOption,
	moveTab,
	submitCustomAnswer,
	toAskResult,
	toggleCurrentMultiOption,
} from "./state.ts";
import type { AskParams, AskResult, AskState } from "./types.ts";

export async function runAskFlow(
	ctx: ExtensionContext,
	params: AskParams,
): Promise<AskResult> {
	return ctx.ui.custom<AskResult>((tui, theme, _keybindings, done) => {
		let state: AskState = createInitialState(params);
		let cachedLines: string[] | undefined;

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

		function handleInput(data: string) {
			if (state.mode === "input") {
				if (matchesKey(data, Key.escape)) {
					state = cancelFlow(state);
					if (!state.completed) {
						refresh();
						return;
					}
					maybeFinish();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
				state = moveTab(state, 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
				state = moveTab(state, -1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.up)) {
				state = moveOption(state, -1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				state = moveOption(state, 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.space)) {
				const question = getCurrentQuestion(state);
				if (question?.type === "multi") {
					state = toggleCurrentMultiOption(state);
					refresh();
					return;
				}
			}
			if (matchesKey(data, Key.enter)) {
				state = confirmCurrentSelection(state);
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
				state = applyNumberShortcut(state, digit);
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
				for (let i = 0; i < options.length; i++) {
					const option = options[i];
					const selected = i === state.optionIndex;
					const checked = !!getAnswer(state, question.id)?.values.includes(
						option.value,
					);
					const pointer = selected ? theme.fg("accent", "❯ ") : "  ";
					const prefix =
						isMulti && !option.isOther ? `[${checked ? "x" : " "}] ` : "";
					const optionColor = selected ? "accent" : "text";
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
				}

				if (state.mode === "input") {
					add();
					add(` ${theme.fg("muted", "Your answer:")}`);
					for (const editorLine of editor.render(Math.max(1, width - 2))) {
						add(` ${editorLine}`);
					}
					add();
				}
			}

			add();
			add(renderFooter(state, theme));
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
			: theme.fg(allRequiredAnswered(state) ? "success" : "dim", submitText),
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
		add(
			`   ${theme.fg("text", `→ ${answer ? answer.labels.join(", ") : "(unanswered)"}`)}`,
		);
	}

	add();
	add(
		` ${allRequiredAnswered(state) ? theme.fg("success", "Ready to submit your answers?") : theme.fg("warning", "Answer all required questions before submitting.")}`,
	);
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
		return theme.fg("dim", " Enter submit · Esc go back");
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
	return theme.fg(
		"dim",
		" ⇆ tab · ↑↓ select · enter confirm · esc dismiss · 1-9 quick select",
	);
}

function parseDigit(data: string): number | null {
	return /^[1-9]$/.test(data) ? Number(data) : null;
}
