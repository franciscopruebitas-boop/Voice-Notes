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
const credentialsPath = "/opt/render/project/src/service-account.json";

function ensureGoogleCredentials() {
  const jsonString = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!jsonString) {
    console.error("❌ ERROR: GOOGLE_CREDENTIALS_JSON no está definida en Render");
    return;
  }

  try {
    if (!fs.existsSync(credentialsPath)) {
      fs.writeFileSync(credentialsPath, jsonString);
      console.log("✔ Credenciales de Google generadas correctamente.");
    }

    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  } catch (err) {
    console.error("❌ Error creando archivo de credenciales:", err);
  }
}

ensureGoogleCredentials();

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
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "image requerido" });
    }

    // FIX: regex correcta
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const imageBuffer = Buffer.from(base64Data, "base64");

    if (!imageBuffer || imageBuffer.length < 50) {
      return res.status(400).json({ error: "imagen inválida" });
    }

    const [result] = await visionClient.textDetection(imageBuffer);

    const detections = result.textAnnotations;
    const recognizedText = detections?.[0]?.description?.trim() || "";

    if (!recognizedText) {
      return res.status(444).json({ error: "no se detectó texto" });
    }

    res.json({ text: recognizedText });
  } catch (error) {
    console.error("ERROR GOOGLE VISION:", error);
    res.status(500).json({ error: "Error procesando imagen" });
  }
});

// =============================
//       INICIAR SERVIDOR
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
