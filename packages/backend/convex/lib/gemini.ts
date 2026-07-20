type GeminiPart =
	| { text: string }
	| { inlineData: { mimeType: string; data: string } };

export async function callGeminiApi(
	parts: GeminiPart[],
	apiKey: string,
	modelName = "gemini-3.1-flash-lite",
	generationConfig?: {
		temperature?: number;
		maxOutputTokens?: number;
		responseMimeType?: string;
	},
): Promise<{ text: string; raw: string }> {
	const config: Record<string, unknown> = {
		temperature: generationConfig?.temperature ?? 0,
		maxOutputTokens: generationConfig?.maxOutputTokens ?? 8192,
	};
	if (generationConfig?.responseMimeType) {
		config.responseMimeType = generationConfig.responseMimeType;
	}

	const body: Record<string, unknown> = {
		contents: [{ parts }],
		generationConfig: config,
	};

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Gemini API error: ${error}`);
	}

	const result = (await response.json()) as {
		candidates?: { content?: { parts?: { text?: string }[] } }[];
	};
	const rawResponse = JSON.stringify(result);

	const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!textContent) {
		throw new Error("No text in Gemini response");
	}

	return { text: textContent, raw: rawResponse };
}
