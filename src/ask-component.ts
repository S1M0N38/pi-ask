import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";
import { wrapText } from "./text.ts";
import {
	applyNumberShortcut,
	cancelFlow,
	confirmCurrentSelection,
	createInitialState,
	enterInputMode,
	enterOptionNoteMode,
	enterQuestionNoteMode,
	getAnswer,
	getCurrentQuestion,
	getOptionNote,
	getQuestionNote,
	getRenderableOptions,
	isQuestionAnswered,
	isSubmitTab,
	moveOption,
	moveTab,
	saveCustomAnswer,
	saveNote,
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
			if (state.mode === "input") {
				state = submitCustomAnswer(state, value);
			} else if (state.mode === "note") {
				state = saveNote(state, value);
			}
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

		function hydrateEditorForCurrentMode() {
			if (state.mode === "input" && state.inputQuestionId) {
				const existingText =
					getAnswer(state, state.inputQuestionId)?.customText ?? "";
				editor.setText(existingText);
				return;
			}
			if (state.mode !== "note" || !state.noteQuestionId) {
				return;
			}
			const existingText = state.noteOptionValue
				? (getOptionNote(state, state.noteQuestionId, state.noteOptionValue) ??
					"")
				: (getQuestionNote(state, state.noteQuestionId) ?? "");
			editor.setText(existingText);
		}

		function syncInputModeWithSelection() {
			if (state.mode === "note" || isSubmitTab(state)) {
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
			hydrateEditorForCurrentMode();
		}

		syncInputModeWithSelection();

		function handleInput(data: string) {
			if (state.mode === "input" || state.mode === "note") {
				if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
					state = saveEditorAndMoveTab(1);
					syncInputModeWithSelection();
					refresh();
					return;
				}
				if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
					state = saveEditorAndMoveTab(-1);
					syncInputModeWithSelection();
					refresh();
					return;
				}
				if (matchesKey(data, Key.escape)) {
					state = saveEditorWithoutAdvancing();
					suppressAutoInputForSelection = state.mode !== "input";
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
						hydrateEditorForCurrentMode();
					}
					refresh();
					return;
				}
			}
			if (isQuestionNoteShortcut(data)) {
				const question = getCurrentQuestion(state);
				if (question && !isSubmitTab(state)) {
					state = enterQuestionNoteMode(state, question.id);
					hydrateEditorForCurrentMode();
					refresh();
				}
				return;
			}
			if (isOptionNoteShortcut(data)) {
				const question = getCurrentQuestion(state);
				const option = question
					? getRenderableOptions(question)[state.optionIndex]
					: undefined;
				if (question && option && !option.isOther && !isSubmitTab(state)) {
					state = enterOptionNoteMode(state, question.id, option.value);
					hydrateEditorForCurrentMode();
					refresh();
				}
				return;
			}
			if (matchesKey(data, Key.enter)) {
				suppressAutoInputForSelection = false;
				state = confirmCurrentSelection(state);
				if (state.mode === "input") {
					hydrateEditorForCurrentMode();
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
					hydrateEditorForCurrentMode();
				}
				refresh();
			}
		}

		function saveEditorWithoutAdvancing(): AskState {
			const text = editor.getText();
			editor.setText("");
			if (state.mode === "input") {
				suppressAutoInputForSelection = true;
				return saveCustomAnswer(state, text);
			}
			return saveNote(state, text);
		}

		function saveEditorAndMoveTab(delta: number): AskState {
			const nextState = saveEditorWithoutAdvancing();
			suppressAutoInputForSelection = false;
			return moveTab(nextState, delta);
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
				renderQuestionContent({
					lines,
					state,
					question,
					options,
					theme,
					width,
					editor,
					newLineHint,
				});
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
	pushWrappedText(
		lines,
		"Review your answers",
		width,
		theme,
		"accent",
		" ",
		" ",
	);
	lines.push("");

	const submittedAnswers = toAskResult(state).answers;
	for (const question of state.questions) {
		const answer = submittedAnswers[question.id];
		pushWrappedText(
			lines,
			question.prompt,
			width,
			theme,
			"muted",
			" ● ",
			"   ",
		);
		if (!answer) {
			lines.push(
				truncateToWidth(`   ${theme.fg("warning", "→ (unanswered)")}`, width),
			);
			continue;
		}
		const answerText = answer.customText ?? answer.labels.join(", ");
		if (answerText) {
			pushWrappedText(
				lines,
				`→ ${answerText}`,
				width,
				theme,
				answer.customText ? "text" : "success",
				"   ",
				"     ",
			);
		}
		if (answer.note) {
			pushWrappedText(
				lines,
				`Question note: ${answer.note}`,
				width,
				theme,
				"muted",
				"   ",
				"     ",
			);
		}
		for (let index = 0; index < answer.values.length; index++) {
			const value = answer.values[index];
			const label = answer.labels[index] ?? value;
			const note = answer.optionNotes?.[value];
			if (!note) {
				continue;
			}
			pushWrappedText(
				lines,
				`${label} note: ${note}`,
				width,
				theme,
				"muted",
				"   ",
				"     ",
			);
		}
	}

	lines.push("");
	pushWrappedText(
		lines,
		"Ready to submit your answers?",
		width,
		theme,
		"success",
		" ",
		" ",
	);
	lines.push("");

	const options = ["Submit answers", "Cancel"];
	for (let i = 0; i < options.length; i++) {
		const selected = i === state.submitIndex;
		const prefix = selected ? "❯ " : "  ";
		pushWrappedText(
			lines,
			`${i + 1}. ${options[i]}`,
			width,
			theme,
			selected ? "accent" : "text",
			prefix,
			prefix,
		);
	}
}

function renderQuestionContent(args: {
	lines: string[];
	state: AskState;
	question: NonNullable<ReturnType<typeof getCurrentQuestion>>;
	options: ReturnType<typeof getRenderableOptions>;
	theme: ExtensionContext["ui"]["theme"];
	width: number;
	editor: Editor;
	newLineHint: string;
}) {
	const { lines, state, question, options, theme, width, editor, newLineHint } =
		args;

	renderQuestionPrompt(lines, question.prompt, theme, width);
	renderQuestionNote(
		lines,
		state,
		question.id,
		theme,
		width,
		editor,
		newLineHint,
	);

	if (question.type === "preview") {
		renderPreviewQuestion(
			lines,
			state,
			question,
			options,
			theme,
			width,
			editor,
			newLineHint,
		);
		return;
	}

	renderStandardQuestion(
		lines,
		state,
		question,
		options,
		theme,
		width,
		editor,
		newLineHint,
	);
}

function renderQuestionPrompt(
	lines: string[],
	prompt: string,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
) {
	pushWrappedText(lines, prompt, width, theme, "text", " ", " ");
	lines.push("");
}

function renderQuestionNote(
	lines: string[],
	state: AskState,
	questionId: string,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
	editor: Editor,
	newLineHint: string,
) {
	const existingNote = getQuestionNote(state, questionId);
	if (
		state.mode === "note" &&
		state.noteQuestionId === questionId &&
		!state.noteOptionValue
	) {
		pushWrappedText(lines, "Question note", width, theme, "accent", " ", " ");
		for (const editorLine of editor.render(Math.max(8, width - 5))) {
			lines.push(
				truncateToWidth(
					`   ${renderInputLine(editorLine, width - 3, theme)}`,
					width,
				),
			);
		}
		lines.push(
			truncateToWidth(
				`   ${theme.fg("dim", `${newLineHint} newline · Enter save · Esc save and close`)}`,
				width,
			),
		);
		lines.push("");
		return;
	}

	if (!existingNote) {
		return;
	}
	pushWrappedText(
		lines,
		`Question note: ${existingNote}`,
		width,
		theme,
		"muted",
		" ",
		"   ",
	);
	lines.push("");
}

function renderStandardQuestion(
	lines: string[],
	state: AskState,
	question: NonNullable<ReturnType<typeof getCurrentQuestion>>,
	options: ReturnType<typeof getRenderableOptions>,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
	editor: Editor,
	newLineHint: string,
) {
	const isMulti = question.type === "multi";
	const answer = getAnswer(state, question.id);
	for (let i = 0; i < options.length; i++) {
		const option = options[i];
		const selected = i === state.optionIndex;
		const optionNote = option.isOther
			? undefined
			: answer?.optionNotes?.[option.value];
		const isAnsweredOption = option.isOther
			? !!answer?.customText
			: !!answer?.values.includes(option.value);
		const pointer = selected ? "❯ " : "  ";
		const prefix =
			isMulti && !option.isOther ? `[${isAnsweredOption ? "x" : " "}] ` : "";
		const optionColor = isAnsweredOption
			? "success"
			: selected
				? "accent"
				: "text";
		pushWrappedText(
			lines,
			`${i + 1}. ${prefix}${option.label}`,
			width,
			theme,
			optionColor,
			pointer,
			" ".repeat(visibleWidth(pointer)),
		);
		if (option.description) {
			pushWrappedText(
				lines,
				option.description,
				width,
				theme,
				"muted",
				"     ",
				"     ",
			);
		}
		if (
			!option.isOther &&
			state.mode === "note" &&
			state.noteQuestionId === question.id &&
			state.noteOptionValue === option.value
		) {
			for (const editorLine of editor.render(Math.max(8, width - 7))) {
				lines.push(
					truncateToWidth(
						`     ${renderInputLine(editorLine, width - 5, theme)}`,
						width,
					),
				);
			}
			lines.push(
				truncateToWidth(
					`     ${theme.fg("dim", `${newLineHint} newline · Enter save · Esc save and close`)}`,
					width,
				),
			);
		} else if (option.isOther && selected && state.mode === "input") {
			for (const editorLine of editor.render(Math.max(8, width - 7))) {
				lines.push(
					truncateToWidth(
						`     ${renderInputLine(editorLine, width - 5, theme)}`,
						width,
					),
				);
			}
			lines.push(
				truncateToWidth(
					`     ${theme.fg("dim", `${newLineHint} newline · Enter submit · Esc save and close`)}`,
					width,
				),
			);
		}
		if (option.isOther && state.mode !== "input") {
			const customText = answer?.customText;
			if (customText) {
				pushWrappedText(
					lines,
					customText,
					width,
					theme,
					"muted",
					"     ",
					"     ",
				);
			}
		}
		if (
			optionNote &&
			!(state.mode === "note" && state.noteOptionValue === option.value)
		) {
			pushWrappedText(
				lines,
				`Note: ${optionNote}`,
				width,
				theme,
				"muted",
				"     ",
				"     ",
			);
		}
	}
}

function renderPreviewQuestion(
	lines: string[],
	state: AskState,
	question: NonNullable<ReturnType<typeof getCurrentQuestion>>,
	options: ReturnType<typeof getRenderableOptions>,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
	editor: Editor,
	newLineHint: string,
) {
	const add = (text = "") => lines.push(truncateToWidth(text, width));
	const selectedOption = options[state.optionIndex];
	const wideLayout = width >= 90 && options.length > 0;

	const answer = getAnswer(state, question.id);
	if (wideLayout) {
		const leftWidth = measurePreviewLeftWidth(options, width);
		const rightWidth = Math.max(24, width - leftWidth - 2);
		const leftPane = renderPreviewOptionList(
			state,
			question,
			options,
			theme,
			leftWidth,
		);
		const rightPane = renderPreviewPane(selectedOption, theme, rightWidth);
		for (const line of mergeColumns(leftPane, rightPane, leftWidth, width)) {
			add(line);
		}
	} else {
		renderPreviewOptionList(state, question, options, theme, width).forEach(
			add,
		);
		add("");
		renderPreviewPane(selectedOption, theme, width).forEach(add);
	}

	if (
		selectedOption &&
		!selectedOption.isOther &&
		state.mode === "note" &&
		state.noteQuestionId === question.id &&
		state.noteOptionValue === selectedOption.value
	) {
		add("");
		for (const editorLine of editor.render(Math.max(8, width - 7))) {
			add(`     ${renderInputLine(editorLine, width - 5, theme)}`);
		}
		add(
			`     ${theme.fg("dim", `${newLineHint} newline · Enter save · Esc save and close`)}`,
		);
	} else if (selectedOption && !selectedOption.isOther) {
		const optionNote = answer?.optionNotes?.[selectedOption.value];
		if (optionNote) {
			add("");
			for (const line of wrapText(
				`Note: ${optionNote}`,
				Math.max(1, width - 5),
			)) {
				add(` ${theme.fg("muted", line)}`);
			}
		}
	}

	if (selectedOption?.isOther && state.mode === "input") {
		add("");
		for (const editorLine of editor.render(Math.max(8, width - 7))) {
			add(`     ${renderInputLine(editorLine, width - 5, theme)}`);
		}
		add(
			`     ${theme.fg("dim", `${newLineHint} newline · Enter submit · Esc save and close`)}`,
		);
	}

	if (selectedOption?.isOther && state.mode !== "input" && answer?.customText) {
		add("");
		for (const customLine of wrapText(
			answer.customText,
			Math.max(1, width - 5),
		)) {
			add(` ${theme.fg("muted", customLine)}`);
		}
	}
}

function renderPreviewOptionList(
	state: AskState,
	question: NonNullable<ReturnType<typeof getCurrentQuestion>>,
	options: ReturnType<typeof getRenderableOptions>,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
): string[] {
	const lines: string[] = [];
	const answer = getAnswer(state, question.id);
	for (let i = 0; i < options.length; i++) {
		const option = options[i];
		const selected = i === state.optionIndex;
		const isAnsweredOption = option.isOther
			? !!answer?.customText
			: !!answer?.values.includes(option.value);
		const pointer = selected ? "❯ " : "  ";
		const optionColor = isAnsweredOption
			? "success"
			: selected
				? "accent"
				: "text";
		pushWrappedText(
			lines,
			`${i + 1}. ${option.label}`,
			width,
			theme,
			optionColor,
			pointer,
			" ".repeat(visibleWidth(pointer)),
		);
		if (option.description) {
			pushWrappedText(
				lines,
				option.description,
				width,
				theme,
				"muted",
				"     ",
				"     ",
			);
		}
	}
	return lines;
}

function renderPreviewPane(
	selectedOption: ReturnType<typeof getRenderableOptions>[number] | undefined,
	theme: ExtensionContext["ui"]["theme"],
	width: number,
): string[] {
	const paneWidth = Math.max(10, width);
	if (!selectedOption) {
		return renderBox(
			[{ text: "No preview available", color: "dim" }],
			paneWidth,
			theme,
		);
	}

	const content: Array<{
		text: string;
		color: "accent" | "muted" | "text" | "dim";
	}> = [];
	content.push({ text: selectedOption.label, color: "accent" });
	if (selectedOption.description) {
		content.push({ text: selectedOption.description, color: "muted" });
	}
	if (selectedOption.preview) {
		if (content.length) {
			content.push({ text: "", color: "dim" });
		}
		for (const previewLine of selectedOption.preview.split("\n")) {
			content.push({ text: previewLine, color: "text" });
		}
	} else {
		if (content.length) {
			content.push({ text: "", color: "dim" });
		}
		content.push({ text: "No preview available", color: "dim" });
	}

	return renderBox(content, paneWidth, theme);
}

function renderBox(
	content: Array<{ text: string; color: "accent" | "muted" | "text" | "dim" }>,
	width: number,
	theme: ExtensionContext["ui"]["theme"],
): string[] {
	const boxWidth = Math.max(10, width);
	const innerWidth = Math.max(4, boxWidth - 2);
	const top = theme.fg("accent", `┌${"─".repeat(innerWidth)}┐`);
	const bottom = theme.fg("accent", `└${"─".repeat(innerWidth)}┘`);
	const lines = [top];
	for (const item of content) {
		for (const rawLine of wrapText(item.text, innerWidth)) {
			const line = theme.fg(item.color, rawLine);
			const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(line)));
			lines.push(
				theme.fg("accent", "│") + line + padding + theme.fg("accent", "│"),
			);
		}
	}
	lines.push(bottom);
	return lines;
}

function mergeColumns(
	left: string[],
	right: string[],
	leftWidth: number,
	width: number,
): string[] {
	const lines: string[] = [];
	const rowCount = Math.max(left.length, right.length);
	for (let index = 0; index < rowCount; index++) {
		const leftLine = left[index] ?? "";
		const rightLine = right[index] ?? "";
		const paddedLeft = padToVisibleWidth(leftLine, leftWidth);
		lines.push(truncateToWidth(`${paddedLeft}  ${rightLine}`, width));
	}
	return lines;
}

function padToVisibleWidth(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function measurePreviewLeftWidth(
	options: ReturnType<typeof getRenderableOptions>,
	width: number,
): number {
	let widest = 0;
	for (let i = 0; i < options.length; i++) {
		const option = options[i];
		const labelWidth = visibleWidth(`${i + 1}. ${option.label}`);
		const descriptionWidth = option.description
			? visibleWidth(option.description)
			: 0;
		widest = Math.max(widest, labelWidth, descriptionWidth);
	}

	const preferred = widest + 4;
	const maxWidth = Math.min(34, Math.floor(width * 0.34));
	return clamp(preferred, 22, Math.max(22, maxWidth));
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function pushWrappedText(
	lines: string[],
	text: string,
	width: number,
	theme: ExtensionContext["ui"]["theme"],
	color: "accent" | "muted" | "text" | "dim" | "success" | "warning",
	prefix = "",
	continuationPrefix = prefix,
) {
	const availableWidth = Math.max(1, width - visibleWidth(prefix));
	const wrapped = wrapText(text, availableWidth);
	for (let index = 0; index < wrapped.length; index++) {
		const line = wrapped[index];
		const currentPrefix = index === 0 ? prefix : continuationPrefix;
		lines.push(
			truncateToWidth(`${currentPrefix}${theme.fg(color, line)}`, width),
		);
	}
	if (wrapped.length === 0) {
		lines.push(truncateToWidth(prefix, width));
	}
}

function renderFooter(
	state: AskState,
	theme: ExtensionContext["ui"]["theme"],
): string {
	if (state.mode === "input") {
		return theme.fg(
			"dim",
			" Enter submit · Esc save and close · Tab/←→ save and navigate",
		);
	}
	if (state.mode === "note") {
		return theme.fg(
			"dim",
			" Enter save · Esc save and close · Tab/←→ save and navigate",
		);
	}

	const question = getCurrentQuestion(state);
	if (isSubmitTab(state)) {
		return theme.fg("dim", " ↑↓ select · Enter confirm · Esc cancel");
	}
	if (question?.type === "multi") {
		return theme.fg(
			"dim",
			" ⇆ tab · ↑↓ select · Space toggle · Enter continue · N option note · Ctrl+N question note · Esc dismiss · 1-9 quick toggle",
		);
	}
	return theme.fg(
		"dim",
		" ⇆ tab · ↑↓ select · Enter confirm · N option note · Ctrl+N question note · Esc dismiss",
	);
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

function isOptionNoteShortcut(data: string): boolean {
	return data === "n" || data === "N";
}

function isQuestionNoteShortcut(data: string): boolean {
	return matchesKey(data, Key.ctrl("n"));
}
