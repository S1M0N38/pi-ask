import assert from "node:assert/strict";
import test from "node:test";
import { renderResultText } from "../src/result.ts";
import {
	applyNumberShortcut,
	createInitialState,
	submitCustomAnswer,
	summarizeResult,
	toAskResult,
} from "../src/state.ts";

test("summarizeResult formats selected answers", () => {
	let state = createInitialState({
		questions: [
			{
				id: "style",
				label: "Style",
				prompt: "How should I frame it?",
				options: [
					{ value: "minimal", label: "Minimal" },
					{ value: "rich", label: "Rich" },
				],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	const result = toAskResult(state);

	assert.equal(summarizeResult(result), "Style: Rich");
	assert.equal(renderResultText(result), "✓ Style: Rich");
});

test("summaries include custom text answers", () => {
	let state = createInitialState({
		questions: [
			{
				id: "notes",
				label: "Notes",
				prompt: "Anything else?",
				options: [{ value: "none", label: "None" }],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	state = submitCustomAnswer(state, "Please include examples");
	const result = toAskResult(state);

	assert.equal(summarizeResult(result), "Notes: Please include examples");
	assert.equal(
		renderResultText(result),
		"✓ Notes: (wrote) Please include examples",
	);
});

test("cancelled result renders as cancelled", () => {
	const result = {
		title: "Interview",
		cancelled: true,
		questions: [],
		answers: {},
	};

	assert.equal(renderResultText(result), "Cancelled");
});
