import { Stagehand } from "@browserbasehq/stagehand";

const DEFAULT_VIEWPORT = {
  width: 1280,
  height: 720,
} as const;

export const DEFAULT_STAGEHAND_MODEL_NAME = "google/gemini-2.5-flash";

export function createBrowserbaseStagehand() {
  return new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: {
      modelName: DEFAULT_STAGEHAND_MODEL_NAME,
      apiKey: process.env.GEMINI_API_KEY,
    },
    browserbaseSessionCreateParams: {
      browserSettings: {
        recordSession: true,
        viewport: { ...DEFAULT_VIEWPORT },
      },
    },
  });
}

export function browserbaseSessionReplayUrl(sessionId: string | undefined) {
  return sessionId
    ? `https://www.browserbase.com/sessions/${sessionId}`
    : undefined;
}
