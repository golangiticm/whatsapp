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

    client.initialize()
  })
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
