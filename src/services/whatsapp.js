import pkg from "whatsapp-web.js"
const { Client, LocalAuth, MessageMedia } = pkg
import qrcode from "qrcode"
import fs from "fs"
import path from "path"

const sessions = new Map()

// === CONNECT FUNCTION ===
export async function connectToWhatsApp(identifier) {
  return new Promise((resolve, reject) => {
    if (sessions.has(identifier)) {
      return resolve({ message: "Already connected", id: identifier })
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: identifier,
        dataPath: path.join(process.cwd(), "sessions") // simpan semua session di folder sessions/
      }),
      puppeteer: { headless: true, args: ["--no-sandbox"] }
    })

    // saat generate QR
    client.on("qr", async (qr) => {
      const qrUrl = await qrcode.toDataURL(qr)
      resolve({ id: identifier, qr: qrUrl })
    })

    // saat berhasil login
    client.on("ready", () => {
      console.log(`✅ Client ${identifier} ready`)
      sessions.set(identifier, client)
    })

    // kalau logout manual dari device
    client.on("disconnected", (reason) => {
      console.log(`❌ Client ${identifier} disconnected: ${reason}`)
      cleanupSession(identifier)
      sessions.delete(identifier)
    })

    // kalau gagal auth (biasanya user logout dari device atau session expired)
    client.on("auth_failure", (msg) => {
      console.log(`⚠️ Auth failure ${identifier}: ${msg}`)
      cleanupSession(identifier)
      sessions.delete(identifier)
    })

    client.initialize()
  })
}

// === CLEANUP FUNCTION ===
function cleanupSession(identifier) {
  const sessionPath = path.join(process.cwd(), "sessions", `session-${identifier}`)
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true })
      console.log(`🗑️ Deleted session folder for ${identifier}`)
    }
  } catch (err) {
    if (err.code === "EBUSY") {
      console.warn(`⚠️ File terkunci (chrome_debug.log) untuk ${identifier}, skip...`)
    } else {
      console.error(`Gagal hapus session folder ${identifier}:`, err.message)
    }
  }
}

// === SEND TEXT ===
export async function sendText(identifier, to, message) {
  const client = sessions.get(identifier)
  if (!client) throw new Error("Client not connected")
  return client.sendMessage(to, message)
}

// === SEND MESSAGE WITH FILE ===
export async function sendMessage(identifier, to, message, file) {
  const client = sessions.get(identifier)
  if (!client) throw new Error("Client not connected")

  if (file) {
    // convert buffer ke base64
    const base64Data = file.data.toString("base64")

    // buat media dari base64
    const media = new MessageMedia(file.mimetype, base64Data, file.filename)

    return client.sendMessage(to, media, { caption: message })
  }

  return client.sendMessage(to, message)
}

// === DISCONNECT MANUAL ===
export async function disconnect(identifier) {
  const client = sessions.get(identifier)
  if (!client) throw new Error("Client not connected")

  await client.destroy()
  cleanupSession(identifier)
  sessions.delete(identifier)

  return { message: "Disconnected", id: identifier }
}
