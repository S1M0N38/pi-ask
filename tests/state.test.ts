import assert from "node:assert/strict";
import test from "node:test";
import {
	allRequiredAnswered,
	applyNumberShortcut,
	cancelFlow,
	confirmCurrentSelection,
	createInitialState,
	getRenderableOptions,
	moveOption,
	moveTab,
	submitCustomAnswer,
	toggleCurrentMultiOption,
} from "../src/state.ts";
import type { AskParams } from "../src/types.ts";

function sampleParams(): AskParams {
	return {
		title: "Interview",
		questions: [
			{
				id: "lang",
				label: "Language",
				prompt: "What language?",
				options: [
					{ value: "py", label: "Python" },
					{ value: "ts", label: "TypeScript" },
				],
			},
			{
				id: "fe",
				label: "Frontend",
				prompt: "Which frameworks?",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	};
}

test("normalize defaults via initial state", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Question?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	assert.equal(state.questions[0].label, "Q1");
	assert.equal(state.questions[0].type, "single");
	assert.equal(state.questions[0].allowOther, true);
	assert.equal(state.questions[0].required, true);
	assert.equal(
		getRenderableOptions(state.questions[0]).at(-1)?.label,
		"Type something.",
	);
});

test("single-select number shortcut stores answer and advances to next tab", () => {
	let state = createInitialState(sampleParams());
	state = applyNumberShortcut(state, 2);

	assert.equal(state.answers.lang.labels[0], "TypeScript");
	assert.equal(state.currentTab, 1);
	assert.equal(state.mode, "navigate");
});

test("multi-select space toggles current option and enter advances to submit", () => {
	let state = createInitialState(sampleParams());
	state = applyNumberShortcut(state, 1);
	state = toggleCurrentMultiOption(state);
	assert.deepEqual(state.answers.fe.labels, ["React"]);

	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);
	assert.deepEqual(state.answers.fe.labels, ["React", "Vue"]);

	state = confirmCurrentSelection(state);
	assert.equal(state.mode, "submit");
	assert.equal(state.currentTab, 2);
	assert.equal(allRequiredAnswered(state), true);
});

test("selecting other enters input mode and custom submit stores typed answer", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Other?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	assert.equal(state.mode, "input");
	state = submitCustomAnswer(state, "my custom answer");

	assert.equal(state.answers.q1.customText, "my custom answer");
	assert.equal(state.mode, "submit");
});

test("tab navigation wraps including submit tab", () => {
	let state = createInitialState(sampleParams());
	state = moveTab(state, -1);
	assert.equal(state.currentTab, 2);
	assert.equal(state.mode, "submit");

	state = moveTab(state, 1);
	assert.equal(state.currentTab, 0);
	assert.equal(state.mode, "navigate");
});

test("escape cancels from main flow but only exits input mode when typing", () => {
	let state = createInitialState(sampleParams());
	state = cancelFlow(state);
	assert.equal(state.cancelled, true);
	assert.equal(state.completed, true);

	state = createInitialState({
		questions: [
			{ id: "q", prompt: "Q?", options: [{ value: "a", label: "A" }] },
		],
	});
	state = applyNumberShortcut(state, 2);
	assert.equal(state.mode, "input");
	state = cancelFlow(state);
	assert.equal(state.mode, "navigate");
	assert.equal(state.cancelled, false);
});
