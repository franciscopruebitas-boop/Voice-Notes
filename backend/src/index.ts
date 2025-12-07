import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { ElevenLabsClient } from "elevenlabs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============================
// GOOGLE VISION - CREDENCIALES
// ============================
const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;

if (!base64) {
  console.error("❌ ERROR: GOOGLE_CREDENTIALS_BASE64 no está definida");
  process.exit(1);
}

let credentials;

try {
  const json = Buffer.from(base64, "base64").toString("utf8");
  credentials = JSON.parse(json);

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Credenciales incompletas");
  }

  console.log("✔ Credenciales de Google cargadas correctamente");
} catch (err) {
  console.error("❌ Error al decodificar GOOGLE_CREDENTIALS_BASE64:", err);
  process.exit(1);
}

const visionClient = new ImageAnnotatorClient({ credentials });

const eleven = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// =========================
// ENDPOINT
// =========================
app.post("/api/speak", async (req, res) => {
  try {
    const { image } = req.body;
    const buffer = Buffer.from(image.split(",")[1], "base64");

    // OCR
    const [result] = await visionClient.textDetection(buffer);
    const text = result.textAnnotations?.[0]?.description?.trim() || "";

    if (!text) {
      return res.status(404).send("No text detected");
    }

    // TTS
    const audio = await eleven.generate({
      voice: process.env.ELEVENLABS_VOICE_ID,
      text,
      model_id: "eleven_multilingual_v2",
    });

    res.set("Content-Type", "audio/mpeg");
    audio.pipe(res);
  } catch (err) {
    console.error("Error en /api/speak:", err);
    res.status(500).send("Server error");
  }
});

app.listen(port, () => console.log(`Servidor en puerto ${port}`));
