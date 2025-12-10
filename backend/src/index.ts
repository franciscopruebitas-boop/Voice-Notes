import express from "express";
import cors from "cors";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import textToSpeech from '@google-cloud/text-to-speech';

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
//  GOOGLE CLIENTS
// =============================
let visionClient: ImageAnnotatorClient;
let ttsClient: any;
let credentialsLoaded = false;

console.log("🔍 Inicializando servicios de Google...");

try {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS_JSON;
  
  if (!credentialsJSON) {
    throw new Error("GOOGLE_CREDENTIALS_JSON no está definida");
  }

  let credentials = JSON.parse(credentialsJSON);
  
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  console.log("✓ type:", credentials.type);
  console.log("✓ project_id:", credentials.project_id);
  console.log("✓ client_email:", credentials.client_email);

  // Inicializa Vision
  visionClient = new ImageAnnotatorClient({
    credentials: credentials,
    projectId: credentials.project_id,
  });

  // Inicializa Text-to-Speech
  ttsClient = new textToSpeech.TextToSpeechClient({
    credentials: credentials,
    projectId: credentials.project_id,
  });
  
  credentialsLoaded = true;
  console.log("✅ Servicios de Google inicializados correctamente");
} catch (error) {
  console.error("❌ Error al inicializar servicios de Google:");
  console.error(error);
  credentialsLoaded = false;
}

// =============================
//  HEALTH CHECK
// =============================
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "Voice Notes API funcionando",
    credentialsLoaded: credentialsLoaded 
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    credentialsLoaded: credentialsLoaded,
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
      console.error("❌ Credenciales de Google no cargadas");
      return res.status(500).json({ 
        error: "Servicio no disponible"
      });
    }

    // Limpiar el base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    console.log("🔍 Procesando imagen con Google Vision...");

    // Detectar texto en la imagen
    const [result] = await visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    console.log("📝 Texto detectado:", recognizedText ? `"${recognizedText.substring(0, 50)}..."` : "ninguno");

    if (!recognizedText) {
      return res.status(444).json({ error: "No se detectó texto en la imagen" });
    }

    // ==========================
    //  TEXT → SPEECH (Google)
    // ==========================
    console.log("🔊 Generando audio con Google Text-to-Speech...");

    import { ElevenLabsClient, play } from '@elevenlabs/elevenlabs-js';

    const elevenlabs = new ElevenLabsClient({
        apiKey: "process.env.ELEVENLABS_API_KEY", // Defaults to process.env.ELEVENLABS_API_KEY
    });

    const audio = await elevenlabs.textToSpeech.convert(
      'JBFqnCBsd6RMkjVDRZzb', // voice_id
      {
        text: 'The first move is what sets everything in motion.',
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128', // output_format
      }
    );

    await play(audio);

  } catch (error) {
    console.error("❌ ERROR EN /api/speak:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    
    res.status(500).json({ 
      error: "Error interno del servidor",
      details: errorMessage
    });
  }
});

// =============================
//       INICIAR SERVIDOR
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
  console.log(`🌍 Frontend permitido: ${FRONTEND_URL}`);
});
