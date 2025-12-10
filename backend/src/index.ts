import express from "express";
import cors from "cors";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import textToSpeech from '@google-cloud/text-to-speech';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "10mb" }));

// =============================
//  CORS
// =============================
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://voice-notes-frontend.onrender.com";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// =============================
//  GOOGLE CLIENTS
// =============================
let visionClient: ImageAnnotatorClient;
let ttsClient: any;
let credentialsLoaded = false;

console.log("🔧 Inicializando servicios de Google...");

try {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!credentialsJSON) throw new Error("GOOGLE_CREDENTIALS_JSON no está definida");

  let credentials = JSON.parse(credentialsJSON);

  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  visionClient = new ImageAnnotatorClient({
    credentials,
    projectId: credentials.project_id,
  });

  ttsClient = new textToSpeech.TextToSpeechClient({
    credentials,
    projectId: credentials.project_id,
  });

  credentialsLoaded = true;
  console.log("✅ Google Vision y Google TTS inicializados");
} catch (e) {
  console.error("❌ Error Google:", e);
}

// =============================
//  ELEVENLABS CLIENT (COMENTADO)
// =============================
let elevenLabsClient: ElevenLabsClient | null = null;

/*
if (process.env.ELEVENLABS_API_KEY) {
  elevenLabsClient = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });
  console.log("✅ ElevenLabs inicializado");
} else {
  console.warn("⚠️ ELEVENLABS_API_KEY no está definida");
}
*/

// =============================
//  OPENAI TTS CLIENT
// =============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =============================
//  HEALTH CHECK
// =============================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    googleLoaded: credentialsLoaded,
    elevenLabsLoaded: !!elevenLabsClient,
    openAI: !!process.env.OPENAI_API_KEY,
  });
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

    if (!credentialsLoaded) {
      return res.status(500).json({ error: "Google Vision no está disponible" });
    }

    // ==================================================
    // 1) LIMPIAR BASE64
    // ==================================================
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");

    console.log("🔍 Procesando imagen...");

    // ==================================================
    // 2) GOOGLE VISION → TEXTO
    // ==================================================
    const [result] = await visionClient.textDetection({
      image: { content: imgBuffer },
    });

    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    console.log("📝 Texto detectado:", recognizedText || "(ninguno)");

    if (!recognizedText) {
      return res.status(444).json({ error: "No se detectó texto en la imagen" });
    }

    // ==================================================
    // 3) TEXT → SPEECH (OPENAI TTS)
    // ==================================================
    console.log("🔊 Generando audio con OpenAI TTS...");

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: recognizedText,
      format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    console.log("✅ Audio OpenAI generado:", buffer.length);

    res.setHeader("Content-Type", "audio/mpeg");
    return res.send(buffer);

    // ==================================================
    // 4) ALTERNATIVA: ElevenLabs (COMPLETAMENTE COMENTADO)
    // ==================================================

    /*
    if (!elevenLabsClient) {
      throw new Error("ElevenLabs no disponible");
    }

    const audioStream = await elevenLabsClient.textToSpeech.convert(
      "JBFqnCBsd6RMkjVDRZzb",
      {
        text: recognizedText,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      }
    );

    const reader = audioStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const audioBuffer = Buffer.concat(chunks);
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
    */

  } catch (e: any) {
    console.error("❌ ERROR /api/speak:", e);
    res.status(500).json({ error: e?.message || "Error desconocido" });
  }
});

// =============================
//  START SERVER
// =============================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
  console.log(`🌍 Frontend permitido: ${FRONTEND_URL}`);
});
