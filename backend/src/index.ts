import express from "express";
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
//  GOOGLE VISION CLIENT
// =============================
let visionClient: ImageAnnotatorClient;

try {
  // Intenta cargar las credenciales desde la variable de entorno
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS_JSON;
  
  if (!credentialsJSON) {
    throw new Error("❌ GOOGLE_CREDENTIALS_JSON no está definida en las variables de entorno");
  }

  // Parsea las credenciales
  const credentials = JSON.parse(credentialsJSON);
  
  // Inicializa el cliente con las credenciales directamente
  visionClient = new ImageAnnotatorClient({
    credentials: credentials,
  });
  
  console.log("✅ Cliente de Google Vision inicializado correctamente");
} catch (error) {
  console.error("❌ Error al inicializar Google Vision:", error);
  // Inicializa un cliente vacío para evitar errores de compilación
  visionClient = new ImageAnnotatorClient();
}

// =============================
//  HEALTH CHECK
// =============================
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Voice Notes API funcionando" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
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

    // Verificar que el cliente de Vision está inicializado
    if (!visionClient) {
      console.error("❌ Cliente de Vision no inicializado");
      return res.status(500).json({ error: "Servicio de reconocimiento no disponible" });
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

    console.log("📝 Texto reconocido:", recognizedText);

    if (!recognizedText) {
      return res.status(444).json({ error: "No se detectó texto en la imagen" });
    }

    // ==========================
    //     TEXT → SPEECH
    // ==========================
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      console.error("❌ ELEVENLABS_API_KEY no está definida");
      return res.status(500).json({ error: "Configuración de audio no disponible" });
    }

    console.log("🔊 Generando audio con ElevenLabs...");

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
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
    
    console.log("✅ Audio generado correctamente");

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    console.error("❌ ERROR EN /api/speak:", error);
    
    // Proporcionar más detalles del error
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
});
