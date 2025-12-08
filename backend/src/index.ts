import express from "express";
import fs from "fs";
import cors from "cors";
import { ImageAnnotatorClient } from "@google-cloud/vision";

const app = express();
app.use(express.json({ limit: "10mb" }));

// =============================
//  CORS
// =============================
const FRONTEND_URL = process.env.FRONTEND_URL || "https://voice-notes-frontend.onrender.com";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// =============================
//  CARGA DE CREDENCIALES GOOGLE
// =============================

const credentialsPath = "/opt/render/project/src/backend/service-account.json";

function ensureGoogleCredentials() {
  console.log("📌 PATH USADO PARA CREDENCIALES:", credentialsPath);

  const jsonString = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!jsonString) {
    console.error("❌ ERROR: GOOGLE_CREDENTIALS_JSON no está definida en Render");
    return;
  }

  try {
    fs.writeFileSync(credentialsPath, jsonString);
    console.log("✔ Credenciales de Google generadas correctamente.");

    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  } catch (err) {
    console.error("❌ Error creando archivo de credenciales:", err);
  }
}

// =============================
//  GOOGLE VISION CLIENT
// =============================
const visionClient = new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// =============================
//  ENDPOINT /api/speak
// =============================
app.post("/api/speak", async (req, res) => {
  try {
    const image = req.body.image;

    if (!image) {
      return res.status(400).json({ error: "image requerido" });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const [result] = await visionClient.textDetection(imageBuffer);
    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    if (!recognizedText) {
      return res.status(444).json({ error: "no se detectó texto" });
    }

    // ==========================
    //     TEXT → SPEECH
    // ==========================
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
        },
        body: JSON.stringify({
          text: recognizedText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const err = await ttsResponse.text();
      console.error("❌ Error ElevenLabs:", err);
      return res.status(500).json({ error: "Error generando audio" });
    }

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);

  } catch (error) {
    console.error("ERROR EN /api/speak:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// =============================
//       INICIAR SERVIDOR
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
