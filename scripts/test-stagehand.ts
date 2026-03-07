import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";
import { Stagehand } from "@browserbasehq/stagehand";
import { runStagehandDemo, type DemoStep } from "../src/demo-video";
import {
  generateVoiceoverPackage,
  type InteractionEvent,
} from "../src/voiceover";

const OUTPUT_DIR = path.resolve("output");
const EVENTS_FILE = path.join(OUTPUT_DIR, "interaction-events.json");
const VOICEOVER_DIR = path.join(OUTPUT_DIR, "voiceover");
const DEMO_CONTEXT =
  "A short product demo on the Wikipedia Artificial intelligence article. Keep the narration concrete, warm, and concise.";

type SerializedDemoEvent = {
  kind: string;
  startMs: number;
  endMs: number;
  description?: string;
  url?: string;
  textLength?: number;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeInstructionSentence(value: string) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[\d.\-:)\]]+\s*/, "");

  if (!cleaned) {
    return "Narrate the visible interaction.";
  }

  const withPeriod = /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  return withPeriod.charAt(0).toUpperCase() + withPeriod.slice(1);
}

function inferInteraction(event: SerializedDemoEvent) {
  const haystack = normalizeWhitespace(
    [event.kind, event.description, event.url].filter(Boolean).join(" "),
  ).toLowerCase();

  if (!haystack) {
    return null;
  }

  if (/\b(type|fill|enter text|insert text|input)\b/.test(haystack)) {
    return {
      device: "keyboard" as const,
      kind: "type" as const,
    };
  }

  if (/\b(scroll|wheel)\b/.test(haystack)) {
    return {
      device: "mouse" as const,
      kind: "scroll" as const,
    };
  }

  if (/\b(move|pointer-move|cursor)\b/.test(haystack)) {
    return {
      device: "mouse" as const,
      kind: "move" as const,
    };
  }

  if (/\b(hover)\b/.test(haystack)) {
    return {
      device: "mouse" as const,
      kind: "hover" as const,
    };
  }

  if (/\b(drag|drop)\b/.test(haystack)) {
    return {
      device: "mouse" as const,
      kind: "drag" as const,
    };
  }

  if (/\b(click|tap|button|select|open|toggle|check|uncheck)\b/.test(haystack)) {
    return {
      device: "mouse" as const,
      kind: "click" as const,
    };
  }

  if (event.kind === "click") {
    return {
      device: "mouse" as const,
      kind: "click" as const,
    };
  }

  if (event.kind === "pointer-move") {
    return {
      device: "mouse" as const,
      kind: "move" as const,
    };
  }

  if (event.kind === "type") {
    return {
      device: "keyboard" as const,
      kind: "type" as const,
    };
  }

  return null;
}

function buildInteractionEvents(metadataPath: string) {
  const raw = fs.readFileSync(metadataPath, "utf8");
  const metadata = JSON.parse(raw) as {
    events?: SerializedDemoEvent[];
  };

  return (metadata.events ?? [])
    .map((event, index) => {
      const interaction = inferInteraction(event);
      if (!interaction) {
        return null;
      }

      const fallbackDescription =
        event.kind === "navigate" && event.url
          ? `Navigate to ${event.url}.`
          : "Narrate the visible interaction.";
      const description = normalizeInstructionSentence(
        event.description ?? fallbackDescription,
      );

      return {
        id: `event-${String(event.startMs).padStart(6, "0")}-${String(index + 1).padStart(2, "0")}`,
        device: interaction.device,
        kind: interaction.kind,
        instruction: description,
        actionDescription: description,
        selector: undefined,
        method: event.kind,
        arguments:
          event.kind === "type" && event.textLength
            ? [`${event.textLength} characters`]
            : undefined,
        startMs: event.startMs,
        endMs: event.endMs,
      } satisfies InteractionEvent;
    })
    .filter(Boolean) as InteractionEvent[];
}

async function main() {
  console.log("Initializing Stagehand with Browserbase...");

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: {
      modelName: "google/gemini-2.5-flash",
      apiKey: process.env.GEMINI_API_KEY,
    },
    browserbaseSessionCreateParams: {
      browserSettings: {
        recordSession: true,
        viewport: { width: 1280, height: 720 },
      },
    },
  });

  await stagehand.init();
  console.log("Session ID:", stagehand.browserbaseSessionId);
  console.log(
    "Session replay:",
    `https://www.browserbase.com/sessions/${stagehand.browserbaseSessionId}`,
  );

  const steps: DemoStep[] = [
    {
      kind: "goto",
      url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
      waitUntil: "domcontentloaded",
      settleMs: 2200,
    },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    {
      kind: "act",
      instruction: 'click the "History" link in the article contents or body',
      settleMs: 1200,
    },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    { kind: "act", instruction: "scroll down the page", settleMs: 700 },
    { kind: "act", instruction: "scroll to the top of the page", settleMs: 1200 },
  ];

  try {
    const artifacts = await runStagehandDemo(stagehand, steps, {
      outputDir: OUTPUT_DIR,
      rawCaptureFps: 30,
      outputFps: 30,
      fastForwardMultiplier: 6,
    });

    console.log(`Raw frames: ${artifacts.rawFrameCount}`);
    console.log(`Rendered frames: ${artifacts.renderedFrameCount}`);
    console.log(`Video saved to ${artifacts.outputVideoPath}`);
    console.log(`Metadata saved to ${artifacts.metadataPath}`);

    const interactionEvents = buildInteractionEvents(artifacts.metadataPath);
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(interactionEvents, null, 2));
    console.log(
      `Saved ${interactionEvents.length} interaction event(s) to ${EVENTS_FILE}`,
    );

    if (interactionEvents.length > 0) {
      console.log("Generating event-driven voiceover segments with Gemini...");
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
        });
        const { manifest } = await generateVoiceoverPackage({
          ai,
          context: DEMO_CONTEXT,
          events: interactionEvents,
          outputDir: VOICEOVER_DIR,
          scriptModel: process.env.GEMINI_SCRIPT_MODEL,
          sourceVideo: artifacts.outputVideoPath,
          ttsModel: process.env.GEMINI_TTS_MODEL,
          voiceName: process.env.GEMINI_TTS_VOICE,
        });
        console.log(
          `Saved ${manifest.segmentCount} voiceover segment(s) to ${VOICEOVER_DIR}`,
        );
      } catch (err) {
        console.error("Voiceover generation failed:", err);
      }
    } else {
      console.log(
        "No mouse/keyboard events were recorded. Skipping voiceover generation.",
      );
    }
  } finally {
    console.log("Closing browser...");
    await stagehand.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
