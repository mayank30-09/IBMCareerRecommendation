import { createServerFn } from "@tanstack/react-start";

export type CareerInput = {
  fullName: string;
  age: string;
  education: string;
  skills: string;
  interests: string;
  personality: string;
  workStyle: string;
  location: string;
};

export type CareerRecommendation = {
  title: string;
  matchPercentage: number;
  description: string;
  requiredSkills: string[];
  skillGaps: string[];
  learningRoadmap: { step: string; resource: string; type: string }[];
  salaryLocal: string;
  salaryGlobal: string;
  demand: string;
  growthOutlook: string;
  companies: string[];
  roles: string[];
  personalityCompatibility: number;
  compatibilityReasoning: string;
  nextSteps: string[];
};

export type CareerReport = {
  summary: string;
  topCareers: CareerRecommendation[];
  alternatives: { title: string; reason: string }[];
  networkingTips: string[];
};

export const generateCareerReport = createServerFn({ method: "POST" })
  .inputValidator((input: CareerInput) => input)
  .handler(async ({ data }): Promise<CareerReport> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a senior career counselor. Analyze this candidate and produce a detailed career recommendation report.

Candidate Profile:
- Name: ${data.fullName}
- Age: ${data.age}
- Education: ${data.education}
- Current Skills: ${data.skills}
- Interests: ${data.interests}
- Personality Traits: ${data.personality}
- Preferred Work Style: ${data.workStyle}
- Location: ${data.location}

Return a JSON object with EXACTLY this shape (no markdown, no commentary):
{
  "summary": "2-3 sentence personalized overview of the candidate's career profile",
  "topCareers": [
    {
      "title": "Career title",
      "matchPercentage": 92,
      "description": "1-2 sentence description of why this fits",
      "requiredSkills": ["skill1","skill2","skill3","skill4","skill5"],
      "skillGaps": ["gap1","gap2","gap3"],
      "learningRoadmap": [
        {"step":"Learn X foundations","resource":"Coursera - Course Name","type":"Course"},
        {"step":"Get certified","resource":"AWS/Google/etc certification","type":"Certification"},
        {"step":"Build portfolio","resource":"3 hands-on projects","type":"Project"}
      ],
      "salaryLocal": "Range in ${data.location} (with currency)",
      "salaryGlobal": "Global range in USD",
      "demand": "High/Medium/Low with 1-line context",
      "growthOutlook": "5-10 year forecast in 1-2 sentences",
      "companies": ["Company1","Company2","Company3","Company4","Company5"],
      "roles": ["Entry-level role","Mid-level role","Senior role"],
      "personalityCompatibility": 88,
      "compatibilityReasoning": "Why the personality fits this career (1-2 sentences)",
      "nextSteps": ["Actionable step 1","Step 2","Step 3","Step 4"]
    }
  ],
  "alternatives": [
    {"title":"Backup career 1","reason":"why it fits"},
    {"title":"Backup career 2","reason":"why it fits"},
    {"title":"Backup career 3","reason":"why it fits"}
  ],
  "networkingTips": ["tip1","tip2","tip3","tip4"]
}

Provide EXACTLY 5 careers in topCareers, ranked by matchPercentage descending. Be specific, realistic, and tailored to this exact profile.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a precise career analyst. Always return valid JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
      throw new Error(`AI request failed: ${text}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content returned from AI");

    try {
      return JSON.parse(content) as CareerReport;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Invalid JSON from AI");
      return JSON.parse(match[0]) as CareerReport;
    }
  });
