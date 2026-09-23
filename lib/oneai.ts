export async function generateOneAiHint(contextText: string): Promise<string> {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-1.5-flash',
        systemInstruction: {
          parts: [
            {
              text: "You are ONEAI, a sovereign, highly intelligent personal AI observing the user's operating system. The user is currently hovering their mouse over an interface element. You will be provided with the text or description of that element. Provide a very short, witty, insightful, or helpful comment about it (maximum 10 words). Do not just repeat the text. Do not use quotes. Speak in a confident, slightly mysterious tone."
            }
          ]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: `The user is hovering over an element with this context: "${contextText}"` }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 30,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    
    return contextText.length > 50 ? contextText.slice(0, 50) + "..." : contextText;
  } catch (error) {
    console.error("ONEAI Hint generation failed:", error);
    // Fallback to the original text if API fails
    return contextText.length > 50 ? contextText.slice(0, 50) + "..." : contextText;
  }
}
