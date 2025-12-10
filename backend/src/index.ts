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
let projectId = "";

console.log("🔍 Inicializando Google Vision...");

try {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS_JSON;
  
  if (!credentialsJSON) {
    throw new Error("GOOGLE_CREDENTIALS_JSON no está definida");
  }

  console.log("📄 Longitud del JSON:", credentialsJSON.length);

  // Parsear y validar
  let credentials = JSON.parse(credentialsJSON);
  
  // Validaciones críticas
  if (!credentials.type || credentials.type !== "service_account") {
    throw new Error("El tipo de credencial no es 'service_account'");
  }
  
  if (!credentials.private_key) {
    throw new Error("No se encontró private_key en las credenciales");
  }
  
  if (!credentials.client_email) {
    throw new Error("No se encontró client_email en las credenciales");
  }
  
  if (!credentials.project_id) {
    throw new Error("No se encontró project_id en las credenciales");
  }

  // Procesar el private_key - MÚLTIPLES INTENTOS
  let privateKey = credentials.private_key;
  
  // Si tiene \\n literales, convertirlos
  if (privateKey.includes('\\n')) {
    console.log("⚠️  Detectados \\\\n literales, procesando...");
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  
  // Validar formato del private_key
  if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
    console.error("❌ El private_key no empieza con BEGIN PRIVATE KEY");
    throw new Error("Formato de private_key inválido");
  }
  
  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    console.error("❌ El private_key no contiene END PRIVATE KEY");
    throw new Error("Formato de private_key inválido");
  }
  
  // Actualizar el private_key procesado
  credentials.private_key = privateKey;
  
  projectId = credentials.project_id;
  
  console.log("✓ type:", credentials.type);
  console.log("✓ project_id:", credentials.project_id);
  console.log("✓ client_email:", credentials.client_email);
  console.log("✓ private_key_id:", credentials.private_key_id?.substring(0, 10) + "...");
  console.log("✓ private_key longitud:", credentials.private_key.length);
  console.log("✓ private_key empieza correctamente:", credentials.private_key.startsWith('-----BEGIN'));
  console.log("✓ private_key termina correctamente:", credentials.private_key.endsWith('-----\n'));

  // Inicializar el cliente
  visionClient = new ImageAnnotatorClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: credentials.project_id,
  });
  
  credentialsLoaded = true;
  console.log("✅ Cliente de Google Vision inicializado correctamente");
  
  // TEST: Intentar una llamada simple para verificar
  console.log("🧪 Probando conexión con Google Cloud...");
  
} catch (error) {
  console.error("❌ Error al inicializar Google Vision:");
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
    credentialsLoaded: credentialsLoaded,
    projectId: projectId 
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    credentialsLoaded: credentialsLoaded,
    projectId: projectId,
    envVars: {
      googleCredentials: !!process.env.GOOGLE_CREDENTIALS_JSON,
      elevenlabsKey: !!process.env.ELEVENLABS_API_KEY,
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

    if (!credentialsLoaded) {
      console.error("❌ Credenciales de Google no cargadas");
      return res.status(500).json({ 
        error: "Servicio de reconocimiento no disponible",
        hint: "Las credenciales no se inicializaron correctamente"
      });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    console.log("🔍 Procesando imagen con Google Vision...");
    console.log("📊 Tamaño de imagen:", imageBuffer.length, "bytes");
    console.log("🔑 Usando proyecto:", projectId);

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
    
    console.log("✅ Audio generado correctamente, tamaño:", audioBuffer.length);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
    
  } catch (error: any) {
    console.error("❌ ERROR EN /api/speak:", error);
    
    // Logging detallado del error
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Error details:", error.details);
    
    const errorMessage = error.message || "Error desconocido";
    
    res.status(500).json({ 
      error: "Error interno del servidor",
      details: errorMessage,
      code: error.code
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
