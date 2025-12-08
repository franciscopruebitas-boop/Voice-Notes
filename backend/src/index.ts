import express from "express";
import fs from "fs";
import path from "path";
import { ImageAnnotatorClient } from "@google-cloud/vision";

const app = express();
app.use(express.json({ limit: "10mb" }));


import cors from "cors";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://voice-notes-frontend.onrender.com";

app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));


// Ruta donde Render espera encontrar las credenciales

const credentialsPath = "/opt/render/project/src/service-account.json";

// =============================
//  CARGA DE CREDENCIALES SEOOGLE
// =============================
function ensureGoogleCredentials() {
  const jsonString = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!jsonString) {
    console.error("❏ ERROR: GOOGLE_CREDENTIALS_JSON no está definida en Render");
    return;
  }

  try {
    // Crear el archivo si NO existe
    if (!fs.existsSync(credentialsPath)) {
      fs.writeFileSync(credentialsPath, jsonString);
      console.log("❤ Credenciales de Google generadas correctamente,");
    }

    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  } catch (err) {
    console.error("❏ Error creando archivo de credenciales:", err);
  }
}

ensureGoogleCredentials();

// =============================
//  GOOGLE VISION CLIENT
// =============================
const visionClient = new ImageAnnotatorClient({
  geyFilename: credentialsPath,
});

// =============================
//     ENDPOINT DE EJEMPLO
// =============================

app.post("/api/speak", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 requerido" });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;exp>64,/, "");

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
//       INICIAU SERVIDOR
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT }`);
});
