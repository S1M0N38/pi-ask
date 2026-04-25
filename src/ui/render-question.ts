import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { isOptionSelected } from "../state/answers.ts";
import {
	getAnswer,
	getOptionNote,
	getQuestionNote,
	isInputOpenForQuestion,
	isOptionNoteOpen,
	isQuestionNoteOpen,
} from "../state/selectors.ts";
import type { AskDisplayOption } from "../types.ts";
import { UI_DIMENSIONS, UI_TEXT } from "./constants.ts";
import {
	getSavedNotePrefixes,
	measurePreviewLeftWidth,
	mergeColumns,
	pushWrappedText,
	renderEditorBlock,
	renderPreviewPaneContent,
} from "./render-helpers.ts";
import type {
	OptionDetailRenderContext,
	QuestionRenderContext,
	Theme,
} from "./render-types.ts";

export function renderQuestionScreen(context: QuestionRenderContext) {
	const { lines, question, theme, width } = context;
	pushWrappedText(lines, question.prompt, width, theme, "text", " ", " ");
	const renderedQuestionNote = renderQuestionNote(context);
	if (!renderedQuestionNote) {
		lines.push("");
	}

	if (question.type === "preview") {
		renderPreviewQuestion(context);
		return;
	}

	renderStandardQuestion(context);
}

function renderQuestionNote(context: QuestionRenderContext): boolean {
	const { lines, state, question, theme, width, editor } = context;
	if (isQuestionNoteOpen(state, question.id)) {
		renderQuestionNoteEditor(
			lines,
			editor,
			width,
			theme,
			UI_TEXT.editorPlaceholderNote
		);
		lines.push("");
		return true;
	}

	const existingNote = getQuestionNote(state, question.id);
	if (!existingNote) {
		return false;
	}
	const { prefix, continuationPrefix } = getSavedNotePrefixes(theme, {
		indent: " ",
	});
	pushWrappedText(
		lines,
		existingNote,
		width,
		theme,
		"muted",
		prefix,
		continuationPrefix
	);
	lines.push("");
	return true;
}

function renderStandardQuestion(context: QuestionRenderContext) {
	const { options } = context;
	for (let index = 0; index < options.length; index++) {
		renderStandardOption(context, options[index], index);
	}
}

function renderStandardOption(
	context: QuestionRenderContext,
	option: AskDisplayOption,
	index: number
) {
	const { lines, state, question, theme, width } = context;
	const answer = getAnswer(state, question.id);
	const selected = index === state.activeOptionIndex;
	const isAnsweredOption = option.isCustomOption
		? !!answer?.customText
		: isOptionSelected(answer, option.value);
	const pointer = selected ? "❯ " : "  ";
	const prefix = getOptionPrefix(question.type, option, isAnsweredOption);
	const optionColor = getOptionColor(isAnsweredOption, selected);
	if (
		option.isCustomOption &&
		selected &&
		isInputOpenForQuestion(state, question.id)
	) {
		renderInteractiveCustomOption(context, index, pointer, prefix, optionColor);
		return;
	}

	pushWrappedText(
		lines,
		`${index + 1}. ${prefix}${option.label}`,
		width,
		theme,
		optionColor,
		pointer,
		" ".repeat(visibleWidth(pointer))
	);
	renderOptionMeta({
		...context,
		questionId: question.id,
		answer,
		option,
		selected,
	});
}

function renderPreviewQuestion(context: QuestionRenderContext) {
	const { lines, state, question, options, theme, width } = context;
	const add = (text = "") => lines.push(truncateToWidth(text, width));
	const selectedOption = options[state.activeOptionIndex];
	const answer = getAnswer(state, question.id);

	if (selectedOption?.isCustomOption) {
		renderPreviewOptionList(state, options, theme, width, answer).forEach(add);
	} else if (width >= UI_DIMENSIONS.previewWideMinWidth && options.length > 0) {
		renderWidePreviewLayout(
			add,
			state,
			options,
			theme,
			width,
			answer,
			selectedOption
		);
	} else {
		renderStackedPreviewLayout(
			add,
			state,
			options,
			theme,
			width,
			answer,
			selectedOption
		);
	}

	renderOptionEditorOrNote({
		...context,
		questionId: question.id,
		answer,
		option: selectedOption,
		selected: true,
		// Custom preview options already render their inline editor/content above.
		withGap: !selectedOption?.isCustomOption,
	});
}

function renderWidePreviewLayout(
	add: (text?: string) => void,
	state: QuestionRenderContext["state"],
	options: QuestionRenderContext["options"],
	theme: Theme,
	width: number,
	answer: ReturnType<typeof getAnswer>,
	selectedOption: AskDisplayOption | undefined
) {
	const leftWidth = measurePreviewLeftWidth(options, width);
	const rightWidth = Math.max(
		UI_DIMENSIONS.previewMinRightWidth,
		width - leftWidth - 2
	);
	const leftPane = renderPreviewOptionList(
		state,
		options,
		theme,
		leftWidth,
		answer
	);
	const rightPane = renderPreviewPaneContent(selectedOption, theme, rightWidth);
	for (const line of mergeColumns(leftPane, rightPane, leftWidth, width)) {
		add(line);
	}
}

function renderStackedPreviewLayout(
	add: (text?: string) => void,
	state: QuestionRenderContext["state"],
	options: QuestionRenderContext["options"],
	theme: Theme,
	width: number,
	answer: ReturnType<typeof getAnswer>,
	selectedOption: AskDisplayOption | undefined
) {
	renderPreviewOptionList(state, options, theme, width, answer).forEach(add);
	add("");
	renderPreviewPaneContent(selectedOption, theme, width).forEach(add);
}

function renderPreviewOptionList(
	state: QuestionRenderContext["state"],
	options: QuestionRenderContext["options"],
	theme: Theme,
	width: number,
	answer: ReturnType<typeof getAnswer>
): string[] {
	const lines: string[] = [];
	for (let index = 0; index < options.length; index++) {
		const option = options[index];
		const selected = index === state.activeOptionIndex;
		const isAnsweredOption = option.isCustomOption
			? !!answer?.customText
			: isOptionSelected(answer, option.value);
		pushWrappedText(
			lines,
			`${index + 1}. ${option.label}`,
			width,
			theme,
			getOptionColor(isAnsweredOption, selected),
			selected ? "❯ " : "  ",
			"  "
		);
		if (option.description) {
			pushWrappedText(
				lines,
				option.description,
				width,
				theme,
				"muted",
				"     ",
				"     "
			);
		}
	}
	return lines;
}

function renderOptionMeta(
	context: QuestionRenderContext & {
		questionId: string;
		answer: ReturnType<typeof getAnswer>;
		option: AskDisplayOption;
		selected: boolean;
	}
) {
	const { lines, option, theme, width } = context;
	if (option.description) {
		pushWrappedText(
			lines,
			option.description,
			width,
			theme,
			"muted",
			"     ",
			"     "
		);
	}
	renderOptionEditorOrNote(context);
}

function renderOptionEditorOrNote(context: OptionDetailRenderContext) {
	const { lines, option, withGap } = context;
	if (!option) {
		return;
	}

	const renderState = getOptionDetailRenderState(context);
	if (withGap && hasOptionDetailContent(renderState)) {
		lines.push("");
	}
	if (renderOptionEditor(context, renderState)) {
		return;
	}
	if (renderOptionContent(context, renderState)) {
		return;
	}
	renderSavedOptionNote(context, renderState.optionNote);
}

function getOptionDetailRenderState(context: OptionDetailRenderContext) {
	const { state, questionId, answer, option, selected } = context;
	const inputOpen =
		option?.isCustomOption &&
		selected &&
		isInputOpenForQuestion(state, questionId);
	const noteOpen =
		!!option &&
		!option.isCustomOption &&
		isOptionNoteOpen(state, questionId, option.value);
	const optionNote =
		option && !option.isCustomOption
			? getOptionNote(state, questionId, option.value)
			: undefined;
	const customText = option?.isCustomOption ? answer?.customText : undefined;

	return {
		inputOpen,
		noteOpen,
		optionNote,
		customText,
	};
}

function hasOptionDetailContent(
	renderState: ReturnType<typeof getOptionDetailRenderState>
) {
	return !!(
		renderState.noteOpen ||
		renderState.inputOpen ||
		renderState.customText ||
		renderState.optionNote
	);
}

function renderOptionEditor(
	context: OptionDetailRenderContext,
	renderState: ReturnType<typeof getOptionDetailRenderState>
): boolean {
	const { lines, editor, width, theme } = context;
	if (renderState.noteOpen) {
		renderIndentedEditor(
			lines,
			editor,
			width,
			theme,
			UI_TEXT.editorPlaceholderNote
		);
		return true;
	}
	if (renderState.inputOpen) {
		renderIndentedEditor(
			lines,
			editor,
			width,
			theme,
			UI_TEXT.editorPlaceholderInput
		);
		return true;
	}
	return false;
}

function renderOptionContent(
	context: OptionDetailRenderContext,
	renderState: ReturnType<typeof getOptionDetailRenderState>
): boolean {
	const { lines, option, theme, width } = context;
	if (!(option?.isCustomOption && renderState.customText)) {
		return false;
	}
	pushWrappedText(
		lines,
		renderState.customText,
		width,
		theme,
		"muted",
		"     ",
		"     "
	);
	return true;
}

function renderSavedOptionNote(
	context: OptionDetailRenderContext,
	optionNote: string | undefined
) {
	if (!optionNote) {
		return;
	}
	const { lines, theme, width } = context;
	const { prefix, continuationPrefix } = getSavedNotePrefixes(theme, {
		indent: "     ",
	});
	pushWrappedText(
		lines,
		optionNote,
		width,
		theme,
		"muted",
		prefix,
		continuationPrefix
	);
}

function renderQuestionNoteEditor(
	lines: string[],
	editor: QuestionRenderContext["editor"],
	width: number,
	theme: Theme,
	placeholder: string
) {
	renderEditorBlock({
		lines,
		editorLines: editor.render(
			Math.max(
				UI_DIMENSIONS.editorMinWidth,
				width - UI_DIMENSIONS.editorContentPadding
			)
		),
		width,
		theme,
		indent: " ",
		availableWidth: width - 1,
		placeholder,
		isEmpty: editor.getText().length === 0,
	});
}

function renderIndentedEditor(
	lines: string[],
	editor: QuestionRenderContext["editor"],
	width: number,
	theme: Theme,
	placeholder: string
) {
	renderEditorBlock({
		lines,
		editorLines: editor.render(
			Math.max(
				UI_DIMENSIONS.editorMinWidth,
				width - UI_DIMENSIONS.editorIndentedPadding
			)
		),
		width,
		theme,
		indent: "     ",
		availableWidth: width - 5,
		placeholder,
		isEmpty: editor.getText().length === 0,
	});
}

function getOptionPrefix(
	questionType: QuestionRenderContext["question"]["type"],
	option: AskDisplayOption,
	isAnsweredOption: boolean
): string {
	if (questionType !== "multi" || option.isCustomOption) {
		return "";
	}
	return `[${isAnsweredOption ? "x" : " "}] `;
}

function renderInteractiveCustomOption(
	context: QuestionRenderContext,
	index: number,
	pointer: string,
	prefix: string,
	optionColor: ReturnType<typeof getOptionColor>
) {
	const { lines, editor, theme, width } = context;
	pushWrappedText(
		lines,
		`${index + 1}. ${prefix}Type your own`,
		width,
		theme,
		optionColor,
		pointer,
		" ".repeat(visibleWidth(pointer))
	);
	renderIndentedEditor(
		lines,
		editor,
		width,
		theme,
		UI_TEXT.editorPlaceholderInput
	);
}

function getOptionColor(isAnsweredOption: boolean, selected: boolean) {
	if (isAnsweredOption) {
		return "success";
	}
	if (selected) {
		return "accent";
	}
	return "text";
}
