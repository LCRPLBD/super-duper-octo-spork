import express from "express";
import cors from "cors";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY. Set it before starting the server.");
}

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PORT = process.env.PORT || 3000;

function normalizeBodyMode(bodyMode) {
  if (bodyMode === "R15 Female" || bodyMode === "R15Female") return "R15 Female";
  return "R15 Male";
}

function buildFallbackIntent(prompt, bodyMode) {
  const clean = String(prompt || "").trim();
  const normalizedBody = normalizeBodyMode(bodyMode);

  return {
    style_tags: ["custom"],
    palette: [],
    gender_expression: normalizedBody === "R15 Female" ? "feminine" : "neutral",
    slot_queries: {
      Hair: `${clean} hair`,
      Face: `${clean} face accessory`,
      Shirt: `${clean} shirt`,
      Pants: `${clean} pants`,
      Torso: `${clean} torso`,
      LeftArm: `${clean} left arm`,
      RightArm: `${clean} right arm`,
      LeftLeg: `${clean} left leg`,
      RightLeg: `${clean} right leg`,
      Hat: `${clean} hat`,
      Neck: `${clean} neck accessory`,
      Back: `${clean} back accessory`,
      Waist: `${clean} waist accessory`
    },
    must_have: ["Shirt", "Pants"],
    optional: ["Hair", "Face", "Hat", "Neck", "Back", "Waist"],
    notes: `Styled from: ${clean}`
  };
}

async function getStyleIntent(prompt, bodyMode) {
  const safeBodyMode = normalizeBodyMode(bodyMode);

  const response = await client.responses.create({
    model: "gpt-5-mini",
    temperature: 0.35,
    input: [
      {
        role: "system",
        content: `
You are an expert Roblox avatar stylist.

Interpret any fashion request, even if it is vague, abstract, contradictory, overloaded, misspelled, or not written as keywords.

Examples:
- "Dark Academia"
- "Pink Black Blue Orange Maid"
- "soft vampire school outfit"
- "coquette angel but streetwear"
- "sad rainy anime library outfit"

Your job:
- infer the best cohesive outfit concept
- prioritize style coherence over literal word stuffing
- intelligently simplify chaotic prompts
- choose the strongest colors and aesthetics when too many are provided
- create practical search phrases for Roblox avatar categories

Rules:
- Return only valid JSON
- Do not invent asset IDs
- Do not mention Roblox limitations
- Make search phrases specific and usable
- Prefer stylish, wearable, coherent output
        `.trim()
      },
      {
        role: "user",
        content: `Prompt: "${prompt}"\nBody Mode: "${safeBodyMode}"`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "roblox_outfit_intent",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            style_tags: {
              type: "array",
              items: { type: "string" }
            },
            palette: {
              type: "array",
              items: { type: "string" }
            },
            gender_expression: {
              type: "string"
            },
            slot_queries: {
              type: "object",
              additionalProperties: false,
              properties: {
                Hair: { type: "string" },
                Face: { type: "string" },
                Shirt: { type: "string" },
                Pants: { type: "string" },
                Torso: { type: "string" },
                LeftArm: { type: "string" },
                RightArm: { type: "string" },
                LeftLeg: { type: "string" },
                RightLeg: { type: "string" },
                Hat: { type: "string" },
                Neck: { type: "string" },
                Back: { type: "string" },
                Waist: { type: "string" }
              },
              required: ["Shirt", "Pants"]
            },
            must_have: {
              type: "array",
              items: { type: "string" }
            },
            optional: {
              type: "array",
              items: { type: "string" }
            },
            notes: {
              type: "string"
            }
          },
          required: [
            "style_tags",
            "palette",
            "gender_expression",
            "slot_queries",
            "must_have",
            "optional",
            "notes"
          ]
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/generate-intent", async (req, res) => {
  try {
    const { prompt, bodyMode, playerId } = req.body ?? {};

    if (typeof prompt !== "string" || prompt.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: "Prompt must be at least 3 characters."
      });
    }

    const cleanPrompt = prompt.trim().slice(0, 200);
    const safeBodyMode = normalizeBodyMode(bodyMode);

    let intent;
    try {
      intent = await getStyleIntent(cleanPrompt, safeBodyMode);
    } catch (err) {
      console.error("OpenAI failed, using fallback intent:", err);
      intent = buildFallbackIntent(cleanPrompt, safeBodyMode);
    }

    return res.json({
      success: true,
      playerId: String(playerId ?? ""),
      intent
    });
  } catch (err) {
    console.error("generate-intent failed:", err);
    return res.status(500).json({
      success: false,
      error: "Intent generation failed."
    });
  }
});

app.listen(PORT, () => {
  console.log(`TryOn Studio AI running on port ${PORT}`);
});
