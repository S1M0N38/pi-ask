import assert from "node:assert/strict";
import test from "node:test";
import { renderResultText } from "../src/result.ts";
import { createInitialState } from "../src/state/create.ts";
import { summarizeResult, toAskResult } from "../src/state/result.ts";
import {
	applyNumberShortcut,
	enterOptionNoteMode,
	enterQuestionNoteMode,
	saveNote,
	submitCustomAnswer,
} from "../src/state/transitions.ts";

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
		"✓ Notes: (wrote) Please include examples"
	);
});

test("multi-select summaries include selected options and custom text", () => {
	let state = createInitialState({
		questions: [
			{
				id: "frameworks",
				label: "Frameworks",
				prompt: "Which frameworks?",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});

	state = applyNumberShortcut(state, 1);
	state = applyNumberShortcut(state, 3);
	state = submitCustomAnswer(state, "SolidStart");
	const result = toAskResult(state);

	assert.deepEqual(result.answers.frameworks, {
		values: ["react", "SolidStart"],
		labels: ["React", "SolidStart"],
		indices: [1],
		customText: "SolidStart",
		note: undefined,
		optionNotes: undefined,
	});
	assert.equal(summarizeResult(result), "Frameworks: React, SolidStart");
	assert.equal(renderResultText(result), "✓ Frameworks: React, SolidStart");
});

test("summaries and result text include question and selected option notes", () => {
	let state = createInitialState({
		questions: [
			{
				id: "framework",
				label: "Framework",
				prompt: "Pick a framework",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});

	state = enterQuestionNoteMode(state, "framework");
	state = saveNote(state, "Need SSR support");
	state = enterOptionNoteMode(state, "framework", "vue");
	state = saveNote(state, "Team has prior experience");
	state = applyNumberShortcut(state, 2);
	const result = toAskResult(state);

	assert.equal(
		summarizeResult(result),
		[
			"Framework: Vue",
			"Framework note: Need SSR support",
			"Framework / Vue note: Team has prior experience",
		].join("\n")
	);
	assert.equal(
		renderResultText(result),
		[
			"✓ Framework: Vue",
			"  note: Need SSR support",
			"  Vue note: Team has prior experience",
		].join("\n")
	);
});

test("unselected option notes are omitted from the submitted result", () => {
	let state = createInitialState({
		questions: [
			{
				id: "framework",
				label: "Framework",
				prompt: "Pick a framework",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});

	state = enterOptionNoteMode(state, "framework", "react");
	state = saveNote(state, "Only for legacy projects");
	state = applyNumberShortcut(state, 2);
	const result = toAskResult(state);

	assert.equal(result.answers.framework.optionNotes, undefined);
	assert.equal(renderResultText(result), "✓ Framework: Vue");
});

test("question-note-only results still render note content", () => {
	const result = {
		title: "Interview",
		cancelled: false,
		questions: [
			{
				id: "scope",
				label: "Scope",
				prompt: "What should we focus on?",
				type: "single" as const,
			},
		],
		answers: {
			scope: {
				values: [],
				labels: [],
				indices: [],
				note: "Prefer incremental changes",
			},
		},
	};

	assert.equal(renderResultText(result), "  note: Prefer incremental changes");
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
