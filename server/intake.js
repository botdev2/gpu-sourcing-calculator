import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const dir = path.resolve("data")
const accessPath = path.join(dir, "access.json")
const intakePath = path.join(dir, "intakes.jsonl")

const periods = new Set(["day", "month", "quarter", "year"])
const sites = new Set(["owned", "leased", "searching"])
const utilities = new Set(["connected", "filed", "none"])
const permits = new Set(["none", "progress", "granted"])
const cooling = new Set(["air", "liquid", "undecided"])
const workloads = new Set(["training", "inference", "mixed", "colo"])
const networks = new Set(["internet", "fiber", "infiniband"])

function clip(value, min, max) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  if (text.length < min || text.length > max) return ""
  return text
}

function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160
}

export function publicOffer(items) {
  return items.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    short: item.short,
    spec: item.spec,
    unit: item.unit,
  }))
}

function kycFrom(input) {
  const kyc = {
    company: clip(input?.company, 2, 160),
    registry: clip(input?.registry, 2, 40),
    country: clip(input?.country, 2, 80),
    address: clip(input?.address, 4, 200),
    contact: clip(input?.contact, 2, 120),
    email: clip(input?.email, 6, 160).toLowerCase(),
    role: clip(input?.role, 2, 80),
    phone: clip(input?.phone, 6, 40),
    use: clip(input?.use, 0, 240),
  }
  if (!kyc.company || !kyc.registry || !kyc.country || !kyc.address || !kyc.contact || !kyc.role || !kyc.phone) {
    return { error: "Complete every field in the template." }
  }
  if (!emailOk(kyc.email)) return { error: "Enter a work email." }
  return { kyc }
}

function orderFrom(input, catalog) {
  const known = new Map(catalog.map((item) => [item.id, item.name]))
  if (!Array.isArray(input) || input.length > 40) return { error: "The order is too large." }
  const lines = []
  for (const line of input) {
    const name = known.get(line?.id)
    const qty = Math.round(Number(line?.qty))
    if (!name || !Number.isFinite(qty) || qty < 1 || qty > 100000) return { error: "One of the hardware lines is not on the offer." }
    lines.push({ id: line.id, name, qty })
  }
  return { lines }
}

function tokensFrom(input) {
  if (!input) return { tokens: null }
  const amount = clip(input.amount, 1, 40)
  const use = clip(input.use, 0, 160)
  if (!amount || !periods.has(input.period)) return { error: "Say how many tokens you need, and the period." }
  return { tokens: { amount, period: input.period, use } }
}

export function normalizeIntake(body, catalog) {
  const kind = body?.kind === "brief" ? "brief" : body?.kind === "order" ? "order" : ""
  if (!kind) return { error: "Choose an order or a data-center brief." }

  if (kind === "order") {
    const kyc = kycFrom(body.kyc)
    if (kyc.error) return kyc
    const order = orderFrom(body.order, catalog)
    if (order.error) return order
    const tokens = tokensFrom(body.tokens)
    if (tokens.error) return tokens
    if (!order.lines.length && !tokens.tokens) return { error: "Add hardware or a token volume before the template." }
    return { record: { kind, kyc: kyc.kyc, order: order.lines, tokens: tokens.tokens } }
  }

  const site = {
    where: clip(body.site?.where, 2, 200),
    site: sites.has(body.site?.site) ? body.site.site : "",
    power: clip(body.site?.power, 2, 200),
    utility: utilities.has(body.site?.utility) ? body.site.utility : "",
    permits: permits.has(body.site?.permits) ? body.site.permits : "",
    cooling: cooling.has(body.site?.cooling) ? body.site.cooling : "",
    workload: workloads.has(body.site?.workload) ? body.site.workload : "",
    scale: clip(body.site?.scale, 2, 200),
    network: networks.has(body.site?.network) ? body.site.network : "",
    when: clip(body.site?.when, 2, 200),
    contact: clip(body.site?.contact, 2, 120),
    email: clip(body.site?.email, 6, 160).toLowerCase(),
  }
  if (Object.values(site).some((value) => !value) || !emailOk(site.email)) {
    return { error: "The data-center brief is still missing an answer." }
  }
  return { record: { kind, site } }
}

function readTokens() {
  try {
    const parsed = JSON.parse(fs.readFileSync(accessPath, "utf8"))
    return Array.isArray(parsed) ? parsed.filter((token) => typeof token === "string") : []
  } catch {
    return []
  }
}

export function grantAccess() {
  fs.mkdirSync(dir, { recursive: true })
  const token = crypto.randomBytes(24).toString("hex")
  const tokens = readTokens()
  tokens.push(token)
  fs.writeFileSync(accessPath, JSON.stringify(tokens.slice(-5000)))
  return token
}

export function accessAllowed(token) {
  if (typeof token !== "string" || token.length < 32) return false
  return readTokens().includes(token)
}

export function saveIntake(record) {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(intakePath, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n")
}
