import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const DB_PATH = path.join(process.cwd(), "leads.json");

// Define basic Google Sheets Integration instructions
/*
=========================================================
HOW TO CONNECT TO GOOGLE SHEETS
=========================================================
1. Open Google Sheets (Sheet ID: 1ibCrzsgw6BTfhbEKpSpoNaQroVQzg66t5aRAUsbx5jM)
2. Go to Extensions -> Apps Script
3. Paste the following Google Apps Script code inside:

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.openById("1ibCrzsgw6BTfhbEKpSpoNaQroVQzg66t5aRAUsbx5jM").getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    sheet.appendRow([
      data.parentName, 
      data.phone, 
      data.childAge, 
      data.city, 
      data.finalResult,
      data.programmingScore, 
      data.roboticsScore, 
      data.timestamp || new Date().toISOString()
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({"success": true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"success": false, "error": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

4. Click "Deploy" -> "New Deployment"
5. Select type: "Web app"
6. Execute as: "Me"
7. Who has access: "Anyone"
8. Copy the Web App URL!
9. In AI Studio, open Settings -> Secrets and add a new secret:
   Key: GOOGLE_SCRIPT_URL
   Value: <Your copied Web App URL>
=========================================================
*/

app.post("/api/leads", async (req, res) => {
  try {
    const newLead = {
      ...req.body,
      timestamp: new Date().toISOString(),
    };

    // 1. Google Sheets Option (If GOOGLE_SCRIPT_URL is provided config via Settings -> Secrets)
    if (process.env.GOOGLE_SCRIPT_URL) {
      try {
        console.log("📤 Sending data to Google Sheets via:", process.env.GOOGLE_SCRIPT_URL);
        const gasRes = await fetch(process.env.GOOGLE_SCRIPT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newLead),
        });

        if (!gasRes.ok) {
          const errorText = await gasRes.text();
          console.error("❌ Google Apps Script error status:", gasRes.status);
          console.error("❌ Error response:", errorText);
        } else {
          console.log("✅ Successfully sent data to Google Sheets");
        }
      } catch (err) {
        console.error("❌ Failed to call Google Apps Script:", err);
        // We will continue so the user still gets their result, but the sheet write failed.
      }
    } else {
      console.warn("⚠️  GOOGLE_SCRIPT_URL not configured. Data will NOT be sent to Google Sheets.");
    }

    // 2. Local File Option (As a backup/local copy):
    // Use /tmp for compatibility with serverless read-only file systems
    try {
      const TMP_DB_PATH = path.join("/tmp", "leads.json");
      let leads = [];
      try {
        const data = await fs.readFile(TMP_DB_PATH, "utf-8");
        leads = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet, we will create it
      }

      leads.push(newLead);
      await fs.writeFile(TMP_DB_PATH, JSON.stringify(leads, null, 2));
    } catch(err) {
      console.error("Local save failed", err);
    }

    res.json({ success: true, message: "Lead processed successfully" });
  } catch (error) {
    console.error("Error saving lead:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "child_quiz.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
