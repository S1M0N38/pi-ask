import type { AskResult } from "./types.ts";

export function renderResultText(result: AskResult): string {
	if (result.cancelled) {
		return "Cancelled";
	}

	const lines: string[] = [];
	for (const question of result.questions) {
		const answer = result.answers[question.id];
		if (!answer) continue;
		const value = answer.customText
			? `(wrote) ${answer.customText}`
			: answer.labels.join(", ");
		lines.push(`✓ ${question.label}: ${value}`);
	}
	return lines.join("\n") || "Submitted";
}
