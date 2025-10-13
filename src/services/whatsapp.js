import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode";
import fs from "fs/promises"; // Gunakan promises untuk async
import path from "path";
import { setTimeout } from "timers/promises"; // Untuk delay async

const sessions = new Map();

// === CONNECT FUNCTION (Improved) ===
export async function connectToWhatsApp(identifier) {
  if (sessions.has(identifier)) {
    const client = sessions.get(identifier);
    if (client.info) { // Check if ready
      return { message: "Already connected", id: identifier };
    }
  }

  const sessionPath = path.join(process.cwd(), "sessions", `session-${identifier}`);
  // Cleanup old session if exists (tapi gentle)
  await cleanupSession(identifier, false); // false = don't force destroy if running

  return new Promise((resolve, reject) => {
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: identifier,
        dataPath: path.join(process.cwd(), "sessions"),
      }),
      puppeteer: { 
        headless: true, 
        args: ["--no-sandbox", "--disable-dev-shm-usage"] // Tambah arg untuk stability
      },
      webVersionCache: { 
        type: "remote", // Cache version WA web untuk stability
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2410.2.html" // Update ke version terbaru
      },
    });

    client.on("qr", async (qr) => {
      try {
        const qrUrl = await qrcode.toDataURL(qr);
        resolve({ id: identifier, qr: qrUrl });
      } catch (err) {
        reject(err);
      }
    });

    client.on("ready", () => {
      console.log(`✅ Client ${identifier} ready`);
      sessions.set(identifier, client);
      resolve({ message: "Connected", id: identifier });
    });

    // Handle disconnected (logout manual dari HP)
    client.on("disconnected", async (reason) => {
      console.log(`❌ Client ${identifier} disconnected: ${reason}`);
      try {
        await safeCleanup(identifier); // Async cleanup dengan destroy
      } catch (err) {
        console.error(`Cleanup failed for ${identifier}:`, err.message);
        // Tidak throw, biar app jalan
      }
      sessions.delete(identifier);
    });

    // Handle auth failure
    client.on("auth_failure", async (msg) => {
      console.log(`⚠️ Auth failure ${identifier}: ${msg}`);
      try {
        await safeCleanup(identifier);
      } catch (err) {
        console.error(`Cleanup failed for ${identifier}:`, err.message);
      }
      sessions.delete(identifier);
      reject(new Error(`Auth failed: ${msg}`));
    });

    // Catch all errors to prevent crash
    client.on("error", (err) => {
      console.error(`Client ${identifier} error:`, err);
      // Jangan throw, handle gracefully
    });

    client.initialize().catch(reject); // Catch init error
  });
}

// === SAFE CLEANUP FUNCTION (Async + Retry) ===
async function safeCleanup(identifier) {
  const client = sessions.get(identifier);
  if (client) {
    try {
      await client.destroy(); // Tutup Puppeteer dulu (graceful)
      console.log(`🔒 Destroyed client ${identifier}`);
    } catch (err) {
      console.warn(`⚠️ Destroy failed for ${identifier}:`, err.message);
    }
    sessions.delete(identifier); // Hapus dari map dulu
  }

  const sessionPath = path.join(process.cwd(), "sessions", `session-${identifier}`);
  await cleanupSession(identifier, true); // true = force retry
}

// Improved cleanup: Async, retry for EBUSY, skip locked files
async function cleanupSession(identifier, retry = false) {
  const sessionPath = path.join(process.cwd(), "sessions", `session-${identifier}`);
  if (!await fs.access(sessionPath).then(() => true).catch(() => false)) {
    return; // Folder sudah hilang
  }

  const maxRetries = retry ? 3 : 1;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Hapus recursive async
      await fs.rm(sessionPath, { recursive: true, force: true });
      console.log(`🗑️ Deleted session folder for ${identifier}`);
      return;
    } catch (err) {
      attempt++;
      if (err.code === "EBUSY" || err.code === "ENOTEMPTY") {
        console.warn(`⚠️ Locked files for ${identifier} (attempt ${attempt}/${maxRetries}), retrying in 2s...`);
        if (attempt < maxRetries) {
          await setTimeout(2000); // Delay 2s
          // Opsional: Coba hapus file spesifik dulu (skip locked)
          try {
            const files = await fs.readdir(sessionPath, { withFileTypes: true });
            for (const file of files) {
              if (file.isDirectory()) continue;
              const filePath = path.join(sessionPath, file.name);
              if (file.name.includes("chrome_debug.log") || file.name.endsWith(".lck")) {
                console.warn(`⚠️ Skipping locked file: ${file.name}`);
                continue;
              }
              await fs.unlink(filePath);
            }
          } catch (subErr) {
            console.warn(`⚠️ Partial cleanup failed:`, subErr.message);
          }
        } else {
          console.error(`❌ Failed to cleanup ${identifier} after ${maxRetries} attempts:`, err.message);
          // Di production, log ke file/DB, jangan crash
        }
      } else {
        console.error(`Gagal hapus session ${identifier}:`, err.message);
        throw err; // Throw only if not EBUSY
      }
    }
  }
}

// === SEND TEXT (Unchanged, tapi add check) ===
export async function sendText(identifier, to, message) {
  const client = sessions.get(identifier);
  if (!client) throw new Error("Client not connected");
  return client.sendMessage(to, message);
}

// === SEND MESSAGE WITH FILE (Improved: Handle file better) ===
export async function sendMessage(identifier, to, message, file) {
  const client = sessions.get(identifier);
  if (!client) throw new Error("Client not connected");

  if (file) {
    try {
      const base64Data = file.data.toString("base64");
      const media = new MessageMedia(file.mimetype, base64Data, file.originalname || file.filename);
      return client.sendMessage(to, media, { caption: message });
    } catch (err) {
      throw new Error(`Failed to send media: ${err.message}`);
    }
  }

  return client.sendMessage(to, message);
}

// === DISCONNECT MANUAL (Improved: Async destroy) ===
export async function disconnect(identifier) {
  const client = sessions.get(identifier);
  if (!client) throw new Error("Client not connected");

  try {
    await client.destroy();
    await safeCleanup(identifier);
  } catch (err) {
    console.error(`Disconnect error for ${identifier}:`, err.message);
    // Masih hapus dari map
    sessions.delete(identifier);
  }

  return { message: "Disconnected", id: identifier };
}

// Tambahan: Interval cleanup orphan sessions (jalankan di app start)
export function startOrphanCleanup() {
  setInterval(async () => {
    for (const [id, client] of sessions) {
      if (client.destroyed) { // Check if already destroyed
        await safeCleanup(id);
      }
    }
  }, 60000); // Check every 1 min
}