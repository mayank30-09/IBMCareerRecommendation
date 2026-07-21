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

const BACKEND_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_BACKEND_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.VITE_BACKEND_URL) ||
  "https://careerpilot-ai-backend-zwz3.onrender.com";

export const generateCareerReport = createServerFn({ method: "POST" })
  .validator((input: CareerInput) => input)
  .handler(async ({ data }): Promise<CareerReport> => {
    // Transform comma-separated string fields into array required by Express backend validator
    const skillsArray = data.skills
      ? data.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : ["General"];
    const interestsArray = data.interests
      ? data.interests.split(",").map((i) => i.trim()).filter(Boolean)
      : ["General"];

    const payload = {
      skills: skillsArray.length > 0 ? skillsArray : ["General"],
      interests: interestsArray.length > 0 ? interestsArray : ["General"],
      education: data.education || "Not specified",
      experience: `Age: ${data.age || "N/A"}, Location: ${data.location || "N/A"}, Work Style: ${data.workStyle || "Flexible"}`,
      careerGoals: `Candidate: ${data.fullName || "Candidate"}, Personality: ${data.personality || "Adaptable"}`,
    };

    const res = await fetch(`${BACKEND_URL}/api/v1/recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      const errorMessage =
        errorJson?.message || `Backend request failed with status ${res.status}`;
      throw new Error(errorMessage);
    }

    const responseData = await res.json();

    const recommendation =
      responseData.data?.recommendation ||
      responseData.recommendation ||
      responseData.data ||
      responseData;

    if (!recommendation || !recommendation.topCareers) {
      throw new Error("Invalid recommendation response format received from backend");
    }

    return recommendation as CareerReport;
  });
