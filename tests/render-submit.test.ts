import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../src/state/create.ts";
import {
	applyNumberShortcut,
	enterOptionNoteMode,
	enterQuestionNoteMode,
	saveNote,
} from "../src/state/transitions.ts";
import { UI_DIMENSIONS } from "../src/ui/constants.ts";
import { renderSubmitScreen } from "../src/ui/render-submit.ts";

function plainTheme() {
	return {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	} as never;
}

test("submit screen uses shorter action labels without extra prompt text", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Single",
				prompt: "Pick one primary demo style.",
				options: [{ value: "code", label: "Code demo" }],
			},
		],
	});

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth + 16
	);

	assert(!lines.some((line) => line.includes("Submit answers?")));
	assert(lines.some((line) => line.includes("1. Submit")));
	assert(lines.some((line) => line.includes("2. Elaborate")));
	assert(lines.some((line) => line.includes("3. Cancel")));
	assert(!lines.some((line) => line.includes("1. Submit answers")));
});

test("submit screen uses side-by-side layout on wide screens", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Color",
				prompt: "Pick one color.",
				options: [{ value: "blue", label: "Blue" }],
			},
		],
	});

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth + 16
	);

	assert(
		lines.some(
			(line) => line.includes("1. Submit") && line.includes("Review answers")
		)
	);
	assert(
		lines.some((line) => line.includes("3. Cancel") && line.includes("Color"))
	);
});

test("submit screen stacks review above actions on narrow screens", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Color",
				prompt: "Pick one color.",
				options: [{ value: "blue", label: "Blue" }],
			},
		],
	});

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth - 14
	);

	const reviewIndex = lines.findIndex((line) =>
		line.includes("Review answers")
	);
	const actionIndex = lines.findIndex((line) => line.includes("1. Submit"));

	assert.notEqual(reviewIndex, -1);
	assert.notEqual(actionIndex, -1);
	assert(reviewIndex < actionIndex);
	assert(
		!lines.some(
			(line) => line.includes("1. Submit") && line.includes("Review answers")
		)
	);
});

test("submit screen shows notes only for answered questions in submit mode", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Single",
				prompt: "Pick one primary demo style.",
				options: [{ value: "code", label: "Code demo" }],
			},
			{
				id: "q2",
				label: "Multi",
				prompt: "Pick any extra things to include.",
				options: [{ value: "extra", label: "Extra" }],
			},
		],
	});

	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "Question note");
	state = applyNumberShortcut(state, 1);
	state = enterOptionNoteMode(state, "q1", "code");
	state = saveNote(state, "Option note");
	state = enterQuestionNoteMode(state, "q2");
	state = saveNote(state, "Second note");

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth + 76
	);

	const firstQuestionIndex = lines.findIndex((line) => line.includes("Single"));
	const firstQuestionNoteIndex = lines.findIndex((line) =>
		line.includes("Question note")
	);
	const firstAnswerIndex = lines.findIndex((line) =>
		line.includes("→ Code demo")
	);
	const optionNoteIndex = lines.findIndex((line) =>
		line.includes("Option note")
	);
	const secondQuestionIndex = lines.findIndex((line) => line.includes("Multi"));

	assert.notEqual(firstQuestionIndex, -1);
	assert.notEqual(firstQuestionNoteIndex, -1);
	assert.notEqual(firstAnswerIndex, -1);
	assert.notEqual(optionNoteIndex, -1);
	assert.notEqual(secondQuestionIndex, -1);
	assert(firstQuestionNoteIndex < firstAnswerIndex);
	assert(optionNoteIndex > firstAnswerIndex);
	assert(lines[firstQuestionNoteIndex]?.startsWith("     "));
	assert(lines[optionNoteIndex]?.startsWith("     "));
	assert.equal(lines[secondQuestionIndex - 1]?.trim(), "");
	assert(lines.some((line) => line.includes("Note:")));
	assert(!lines.some((line) => line.includes("Second note")));
	assert(!lines.some((line) => line.includes("Question note:")));
	assert(!lines.some((line) => line.includes("Code demo note:")));
	assert(!lines.some((line) => line.includes("Pick one primary demo style.")));
	assert(
		!lines.some((line) => line.includes("Pick any extra things to include."))
	);
});

test("submit screen shows all notes when elaborate action is selected", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Single",
				prompt: "Pick one primary demo style.",
				options: [
					{ value: "code", label: "Code demo" },
					{ value: "slides", label: "Slides demo" },
				],
			},
			{
				id: "q2",
				label: "Multi",
				prompt: "Pick any extra things to include.",
				options: [{ value: "extra", label: "Extra" }],
			},
		],
	});

	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "Question note");
	state = applyNumberShortcut(state, 1);
	state = enterOptionNoteMode(state, "q1", "code");
	state = saveNote(state, "Selected option note");
	state = enterOptionNoteMode(state, "q1", "slides");
	state = saveNote(state, "Unselected option note");
	state = enterQuestionNoteMode(state, "q2");
	state = saveNote(state, "Second note");
	state = { ...state, activeSubmitActionIndex: 1 };

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth + 16
	);

	assert(lines.some((line) => line.includes("Question note")));
	assert(lines.some((line) => line.includes("Selected option note")));
	assert(lines.some((line) => line.includes("Unselected option note")));
	assert(lines.some((line) => line.includes("Slides demo Note:")));
	assert(lines.some((line) => line.includes("Second note")));
});

test("submit screen renders multi-select option notes under their related answers", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Multi",
				prompt: "Pick extras",
				type: "multi",
				options: [
					{ value: "follow-up", label: "Follow-up action" },
					{ value: "docs", label: "Docs demo" },
				],
			},
		],
	});

	state = applyNumberShortcut(state, 1);
	state = applyNumberShortcut(state, 2);
	state = enterOptionNoteMode(state, "q1", "follow-up");
	state = saveNote(state, "First note");
	state = enterOptionNoteMode(state, "q1", "docs");
	state = saveNote(state, "Second note");

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth + 76
	);

	const firstAnswerIndex = lines.findIndex((line) =>
		line.includes("→ Follow-up action")
	);
	const firstNoteIndex = lines.findIndex((line) => line.includes("First note"));
	const secondAnswerIndex = lines.findIndex((line) =>
		line.includes("→ Docs demo")
	);
	const secondNoteIndex = lines.findIndex((line) =>
		line.includes("Second note")
	);

	assert.notEqual(firstAnswerIndex, -1);
	assert.notEqual(firstNoteIndex, -1);
	assert.notEqual(secondAnswerIndex, -1);
	assert.notEqual(secondNoteIndex, -1);
	assert(firstAnswerIndex < firstNoteIndex);
	assert(firstNoteIndex < secondAnswerIndex);
	assert(secondAnswerIndex < secondNoteIndex);
});

test("submit action column fits all action labels at the wide breakpoint", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				label: "Color",
				prompt: "Pick one color.",
				options: [{ value: "blue", label: "Blue" }],
			},
		],
	});

	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		UI_DIMENSIONS.submitWideMinWidth
	);

	assert(
		lines.some(
			(line) => line.includes("1. Submit") && line.includes("Review answers")
		)
	);
	assert(lines.some((line) => line.includes("2. Elaborate")));
	assert(lines.some((line) => line.includes("3. Cancel")));
	assert(!lines.some((line) => line.includes("Elaborat\n")));
});
