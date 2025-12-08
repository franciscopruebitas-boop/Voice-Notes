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
let credentialsLoaded = false;

console.log("🔍 Verificando variables de entorno...");
console.log("GOOGLE_CREDENTIALS_JSON existe:", !!process.env.GOOGLE_CREDENTIALS_JSON);
console.log("ELEVENLABS_API_KEY existe:", !!process.env.ELEVENLABS_API_KEY);

try {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS_JSON;
  
  if (!credentialsJSON) {
    throw new Error("GOOGLE_CREDENTIALS_JSON no está definida");
  }

  console.log("📄 Longitud del JSON de credenciales:", credentialsJSON.length);
  console.log("🔤 Primeros 50 caracteres:", credentialsJSON.substring(0, 50));

  // Parsea las credenciales
  const credentials = JSON.parse(credentialsJSON);
  
  // Verifica campos importantes
  console.log("✓ type:", credentials.type);
  console.log("✓ project_id:", credentials.project_id);
  console.log("✓ client_email:", credentials.client_email);
  console.log("✓ private_key existe:", !!credentials.private_key);
  console.log("✓ private_key longitud:", credentials.private_key?.length || 0);

  // Verifica que el private_key tenga el formato correcto
  if (!credentials.private_key || !credentials.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new Error("private_key no tiene el formato correcto");
  }

  // Inicializa el cliente con las credenciales directamente
  visionClient = new ImageAnnotatorClient({
    credentials: credentials,
    projectId: credentials.project_id,
  });
  
  credentialsLoaded = true;
  console.log("✅ Cliente de Google Vision inicializado correctamente");
} catch (error) {
  console.error("❌ Error al inicializar Google Vision:");
  console.error(error);
  
  if (error instanceof SyntaxError) {
    console.error("⚠️  El JSON de credenciales está malformado");
  }
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
    envVars: {
      googleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
      elevenlabsKey: !!process.env.ELEVENLABS_API_KEY,
      frontendUrl: !!process.env.FRONTEND_URL,
    }
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

    // Verificar que las credenciales se cargaron
    if (!credentialsLoaded) {
      console.error("❌ Credenciales de Google no cargadas");
      return res.status(500).json({ 
        error: "Servicio de reconocimiento no disponible",
        details: "Credenciales no inicializadas"
      });
    }

    // Limpiar el base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    console.log("🔍 Procesando imagen con Google Vision...");
    console.log("📊 Tamaño de imagen:", imageBuffer.length, "bytes");

    // Detectar texto en la imagen
    const [result] = await visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    console.log("📝 Texto reconocido:", recognizedText.substring(0, 100));

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
    
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    const errorStack = error instanceof Error ? error.stack : "";
    
    res.status(500).json({ 
      error: "Error interno del servidor",
      details: errorMessage,
      stack: errorStack 
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
