import assert from "node:assert/strict";
import test from "node:test";
import { runAskAndSendSubmittedResult } from "../src/answer-commands.ts";
import type { AskParams, AskResult } from "../src/types.ts";

const HAS_UI = "hasUI";
const TUI_FAILURE_RE = /TUI failure/;

function sampleParams(): AskParams {
	return {
		title: "Clarify next step",
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "What should I optimize for?",
				options: [
					{ value: "speed", label: "Speed" },
					{ value: "safety", label: "Safety" },
				],
			},
		],
	};
}

function makeMockPi() {
	const emitted: Array<{ channel: string; data: unknown }> = [];
	return {
		emitted,
		pi: {
			events: {
				emit(channel: string, data: unknown) {
					emitted.push({ channel, data });
				},
			},
			sendUserMessage() {
				// intentional no-op in test
			},
		} as never,
	};
}

function makeMockCtx(options: {
	resolvesWith?: AskResult;
	rejectsWith?: Error;
}) {
	return {
		[HAS_UI]: true,
		ui: {
			custom: () =>
				options.rejectsWith
					? Promise.reject(options.rejectsWith)
					: Promise.resolve(options.resolvesWith),
			setWorkingVisible() {
				// intentional no-op in test
			},
			notify() {
				// intentional no-op in test
			},
		},
		cwd: "/tmp",
		isIdle: () => false,
	} as never;
}

test("answer-commands emits ask:started and ask:completed on success", async () => {
	const { emitted, pi } = makeMockPi();
	const result: AskResult = {
		answers: {
			goal: { values: ["speed"], labels: ["Speed"], indices: [0] },
		},
		cancelled: false,
		mode: "submit",
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "What should I optimize for?",
				type: "single",
			},
		],
		title: "Clarify next step",
	};
	const ctx = makeMockCtx({ resolvesWith: result });

	await runAskAndSendSubmittedResult(pi, ctx, sampleParams(), {
		allowFreeform: false,
	});

	assert.equal(emitted.length, 2);
	assert.equal(emitted[0].channel, "ask:started");
	assert.equal(emitted[1].channel, "ask:completed");
	assert.equal((emitted[1].data as AskResult).cancelled, false);
	assert.deepEqual((emitted[1].data as AskResult).answers, result.answers);
});

test("answer-commands emits paired events even when the ask flow fails", async () => {
	const { emitted, pi } = makeMockPi();
	const ctx = makeMockCtx({ rejectsWith: new Error("TUI failure") });

	await assert.rejects(
		() =>
			runAskAndSendSubmittedResult(pi, ctx, sampleParams(), {
				allowFreeform: false,
			}),
		TUI_FAILURE_RE
	);

	assert.equal(emitted.length, 2);
	assert.equal(emitted[0].channel, "ask:started");
	assert.equal(emitted[1].channel, "ask:completed");
	assert.equal((emitted[1].data as AskResult).cancelled, true);
	assert.deepEqual((emitted[1].data as AskResult).answers, {});
});

test("answer-commands emits completed with cancelled result when flow is cancelled", async () => {
	const { emitted, pi } = makeMockPi();
	const cancelledResult: AskResult = {
		answers: {},
		cancelled: true,
		mode: "submit",
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "What should I optimize for?",
				type: "single",
			},
		],
		title: "Clarify next step",
	};
	const ctx = makeMockCtx({ resolvesWith: cancelledResult });

	await runAskAndSendSubmittedResult(pi, ctx, sampleParams(), {
		allowFreeform: false,
	});

	assert.equal(emitted.length, 2);
	assert.equal(emitted[0].channel, "ask:started");
	assert.equal(emitted[1].channel, "ask:completed");
	assert.equal((emitted[1].data as AskResult).cancelled, true);
});
