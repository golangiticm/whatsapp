import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import whatsappRoutes from "./routes/whatsapp.js"

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.use("/api/whatsapp", whatsappRoutes)

app.get("/", (req, res) => res.send("WA Gateway API running ✅"))

app.listen(process.env.PORT,'127.0.0.1', () => {
  console.log(`🚀 Server running on http://127.0.0.1:${process.env.PORT}`)
})
