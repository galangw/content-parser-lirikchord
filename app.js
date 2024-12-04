const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createObjectCsvWriter } = require("csv-writer");
const dotenv = require("dotenv");
const multer = require("multer");

// Load .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Path untuk file requests
const REQUESTS_FILE = path.join(__dirname, "data", "requests.json");

// Tracking semua requests (hanya satu deklarasi)
const processRequests = new Map();

// Fungsi untuk memuat requests dari file
function loadRequests() {
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      const data = fs.readFileSync(REQUESTS_FILE, "utf8");
      const requests = JSON.parse(data);
      processRequests.clear();
      Object.entries(requests).forEach(([key, value]) => {
        processRequests.set(key, {
          ...value,
          createdAt: new Date(value.createdAt),
        });
      });
      console.log("Requests loaded successfully");
    }
  } catch (error) {
    console.error("Error loading requests:", error);
  }
}

// Fungsi untuk menyimpan requests ke file
function saveRequests() {
  try {
    const data = Object.fromEntries(processRequests);
    if (!fs.existsSync(path.dirname(REQUESTS_FILE))) {
      fs.mkdirSync(path.dirname(REQUESTS_FILE), { recursive: true });
    }
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
    console.log("Requests saved successfully");
  } catch (error) {
    console.error("Error saving requests:", error);
  }
}
// Define engine processors
const engineProcessors = {
  lyrics: {
    processContent: async function (fileContent) {
      // Fungsi clean text untuk engine lirik
      function cleanText(text) {
        text = text.replace(/<br\s*\/?>/gi, "\n");
        text = text.replace(/<\/?[^>]+(>|$)/g, "");
        text = text.replace(
          /(Tonton juga|DENPASAR|Berita terpopuler|Rekomendasi chord|Baca juga|Chord lainnya|BALI|MANADO|Baca selengkapnya|Baca:|Simak juga|Sumber:|Link:|Copyright|Video:|Viral:|Lihat Juga|BANGKAPOS.COM|COM)/gi,
          ""
        );
        text = text.replace(/\bTribun\w*\b/gi, "");
        text = text.replace(/\b\w+\.(com|co\.id|net|org|id)\b/gi, "");
        text = text.replace(/^[^a-zA-Z]+/gm, "");
        text = text.replace(/[ \t]+$/gm, "");
        return text.trim();
      }

      // Fungsi untuk memproses lirik dari intro
      function processLyricWithIntro(lyric) {
        const introRegex = /intro|\[intro\]/i;
        const lines = lyric.split("\n");
        const introIndex = lines.findIndex((line) => introRegex.test(line));
        if (introIndex !== -1) {
          return lines.slice(introIndex).join("\n");
        }
        return lyric;
      }

      try {
        const titleMatch = fileContent.match(/<h1>(.*?)<\/h1>/);
        const judul = titleMatch ? cleanText(titleMatch[1]) : "Title not found";

        // Ekstrak dan bersihkan lirik
        const lyricLines = fileContent
          .split(/\r?\n/)
          .filter(
            (line) =>
              !line.includes("berita") &&
              !line.includes("Tribun") &&
              !line.match(/tonton juga|baca juga|copyright|video/i)
          )
          .map((line) => cleanText(line))
          .filter((line) => line.length > 0);

        const lirik = lyricLines.join("\n") || "Lyrics not found";
        const processedLyric = processLyricWithIntro(lirik);

        // Dapatkan artis dan judul dari API
        const result = await callApi(judul);

        return {
          judul: result.judul,
          artis: result.artis,
          lirik: processedLyric,
          originalText: fileContent,
        };
      } catch (error) {
        throw new Error(`Lyrics processing error: ${error.message}`);
      }
    },
    csvHeaders: [
      { id: "judul", title: "Judul" },
      { id: "artis", title: "Artis" },
      { id: "lirik", title: "Lirik" },
      { id: "originalText", title: "Original Text" },
    ],
  },

  chord: {
    processContent: async function (fileContent) {
      // Fungsi clean text untuk engine chord
      function cleanText(text) {
        text = text.replace(/<br\s*\/?>/gi, "\n");
        text = text.replace(/<\/?[^>]+(>|$)/g, "");
        text = text.replace(
          /(Tonton juga|Berita terpopuler|Rekomendasi chord|Baca juga|Chord lainnya|Baca selengkapnya|Baca:|Simak juga|Sumber:|Link:|Copyright|Video:|Viral:|Lihat Juga|COM)/gi,
          ""
        );
        text = text.replace(/\bTribun\w*\b/gi, "");
        text = text.replace(/\b\w+\.(com|co\.id|net|org|id)\b/gi, "");
        text = text.replace(/^[^a-zA-Z]+/gm, "");
        text = text.replace(/[ \t]+$/gm, "");
        return text.trim();
      }

      // Fungsi untuk memproses chord dengan intro
      function processChordWithIntro(chord) {
        const introRegex = /intro|\[intro\]/i;
        const lines = chord.split("\n");
        const introIndex = lines.findIndex((line) => introRegex.test(line));
        if (introIndex !== -1) {
          return lines.slice(introIndex).join("\n");
        }
        return chord;
      }

      try {
        const titleMatch = fileContent.match(/<h1>(.*?)<\/h1>/);
        const judul = titleMatch ? cleanText(titleMatch[1]) : "Title not found";

        // Ekstrak dan bersihkan chord
        const chordLines = fileContent
          .split(/\r?\n/)
          .map((line) => cleanText(line))
          .filter((line) => line.length > 0)
          .filter(
            (line) =>
              !line.includes("berita") &&
              !line.includes("Tribun") &&
              !line.match(/tonton juga|baca juga|copyright|video/i)
          );

        const chord = chordLines.join("\n") || "Chord not found";
        const processedChord = processChordWithIntro(chord);

        // Dapatkan artis dan judul dari API
        const result = await callApi(judul);

        return {
          judul: result.judul,
          artis: result.artis,
          chord: processedChord,
          originalText: fileContent,
        };
      } catch (error) {
        throw new Error(`Chord processing error: ${error.message}`);
      }
    },
    csvHeaders: [
      { id: "judul", title: "Judul" },
      { id: "artis", title: "Artis" },
      { id: "chord", title: "Chord" },
      { id: "originalText", title: "Original Text" },
    ],
  },
};

// Setup multer dan middleware
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const requestId = req.requestId || generateRequestId();
    const dir = `uploads/${requestId}`;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Set views dan static files
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Helper functions
function generateRequestId() {
  return "req_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// Middleware untuk menangani request ID
app.use((req, res, next) => {
  if (req.headers["x-request-id"]) {
    req.requestId = req.headers["x-request-id"];
  }
  next();
});

// Add middleware untuk logging (membantu debug)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.method === "POST" && req.url === "/upload") {
    console.log("Engine Type:", req.body.engineType);
    console.log("Files:", req.files?.length || 0);
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});
// API dan processing functions
async function callApi(text) {
  const apiKey = process.env.API_KEY;
  const url = "https://api.anthropic.com/v1/messages";

  const prompt = `Extract the song title and artist from the following text:(${text}), just give the answer with format like : (title:title,artist:artist), dont include many information except artist and title`;

  const data = {
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
    });

    if (response.data?.content?.[0]?.text) {
      return parseTitleArtist(response.data.content[0].text);
    }
    return { judul: "Error", artis: "Error" };
  } catch (error) {
    console.error("Error calling API:", error.message);
    throw new Error(`API Error: ${error.message}`);
  }
}

function parseTitleArtist(text) {
  const matches = text.match(/\(title:(.+?),?\s*artist:(.+?)\)$/);
  if (matches) {
    return { judul: matches[1].trim(), artis: matches[2].trim() };
  }
  return { judul: "Unknown", artis: "Unknown" };
}

async function processFile(fileContent, fileName, engineType) {
  try {
    const engine = engineProcessors[engineType];
    if (!engine) {
      throw new Error(`Unknown engine type: ${engineType}`);
    }
    return await engine.processContent(fileContent);
  } catch (error) {
    throw new Error(`Error processing ${fileName}: ${error.message}`);
  }
}

async function processFiles(requestId, files, engineType) {
  const request = processRequests.get(requestId);
  const engine = engineProcessors[engineType];

  const csvWriter = createObjectCsvWriter({
    path: `output/${request.filename}`,
    header: engine.csvHeaders,
  });

  try {
    for (const file of files) {
      try {
        const fileContent = fs.readFileSync(file.path, { encoding: "utf-8" });
        const result = await processFile(
          fileContent,
          file.originalname,
          engineType
        );
        request.results.push(result);
        request.processed++;
        request.currentFile = file.originalname;
        saveRequests(); // Save progress
      } catch (error) {
        request.errors.push({
          file: file.originalname,
          error: error.message,
        });
        saveRequests(); // Save errors
      } finally {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    await csvWriter.writeRecords(request.results);
    request.status = "completed";
    saveRequests(); // Save completed status
  } catch (error) {
    request.status = "error";
    request.errors.push({
      file: "general",
      error: error.message,
    });
    saveRequests(); // Save error status
  }

  try {
    const uploadDir = `uploads/${requestId}`;
    if (fs.existsSync(uploadDir)) {
      fs.rmdirSync(uploadDir, { recursive: true });
    }
  } catch (error) {
    console.error(`Error cleaning up upload directory: ${error}`);
  }
}
// Routes
app.get("/", (req, res) => {
  res.render("index");
});

// Progress route
app.get("/progress/:requestId", (req, res) => {
  const requestId = req.params.requestId;
  const request = processRequests.get(requestId);

  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }

  const percentage =
    request.total > 0
      ? Math.round((request.processed / request.total) * 100)
      : 0;

  res.json({
    id: request.id,
    percentage,
    currentFile: request.currentFile,
    processed: request.processed,
    total: request.total,
    status: request.status,
    errors: request.errors,
    filename: request.filename,
    engineType: request.engineType,
    createdAt: request.createdAt,
  });
});

// Get all requests
app.get("/requests", (req, res) => {
  const requests = Array.from(processRequests.values()).map((request) => ({
    id: request.id,
    status: request.status,
    createdAt: request.createdAt,
    filename: request.filename,
    totalFiles: request.total,
    processedFiles: request.processed,
    errors: request.errors,
    engineType: request.engineType,
  }));

  res.json(requests);
});
// Pindahkan middleware sebelum routes
// Setup middleware
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.method === "POST" && req.url === "/upload") {
    console.log("Request body:", req.body);
  }
  next();
});

// Upload route (ganti dengan ini)
app.post("/upload", upload.array("files"), async (req, res) => {
  try {
    console.log("Upload request received:", {
      body: req.body,
      files: req.files,
    });

    const engineType = req.body.engineType;
    const files = req.files;

    // Validasi input
    if (!engineType || !engineProcessors[engineType]) {
      return res.status(400).json({ error: "Invalid engine type" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Buat request ID dan setup request
    const requestId = generateRequestId();
    processRequests.set(requestId, {
      id: requestId,
      status: "pending",
      createdAt: new Date(),
      filename: `output_${engineType}_${requestId}.csv`,
      total: files.length,
      processed: 0,
      currentFile: "",
      errors: [],
      results: [],
      engineType: engineType,
    });

    // Save request state
    saveRequests();

    // Update status
    const request = processRequests.get(requestId);
    request.status = "processing";
    saveRequests();

    // Send response
    res.json({
      requestId: requestId,
      message: "Processing started",
      totalFiles: files.length,
      engineType: engineType,
    });

    // Process files asynchronously
    processFiles(requestId, files, engineType).catch((error) => {
      console.error("Error processing files:", error);
      const request = processRequests.get(requestId);
      if (request) {
        request.status = "error";
        request.errors.push({
          file: "general",
          error: error.message,
        });
        saveRequests();
      }
    });
  } catch (error) {
    console.error("Error in upload handler:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Download route
app.get("/download/:requestId", (req, res) => {
  const requestId = req.params.requestId;
  const request = processRequests.get(requestId);

  if (!request || !request.filename) {
    return res.status(404).send("File not found");
  }

  const filePath = path.join(__dirname, "output", request.filename);

  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${request.filename}"`
    );

    res.download(filePath, request.filename, (err) => {
      if (err) {
        console.error(`Error downloading file: ${err}`);
        if (!res.headersSent) {
          res.status(500).send("Error downloading file");
        }
      }
    });
  } else {
    res.status(404).send("File not found");
  }
});

// Delete route
app.delete("/request/:requestId", (req, res) => {
  const requestId = req.params.requestId;
  const request = processRequests.get(requestId);

  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }

  if (request.filename) {
    const filePath = path.join(__dirname, "output", request.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error(`Error deleting file: ${error}`);
      }
    }
  }

  const uploadDir = path.join(__dirname, "uploads", requestId);
  if (fs.existsSync(uploadDir)) {
    try {
      fs.rmdirSync(uploadDir, { recursive: true });
    } catch (error) {
      console.error(`Error deleting upload directory: ${error}`);
    }
  }

  processRequests.delete(requestId);
  saveRequests();

  res.json({ message: "Request deleted successfully" });
});
// Create required directories
["uploads", "output", "data"].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Start server
app.listen(port, () => {
  // Load existing requests
  loadRequests();

  console.log(`Server running at http://localhost:${port}`);
  console.log("Available engines:", Object.keys(engineProcessors));
  console.log("Directories initialized:", ["uploads", "output", "data"]);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Saving requests before shutdown...");
  saveRequests();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT. Saving requests before shutdown...");
  saveRequests();
  process.exit(0);
});
