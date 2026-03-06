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

  // Keep queries SHORT — 2-3 words like real Roblox catalog searches
  const g = isFemale ? "cute" : "cool";

  return {
    style_tags: ["custom"],
    palette: [],
    gender_expression: isFemale ? "feminine" : "masculine",
    slot_queries: {
      Hair: `${g} hair`,
      Face: `${clean} face`,
      Shirt: `${g} ${clean} shirt`,
      Pants: `${g} ${clean} pants`,
      Torso: `${clean} torso`,
      LeftArm: `${clean} arm`,
      RightArm: `${clean} arm`,
      LeftLeg: `${clean} leg`,
      RightLeg: `${clean} leg`,
      Hat: `${clean} hat`,
      Neck: `${clean} necklace`,
      Back: `${clean} backpack`,
      Waist: `${clean} belt`
    },
    must_have: ["Shirt", "Pants"],
    optional: ["Hair", "Face", "Hat", "Neck", "Back", "Waist"],
    notes: `Styled from: ${clean}`
  };
}

async function getStyleIntent(prompt, bodyMode, variation) {
  const safeBodyMode = normalizeBodyMode(bodyMode);
  const isFemale = safeBodyMode === "R15 Female";

  const genderWord = isFemale ? "girl" : "boy";
  const genderDirective = isFemale
    ? `Avatar is FEMALE. Bias queries toward feminine/cute/women's styles. Add words like "girl", "cute", "pretty", "pink" when they fit the style.`
    : `Avatar is MALE. Bias queries toward masculine/cool/men's styles. Add words like "boy", "cool", "tough", "dark" when they fit the style.`;

  const response = await client.responses.create({
    model: "gpt-4o-mini",
    temperature: 0.75,
    input: [
      {
        role: "system",
        content: `
You are a Roblox avatar outfit builder. You turn style prompts into SHORT search queries for the Roblox avatar catalog.

${genderDirective}

CRITICAL — SEARCH QUERY RULES:
Roblox catalog search is VERY simple. Long or fancy queries return NO results.
- Each query MUST be 2-4 words MAX
- Use simple, common words that Roblox creators actually name their items
- DO NOT use abstract fashion terms like "structured", "deconstructed", "silhouette", "avant-garde"
- DO NOT add "Roblox" or "avatar" to queries
- DO NOT stack multiple adjectives — pick ONE color or ONE style word + the item type

GOOD search queries (these WORK):
- "black hoodie"
- "white crop top"
- "dark pants"
- "blonde hair"
- "red cap"
- "angel wings"
- "gold chain"
- "plaid skirt"
- "cute dress shirt"
- "messy brown hair"
- "black boots"
- "demon horns"

BAD search queries (these return NOTHING):
- "masculine dark academia vintage structured wool hoodie" (way too long)
- "feminine elegant soft pastel cottagecore blouse" (too many adjectives)
- "deconstructed avant-garde asymmetric top" (nobody names items like this)
- "men's sophisticated charcoal trousers" (not how Roblox items are named)

VARIETY: Use the variation seed to pick DIFFERENT colors/substyles each time.
Seed: "${variation.words.join(" ")}" #${variation.id}

If the seed suggests "bold" — pick brighter colors. If "subtle" — pick muted tones. If "vintage" — pick retro items. etc.

For each slot, write a query that a Roblox player would actually type into the catalog search bar.
        `.trim()
      },
      {
        role: "user",
        content: `Style: "${prompt}"\nAvatar: ${genderWord}\nSeed: ${variation.words.join(" ")}`
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
