import express from "express";
import cors from "cors";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

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
//  GOOGLE VISION
// =============================
let visionClient: ImageAnnotatorClient;
let credentialsLoaded = false;

console.log("🔍 Inicializando Google Vision...");

try {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS_JSON;
  
  if (!credentialsJSON) throw new Error("GOOGLE_CREDENTIALS_JSON no está definida");

  let credentials = JSON.parse(credentialsJSON);

  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  visionClient = new ImageAnnotatorClient({
    credentials,
    projectId: credentials.project_id,
  });

  credentialsLoaded = true;
  console.log("✅ Google Vision inicializado");
} catch (e) {
  console.error("❌ ERROR cargando Google:", e);
}

// =============================
//  ELEVENLABS
// =============================
console.log("🔑 Cargando ElevenLabs API KEY:", !!process.env.ELEVENLABS_API_KEY);

const eleven = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,  // Usa la variable del servidor
});

// =============================
//  HEALTH CHECK
// =============================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    googleLoaded: credentialsLoaded,
    elevenKey: !!process.env.ELEVENLABS_API_KEY,
  });
});

// =============================
//  ENDPOINT: OCR + TTS
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
    // 1) LIMPIAR BASE64 → BUFFER
    // ==================================================
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    console.log("🔍 Procesando imagen...");

    const [result] = await visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    console.log("📝 Texto detectado:", recognizedText || "(ninguno)");

    if (!recognizedText) {
      return res.status(444).json({ error: "No se detectó texto en la imagen" });
    }

    // ==================================================
    // 2) TEXT → SPEECH (ELEVENLABS)
    // ==================================================
    console.log("🔊 Generando audio con ElevenLabs...");

    const audioStream = await eleven.textToSpeech.convert(
      "SViKDEbKzJqnyyQeoxow",   // Tu voz en español
      {
        text: recognizedText,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      }
    );

    // Convertir stream a buffer
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    console.log("✅ Audio generado, tamaño:", audioBuffer.length);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);

  } catch (error) {
    console.error("❌ ERROR EN /api/speak:", error);

    const errorMessage =
      (error as any)?.message || JSON.stringify(error);

    res.status(500).json({
      error: "Error interno del servidor",
      details: errorMessage
    });
  }
});

// =============================
//  INICIAR SERVIDOR
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
  console.log(`🌍 Frontend permitido: ${FRONTEND_URL}`);
});
