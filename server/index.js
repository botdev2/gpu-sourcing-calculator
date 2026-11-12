import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { catalog } from "./catalog.js"
import { quoteSchema } from "../shared/schema.js"
import { priceQuote, validateQuote } from "../shared/pricing.js"

const port = Number(process.env.PORT) || 3000
const dist = path.resolve("dist")
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, {
    "content-type": type,
    "cache-control": "no-store",
  })
  res.end(typeof body === "string" ? body : JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
      if (body.length > 1_000_000) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }))
        req.destroy()
      }
    })
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}

function staticFile(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0])
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
  const full = path.resolve(dist, relative)
  const fromRoot = path.relative(dist, full)
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) return null
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null
  return full
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost")
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, { ok: true })
      return
    }
    if (req.method === "GET" && url.pathname === "/api/catalog") {
      send(res, 200, { items: catalog })
      return
    }
    if (req.method === "GET" && (url.pathname === "/api/schema" || url.pathname === "/schema/sourcing-quote.json")) {
      send(res, 200, quoteSchema)
      return
    }
    if (req.method === "POST" && url.pathname === "/api/quote") {
      const raw = await readBody(req)
      let payload
      try {
        payload = JSON.parse(raw || "{}")
      } catch {
        send(res, 400, { error: "Quote body must be JSON" })
        return
      }
      const quote = priceQuote({ lines: payload.lines, mission: payload.mission, catalog })
      if (!validateQuote(quote)) {
        console.error(JSON.stringify(validateQuote.errors))
        send(res, 500, { error: "Quote failed schema check" })
        return
      }
      send(res, 200, quote)
      return
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { error: "Method not allowed" })
      return
    }

    const file = staticFile(url.pathname) || (fs.existsSync(path.join(dist, "index.html")) ? path.join(dist, "index.html") : null)
    if (!file) {
      send(res, 404, { error: "Not built yet" })
      return
    }
    const ext = path.extname(file)
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" })
    if (req.method === "HEAD") res.end()
    else fs.createReadStream(file).pipe(res)
  } catch (error) {
    const status = error.status || 500
    if (status >= 500) console.error(error.message)
    send(res, status, { error: status === 400 ? error.message : "Quote failed" })
  }
})

const sample = priceQuote({
  lines: [{ id: "gpu-b200", qty: 8 }],
  mission: { profile: "training", acceleratorId: "gpu-b200", nodes: 1, gpusPerNode: 8 },
  catalog,
})
if (!validateQuote(sample)) {
  console.error(JSON.stringify(validateQuote.errors))
  process.exit(1)
}

server.listen(port, "0.0.0.0", () => {
  console.log(`busbar listening on ${port}`)
})
