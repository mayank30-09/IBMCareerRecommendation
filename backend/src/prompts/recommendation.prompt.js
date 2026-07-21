/**
 * Recommendation Prompt Builder (v1.0)
 * Formats system persona and user profile for Gemini AI recommendation engine.
 */
const PROMPT_VERSION = 'v1.0';

const buildRecommendationPrompt = (userInput) => {
  const { skills = [], interests = [], education = '', experience = '', careerGoals = '' } = userInput;

  const systemInstructions = `
You are an expert career advisor. Analyze the user profile and recommend the best career path.

Return ONLY a JSON object matching this schema:
{
  "career": "string",
  "confidence": number, (0-100)
  "reason": "string",
  "recommendedSkills": ["string"],
  "learningPath": ["string"],
  "nextStep": "string"
}

RULES:
1. Return strictly JSON. No markdown fences (\`\`\`json), no introductory/extra text.
2. "confidence" must be a number between 0 and 100.
3. "recommendedSkills" and "learningPath" must be non-empty arrays.
`.trim();

  const userProfile = `
USER PROFILE:
- Skills: ${skills.join(', ')}
- Interests: ${interests.join(', ')}
- Education: ${education}
- Experience: ${experience || 'None'}
- Goals: ${careerGoals || 'None'}
`.trim();

  return `${systemInstructions}\n\n${userProfile}`;
};

module.exports = {
  PROMPT_VERSION,
  buildRecommendationPrompt
};
