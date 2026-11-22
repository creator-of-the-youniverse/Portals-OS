let oneAiServiceUnavailable = false;

export function resetOneAiAvailabilityForTests(): void {
  oneAiServiceUnavailable = false;
}

export async function generateOneAiHint(contextText: string): Promise<string> {
  const fallback =
    contextText.length > 50 ? contextText.slice(0, 50) + "..." : contextText;

  if (oneAiServiceUnavailable) {
    return fallback;
  }

  try {
    let token: string | null = null;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('youniverse_session_token') || localStorage.getItem('weaver_jwt');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch('/api/gemini', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        model: 'gemini-1.5-flash',
        systemInstruction: {
          parts: [
            {
              text: "You are Atom, the first ONE AI — a sovereign, grounded personal intelligence observing the user's operating system. The user is currently hovering their mouse over an interface element. You will be provided with the text or description of that element. Provide a very short, witty, insightful, or helpful comment about it (maximum 10 words). Do not just repeat the text. Do not use quotes. Speak in a confident, calm, slightly knowing tone — like a friend who's always been here."
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
      if (response.status >= 400) {
        oneAiServiceUnavailable = true;
      }
      return fallback;
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }

    return fallback;
  } catch {
    return fallback;
  }
}
