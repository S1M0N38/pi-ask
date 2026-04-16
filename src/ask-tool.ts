import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { runAskFlow } from "./ask-component.ts";
import { renderResultText } from "./result.ts";
import { AskParamsSchema } from "./schema.ts";
import { createInitialState, summarizeResult, toAskResult } from "./state.ts";
import type { AskParams, AskQuestionInput, AskResult } from "./types.ts";

export function registerAskTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user one or more structured questions. Supports single-select, multi-select, and typed custom answers. Use this when clarification is required before proceeding.",
		parameters: AskParamsSchema,

		async execute(_toolCallId, params: AskParams, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				const details = errorResultDetails(params, true);
				return {
					content: [
						{
							type: "text",
							text: "Error: UI not available (running in non-interactive mode)",
						},
					],
					details,
				};
			}

			if (!params.questions?.length) {
				const details = errorResultDetails(params, true);
				return {
					content: [{ type: "text", text: "Error: No questions provided" }],
					details,
				};
			}

			const result = await runAskFlow(ctx, params);
			return {
				content: [{ type: "text", text: summarizeResult(result) }],
				details: result,
			};
		},

		renderCall(args, theme) {
			const params = args as AskParams;
			const labels = Array.isArray(params.questions)
				? params.questions
						.map(
							(question: AskQuestionInput, index) =>
								question.label || `Q${index + 1}`,
						)
						.join(", ")
				: "";
			let text = theme.fg("toolTitle", theme.bold("ask_user "));
			text += theme.fg("muted", `${params.questions?.length ?? 0} question(s)`);
			if (labels) {
				text += theme.fg("dim", ` (${truncateToWidth(labels, 50)})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AskResult | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			return new Text(renderResultText(details), 0, 0);
		},
	});
}

function errorResultDetails(params: AskParams, cancelled: boolean): AskResult {
	try {
		const state = createInitialState(params);
		return {
			...toAskResult(state),
			cancelled,
		};
	} catch {
		return {
			title: params.title,
			cancelled,
			questions: [],
			answers: {},
		};
	}
}
