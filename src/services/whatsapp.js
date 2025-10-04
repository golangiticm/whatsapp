import pkg from "whatsapp-web.js"
const { Client, LocalAuth, MessageMedia } = pkg
import qrcode from "qrcode"

const sessions = new Map()

export async function connectToWhatsApp(identifier) {
  return new Promise((resolve, reject) => {
    if (sessions.has(identifier)) {
      return resolve({ message: "Already connected", id: identifier })
    }

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: identifier }),
      puppeteer: { headless: true, args: ["--no-sandbox"] }
    })

    client.on("qr", async (qr) => {
      const qrUrl = await qrcode.toDataURL(qr)
      resolve({ id: identifier, qr: qrUrl })
    })

    client.on("ready", () => {
      console.log(`✅ Client ${identifier} ready`)
      sessions.set(identifier, client)
    })

       // ketika user logout manual dari device
    client.on("disconnected", (reason) => {
      console.log(`❌ Client ${identifier} disconnected: ${reason}`)
      cleanupSession(identifier)
      sessions.delete(identifier)
    })

    client.on("auth_failure", (msg) => {
      console.log(`⚠️ Auth failure ${identifier}: ${msg}`)
      cleanupSession(identifier)
      sessions.delete(identifier)
    })

    client.initialize()
  })
}

function cleanupSession(identifier) {
  const baseAuth = path.join(process.cwd(), ".wwebjs_auth", `session-${identifier}`)
  const baseCache = path.join(process.cwd(), ".wwebjs_cache", `session-${identifier}`)

  try {
    if (fs.existsSync(baseAuth)) {
      fs.rmSync(baseAuth, { recursive: true, force: true, maxRetries: 3 })
      console.log(`🗑️ Deleted auth folder for ${identifier}`)
    }
    if (fs.existsSync(baseCache)) {
      fs.rmSync(baseCache, { recursive: true, force: true, maxRetries: 3 })
      console.log(`🗑️ Deleted cache folder for ${identifier}`)
    }
  } catch (err) {
    if (err.code === "EBUSY") {
      console.warn(`⚠️ File terkunci (chrome_debug.log) untuk ${identifier}, skip...`)
    } else {
      console.error(`Gagal hapus session folder ${identifier}:`, err.message)
    }
  }
}


export async function sendText(identifier, to, message) {
  const client = sessions.get(identifier)
  if (!client) throw new Error("Client not connected")
  return client.sendMessage(to, message)
}

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

export async function disconnect(identifier) {
  const client = sessions.get(identifier)
  if (!client) throw new Error("Client not connected")
  await client.destroy()
  sessions.delete(identifier)
  return { message: "Disconnected", id: identifier }
}
