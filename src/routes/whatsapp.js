import express from "express"
import multer from "multer"
import fs from "fs"
import { connectToWhatsApp, sendText, sendMessage, disconnect, getStatus } from "../services/whatsapp.js"
import { authMiddleware } from "../middlewares/auth.js"

const router = express.Router()
const upload = multer({ dest: "uploads/" })

router.get("/", (req, res) => res.send("WA Gateway API running ✅"))

// connect -> menghasilkan qr
router.post("/connect/:id", authMiddleware, async (req, res) => {
  try {
    const data = await connectToWhatsApp(req.params.id)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// send text
router.post("/send-text/:id", authMiddleware, async (req, res) => {
  try {
    const { to, message } = req.body
    const data = await sendText(req.params.id, to, message)
    res.json({ status: "ok", data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// send message with file
router.post("/send-message/:id", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const { to, message } = req.body
    let file = null

    if (req.file) {
      const buffer = fs.readFileSync(req.file.path)
      file = {
        data: buffer,
        mimetype: req.file.mimetype,
        filename: req.file.originalname
      }
    }

    const data = await sendMessage(req.params.id, to, message, file)
    res.json({ status: "ok", data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// status
router.get("/status/:id", authMiddleware, (req, res) => {
  try {
    const data = getStatus(req.params.id)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// disconnect
router.post("/disconnect/:id", authMiddleware, async (req, res) => {
  try {
    const data = await disconnect(req.params.id)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
