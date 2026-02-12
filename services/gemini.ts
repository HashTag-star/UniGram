
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const moderateContent = async (text: string): Promise<{ safe: boolean; reason?: string }> => {
  if (!process.env.API_KEY) return { safe: true };
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate the following campus social post for community guidelines (harassment, hate speech, explicit content). Return JSON: { "safe": boolean, "reason": "string" if unsafe }. Post: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text || '{"safe": true}');
  } catch (error) {
    console.error("AI Moderation Error:", error);
    return { safe: true };
  }
};

export const getPersonalizedRecommendations = async (userContext: { major: string; university: string; interests: string[] }) => {
  if (!process.env.API_KEY) return [
    { id: 'r1', type: 'group', title: 'AI Research Lab', subtitle: 'Join 50+ members', reason: 'Matches your interest in AI' },
    { id: 'r2', type: 'connection', title: 'David Chen', subtitle: 'Senior CS student', reason: 'Also interested in Jazz' }
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User Context: Major: ${userContext.major}, University: ${userContext.university}, Interests: ${userContext.interests.join(", ")}. 
      Generate 3 diverse campus recommendations. Types can be 'connection' (person), 'group' (study/club), or 'event'. 
      Return JSON array of objects with fields: id (string), type (string), title (string), subtitle (string), reason (string).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "Must be 'connection', 'group', or 'event'" },
              title: { type: Type.STRING },
              subtitle: { type: Type.STRING },
              reason: { type: Type.STRING }
            },
            required: ['id', 'type', 'title', 'subtitle', 'reason']
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Recommendation Engine Error:", error);
    return [];
  }
};
