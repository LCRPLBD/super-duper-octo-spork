import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PORT = process.env.PORT || 3000;

/*
  IMPORTANT:
  This is a starter "catalog" source.
  Replace this later with your real indexed Roblox item database.
*/
function fakeSearchCatalog(category, query) {
  // Deterministic-ish placeholder results so the pipeline works now.
  const baseIdMap = {
    Hair: 1100000000,
    Face: 1200000000,
    Shirt: 1300000000,
    Pants: 1400000000,
    Torso: 1500000000,
    LeftArm: 1600000000,
    RightArm: 1700000000,
    LeftLeg: 1800000000,
    RightLeg: 1900000000,
    Hat: 2000000000,
    Neck: 2100000000,
    Back: 2200000000,
    Waist: 2300000000
  };

  const start = baseIdMap[category] || 900000000;
  return [
    { id: start + 1, name: `${query} A`, price: 75 },
    { id: start + 2, name: `${query} B`, price: 100 },
    { id: start + 3, name: `${query} C`, price: 125 }
  ];
}

function pickBest(items, multi = false) {
  if (!items || items.length === 0) return null;
  if (multi) return [items[0]];
  return items[0];
}

function normalizeBodyMode(bodyMode) {
  if (bodyMode === "R15 Female" || bodyMode === "R15Female") return "R15 Female";
  return "R15 Male";
}

function buildFallbackIntent(prompt, bodyMode) {
  const clean = String(prompt || "").trim();

  return {
    style_tags: ["custom"],
    palette: [],
    gender_expression: bodyMode === "R15 Female" ? "feminine" : "neutral",
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
    temperature: 0.4,
    input: [
      {
        role: "system",
        content: `
You are an expert Roblox avatar stylist.

Your job is to interpret any fashion request, even if it is vague, messy, abstract, contradictory, misspelled, or not written as keywords.

Examples of valid user inputs:
- "Dark Academia"
- "Pink Black Blue Orange Maid"
- "soft rich vampire school girl"
- "coquette angel but streetwear"
- "sad rainy anime library outfit"

You must:
- infer the most coherent style possible
- prioritize aesthetic coherence over literal word stuffing
- blend colors intelligently if many are given
- choose what matters most when the prompt is overloaded
- create practical search phrases for Roblox avatar categories

Rules:
- Return only JSON
- Do not invent asset IDs
- Make the outfit stylish and wearable
- If the prompt is chaotic, simplify it into the best cohesive interpretation
- Body mode affects styling bias, but do not mention it in notes
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

  const text = response.output_text;
  return JSON.parse(text);
}

function buildOutfitFromIntent(intent) {
  const q = intent.slot_queries || {};

  const shirtCandidates = fakeSearchCatalog("Shirt", q.Shirt || "stylish shirt");
  const pantsCandidates = fakeSearchCatalog("Pants", q.Pants || "stylish pants");
  const torsoCandidates = fakeSearchCatalog("Torso", q.Torso || "matching torso");
  const leftArmCandidates = fakeSearchCatalog("LeftArm", q.LeftArm || "matching left arm");
  const rightArmCandidates = fakeSearchCatalog("RightArm", q.RightArm || "matching right arm");
  const leftLegCandidates = fakeSearchCatalog("LeftLeg", q.LeftLeg || "matching left leg");
  const rightLegCandidates = fakeSearchCatalog("RightLeg", q.RightLeg || "matching right leg");

  const hairCandidates = fakeSearchCatalog("Hair", q.Hair || "matching hair");
  const faceCandidates = fakeSearchCatalog("Face", q.Face || "matching face accessory");
  const hatCandidates = fakeSearchCatalog("Hat", q.Hat || "matching hat");
  const neckCandidates = fakeSearchCatalog("Neck", q.Neck || "matching neck accessory");
  const backCandidates = fakeSearchCatalog("Back", q.Back || "matching back accessory");
  const waistCandidates = fakeSearchCatalog("Waist", q.Waist || "matching waist accessory");

  return {
    Shirt: pickBest(shirtCandidates, false),
    Pants: pickBest(pantsCandidates, false),
    Torso: pickBest(torsoCandidates, false),
    LeftArm: pickBest(leftArmCandidates, false),
    RightArm: pickBest(rightArmCandidates, false),
    LeftLeg: pickBest(leftLegCandidates, false),
    RightLeg: pickBest(rightLegCandidates, false),
    Hair: pickBest(hairCandidates, true),
    Face: pickBest(faceCandidates, true),
    Hat: pickBest(hatCandidates, true),
    Neck: pickBest(neckCandidates, true),
    Back: pickBest(backCandidates, true),
    Waist: pickBest(waistCandidates, true),
    description: intent.notes || "AI styled outfit"
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/generate-outfit", async (req, res) => {
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
      console.error("OpenAI intent generation failed, using fallback:", err);
      intent = buildFallbackIntent(cleanPrompt, safeBodyMode);
    }

    const outfit = buildOutfitFromIntent(intent);

    return res.json({
      success: true,
      playerId: String(playerId ?? ""),
      intent,
      outfit
    });
  } catch (err) {
    console.error("generate-outfit failed:", err);
    return res.status(500).json({
      success: false,
      error: "Generation failed."
    });
  }
});

app.listen(PORT, () => {
  console.log(`TryOn Studio AI running on port ${PORT}`);
});