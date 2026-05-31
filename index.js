const express = require("express")
const cors = require("cors")
const { createClient } = require("@supabase/supabase-js")
const axios = require("axios")

const app = express()

// =====================
// CORS
// =====================
const allowedOrigins = [
  "http://localhost:5173",
  "https://pickme-frontend.vercel.app",
  "https://selector.radeyaphoto.my.id"
]

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app")
    ) {
      return callback(null, true)
    }

    return callback(new Error("Not allowed by CORS"))
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true
}))

app.options("*", cors())
app.use(express.json())

// =====================
// DEBUG
// =====================
app.use((req, res, next) => {
  console.log("🔥", req.method, req.url)
  next()
})

// =====================
// ENV
// =====================
const PORT = process.env.PORT || 3000

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const CLIENT_URL = "https://selector.radeyaphoto.my.id"

// =====================
// FETCH DRIVE FILES
// =====================
async function fetchDriveFiles(folderId) {
  try {
    const url = `${process.env.DRIVE_PROXY_URL}?folder=${folderId}`

    console.log("📡 FETCH:", url)

    const res = await axios.get(url)

    let data = res.data

    // handle kalau string
    if (typeof data === "string") {
      try {
        data = JSON.parse(data)
      } catch {
        console.log("❌ JSON PARSE FAIL")
        return []
      }
    }

    if (!Array.isArray(data)) {
      console.log("❌ NOT ARRAY:", data)
      return []
    }

    console.log("📦 RAW FILES:", data.length)

    return data
  } catch (err) {
    console.log("❌ DRIVE ERROR:", err.message)
    return []
  }
}

// =====================
// EXTRACT FOLDER ID
// =====================
function extractFolderId(url) {
  if (!url) return null
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

// =====================
// MAP DRIVE → IMAGE URL
// =====================
function mapDrivePhotos(files) {
  return files
    .map(file => {
      let fileId = file.id

      // fallback ambil dari url
      if (!fileId && file.url) {
        const match = file.url.match(/[-\w]{25,}/)
        fileId = match ? match[0] : null
      }

      if (!fileId) {
        console.log("❌ SKIP FILE (NO ID):", file)
        return null
      }

      const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`

      return {
        name: file.name || "",
        id: fileId,
        url: directUrl,
        full: directUrl
      }
    })
    .filter(Boolean)
}

// =====================
// CREATE PROJECT
// =====================
app.post("/create-project", async (req, res) => {
  try {
    const {
      name,
      admin_whatsapp,
      max_photos,
      drive_link
    } = req.body

    if (!name || !admin_whatsapp || !drive_link) {
      return res.status(400).json({ error: "Missing data" })
    }

    const code = Math.random().toString(36).substring(2, 8)
    const folderId = extractFolderId(drive_link)

    let photos = []

    if (folderId) {
      const rawFiles = await fetchDriveFiles(folderId)
      photos = mapDrivePhotos(rawFiles)
    }

    console.log("🖼️ FINAL PHOTOS:", photos.length)

    const { error } = await supabase
      .from("projects")
      .insert([
        {
          code,
          name,
          admin_whatsapp,
          max_photos: Number(max_photos) || 10,
          drive_link,
          photos
        }
      ])

    if (error) {
      console.log("❌ SUPABASE ERROR:", error)
      return res.status(500).json({ error: error.message })
    }

    return res.json({
      link: `${CLIENT_URL}/project/${code}`,
      code
    })

  } catch (err) {
    console.log("❌ SERVER ERROR:", err.message)
    return res.status(500).json({ error: err.message })
  }
})

// =====================
// GET PROJECT
// =====================
app.get("/project/:code", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("code", req.params.code)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: "Not found" })
    }

    res.json(data)

  } catch (err) {
    console.log("❌ GET ERROR:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// =====================
// START SERVER
// =====================
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Backend running on", PORT)
})
