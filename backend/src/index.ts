import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { ElevenLabsClient } from "elevenlabs";
import { Readable } from "stream";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Aplicar el middleware CORS globalmente y al principio
app.use(cors());

const visionClient = new ImageAnnotatorClient();
const elevenlabsClient = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("Hello from the backend!");
});

app.post("/api/speak", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).send("No se proporcionó ninguna imagen.");
    }

    const imageBuffer = Buffer.from(image.split(",")[1], "base64");

    const [result] = await visionClient.textDetection(imageBuffer);
    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    if (!recognizedText) {
      return res.status(404).send("No se pudo reconocer texto en la imagen.");
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

    const audio = await elevenlabsClient.generate({
      voice: voiceId,
      text: recognizedText,
      model_id: "eleven_multilingual_v2",
    });

    res.set("Content-Type", "audio/mpeg");
    audio.pipe(res);

  } catch (error) {
    console.error("Error en el endpoint /api/speak:", error);
    res.status(500).send("Ocurrió un error en el servidor.");
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

