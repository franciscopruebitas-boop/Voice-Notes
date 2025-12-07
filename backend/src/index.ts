import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { ElevenLabsClient } from "elevenlabs";
import vision from "@google-cloud/vision";


dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ============================
// GOOGLE VISION - CREDENCIALES
// ============================

const visionClient = new vision.ImageAnnotatorClient();

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
