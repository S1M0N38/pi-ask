import type { AskResult } from "./types.ts";

export function renderResultText(result: AskResult): string {
	if (result.cancelled) {
		return "Cancelled";
	}

	const lines: string[] = [];
	for (const question of result.questions) {
		const answer = result.answers[question.id];
		if (!answer) continue;
		if (answer.customText) {
			lines.push(`✓ ${question.label}: (wrote) ${answer.customText}`);
		} else if (answer.labels.length > 0) {
			lines.push(`✓ ${question.label}: ${answer.labels.join(", ")}`);
		}
		if (answer.note) {
			lines.push(`  note: ${answer.note}`);
		}
		for (let index = 0; index < answer.values.length; index++) {
			const value = answer.values[index];
			const label = answer.labels[index] ?? value;
			const note = answer.optionNotes?.[value];
			if (!note) continue;
			lines.push(`  ${label} note: ${note}`);
		}
	}
	return lines.join("\n") || "Submitted";
}
