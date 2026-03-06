import express from "express";
import cors from "cors";
import OpenAI from "openai";
import crypto from "crypto";

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

// Generate a short random variation seed so repeated prompts get different results
function generateVariationSeed() {
  const adjectives = [
    "bold", "subtle", "edgy", "soft", "clean", "layered", "minimal", "maximal",
    "vintage", "modern", "oversized", "fitted", "relaxed", "sharp", "flowy",
    "structured", "deconstructed", "sporty", "elegant", "rugged", "sleek",
    "textured", "muted", "vibrant", "pastel", "dark", "light", "monochrome",
    "colorful", "asymmetric", "classic", "experimental", "cozy", "formal"
  ];
  const picked = [];
  for (let i = 0; i < 2; i++) {
    picked.push(adjectives[Math.floor(Math.random() * adjectives.length)]);
  }
  const hex = crypto.randomBytes(3).toString("hex");
  return { words: picked, id: hex };
}

function buildFallbackIntent(prompt, bodyMode) {
  const clean = String(prompt || "").trim();
  const normalizedBody = normalizeBodyMode(bodyMode);
  const isFemale = normalizedBody === "R15 Female";

  // Add gender hint to search queries
  const genderHint = isFemale ? "feminine" : "masculine";

  return {
    style_tags: ["custom"],
    palette: [],
    gender_expression: isFemale ? "feminine" : "masculine",
    slot_queries: {
      Hair: `${genderHint} ${clean} hair`,
      Face: `${clean} face accessory`,
      Shirt: `${genderHint} ${clean} shirt`,
      Pants: `${genderHint} ${clean} pants`,
      Torso: `${genderHint} ${clean} torso`,
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

async function getStyleIntent(prompt, bodyMode, variation) {
  const safeBodyMode = normalizeBodyMode(bodyMode);
  const isFemale = safeBodyMode === "R15 Female";

  const genderDirective = isFemale
    ? `The player is using a FEMALE avatar. Strongly prioritize feminine, women's, and girls' clothing and accessories. Use search terms like "feminine", "women's", "girl", "cute", "elegant" where appropriate. Avoid masculine or men's items unless the prompt specifically asks for them.`
    : `The player is using a MALE avatar. Strongly prioritize masculine, men's, and boys' clothing and accessories. Use search terms like "masculine", "men's", "boy", "tough", "sharp" where appropriate. Avoid feminine or women's items unless the prompt specifically asks for them.`;

  const response = await client.responses.create({
    model: "gpt-4o-mini",
    temperature: 0.9,
    input: [
      {
        role: "system",
        content: `
You are an expert Roblox avatar stylist.

Interpret any fashion request, even if it is vague, abstract, contradictory, overloaded, misspelled, or not written as keywords.

${genderDirective}

IMPORTANT — VARIETY RULE:
Every time you receive a prompt, you MUST create a DIFFERENT outfit variation, even if the prompt is identical to a previous one. Use the provided variation seed to inspire different choices — pick different colors, silhouettes, sub-styles, brands, or aesthetic angles each time. Never repeat the same combination of search queries twice.

Variation seed for this request: "${variation.words.join(" ")}" (ID: ${variation.id})
Use this seed to push your choices in a unique direction. For example, if the seed says "bold vintage", lean into retro statement pieces. If it says "minimal dark", go for understated black/gray items.

Examples of prompts:
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
- VARY your output each time — never give the same outfit twice

Rules:
- Return only valid JSON
- Do not invent asset IDs
- Do not mention Roblox limitations
- Make search phrases specific and usable
- Prefer stylish, wearable, coherent output
- Include gender-appropriate terms in search queries (e.g. "men's dark hoodie" or "women's plaid skirt")
        `.trim()
      },
      {
        role: "user",
        content: `Prompt: "${prompt}"\nBody Mode: "${safeBodyMode}"\nVariation: ${variation.words.join(" ")} #${variation.id}`
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
              required: ["Hair", "Face", "Shirt", "Pants", "Torso", "LeftArm", "RightArm", "LeftLeg", "RightLeg", "Hat", "Neck", "Back", "Waist"]
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
    const variation = generateVariationSeed();

    console.log(`[generate-intent] player=${playerId} body=${safeBodyMode} prompt="${cleanPrompt}" variation=${variation.words.join("+")}#${variation.id}`);

    let intent;
    try {
      intent = await getStyleIntent(cleanPrompt, safeBodyMode, variation);
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
