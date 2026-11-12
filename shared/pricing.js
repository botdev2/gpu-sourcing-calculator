import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { quoteSchema } from "./schema.js"

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
export const validateQuote = ajv.compile(quoteSchema)

const ORDER = ["accelerator", "chassis", "cpu", "memory", "storage", "network", "facility"]
const SPARE = new Set(["accelerator", "cpu", "memory", "storage"])

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampNum(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function cleanMission(input = {}) {
  const profile = ["config1", "config2", "inference", "rack"].includes(input.profile) ? input.profile : "training"
  return {
    profile,
    acceleratorId: String(input.acceleratorId || "").slice(0, 64),
    nodes: clampInt(input.nodes, 1, 256, 1),
    gpusPerNode: input.gpusPerNode === 4 ? 4 : 8,
    fabric: input.fabric === "ethernet" ? "ethernet" : "infiniband",
    cooling: input.cooling === "air" ? "air" : "liquid",
    cpuId: String(input.cpuId || "").slice(0, 64),
    memoryId: String(input.memoryId || "").slice(0, 64),
    dimmsPerNode: clampInt(input.dimmsPerNode, 8, 32, 16),
    storageId: String(input.storageId || "").slice(0, 64),
    drivesPerNode: clampInt(input.drivesPerNode, 2, 16, 4),
    sparesPct: round3(clampNum(input.sparesPct, 0, 15, 0)),
    freightPct: round3(clampNum(input.freightPct, 0, 15, 0)),
    pue: round3(clampNum(input.pue, 1, 2.2, 1.2)),
    usdPerKwh: round3(clampNum(input.usdPerKwh, 0, 2, 0)),
    hoursPerYear: clampInt(input.hoursPerYear, 1, 8760, 8760),
    years: clampInt(input.years, 1, 7, 3),
    utilization: round3(clampNum(input.utilization, 0.05, 1, 0.7)),
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function spareQtyFor(item, qty, pct) {
  if (qty <= 0 || pct <= 0) return 0
  if (item.form === "rack" || item.id === "nvl72") return 0
  if (item.priceStatus === "unpriced" || item.priceStatus === "included" || item.priceStatus === "estimated") return 0
  if (SPARE.has(item.category) || item.id.startsWith("nic-") || item.id.startsWith("dac-")) {
    return Math.ceil((qty * pct) / 100)
  }
  return 0
}

function placeRacks(pricedLines, byId, mission) {
  const qtyOf = (id) => pricedLines.find((line) => line.sku === id)?.qty || 0
  const acc = byId[mission.acceleratorId]

  if (qtyOf("nvl72") > 0) {
    const racks = []
    for (let i = 0; i < qtyOf("nvl72"); i += 1) {
      racks.push({
        id: `R${i + 1}`,
        title: `NVL72 ${i + 1}`,
        u: 42,
        blocks: [{ sku: "nvl72", name: "NVL72 · 72 GPU", u: 42, role: "accelerator" }],
        zeroU: qtyOf("pdu-60a") > 0 ? ["2× metered PDU"] : [],
      })
    }
    const switches = qtyOf("sw-sn5600")
    if (switches > 0) {
      const blocks = Array.from({ length: switches }, () => ({
        sku: "sw-sn5600",
        name: "SN5600",
        u: 2,
        role: "network",
      }))
      const fabricRacks = Math.max(1, qtyOf("rack-42"))
      for (let i = 0; i < fabricRacks; i += 1) {
        const slice = blocks.splice(0, Math.ceil(blocks.length / (fabricRacks - i)) || 0)
        racks.push({
          id: `N${i + 1}`,
          title: `Fabric ${i + 1}`,
          u: 42,
          blocks: slice,
          zeroU: qtyOf("pdu-60a") > 0 ? ["2× metered PDU"] : [],
        })
      }
    }
    return racks
  }

  const rackCount = Math.max(1, qtyOf("rack-42"))
  const racks = Array.from({ length: rackCount }, (_, i) => ({
    id: `R${i + 1}`,
    title: `Rack ${i + 1}`,
    u: 42,
    blocks: [],
    zeroU: qtyOf("pdu-60a") > 0 ? ["2× metered PDU"] : [],
    used: 0,
  }))

  if (qtyOf("rdhx") > 0) {
    for (const rack of racks) rack.zeroU.push("Rear-door heat exchanger")
  }

  const cdus = qtyOf("cdu-inrack")
  racks.forEach((rack, index) => {
    if (index < cdus) {
      rack.blocks.push({ sku: "cdu-inrack", name: "CDU", u: 4, role: "facility" })
      rack.used += 4
    }
  })

  const chassis = pricedLines.filter((line) => byId[line.sku]?.category === "chassis")
  const chassisBlocks = []
  for (const line of chassis) {
    const item = byId[line.sku]
    const label = acc ? `${item.short} · ${acc.short}` : item.short
    for (let i = 0; i < line.qty; i += 1) {
      chassisBlocks.push({ sku: item.id, name: label, u: item.rackU, role: "chassis" })
    }
  }
  chassisBlocks.forEach((block, index) => {
    const rack = racks[index % racks.length]
    if (rack.used + block.u <= 40) {
      rack.blocks.push(block)
      rack.used += block.u
    } else {
      const fit = racks.find((candidate) => candidate.used + block.u <= 40)
      if (fit) {
        fit.blocks.push(block)
        fit.used += block.u
      }
    }
  })

  const switches = pricedLines.filter((line) => line.sku.startsWith("sw-") && byId[line.sku]?.rackU > 0)
  for (const line of switches) {
    const item = byId[line.sku]
    for (let i = 0; i < line.qty; i += 1) {
      const block = { sku: item.id, name: item.short, u: item.rackU, role: "network" }
      const rack = [...racks].sort((a, b) => a.used - b.used)[0]
      if (rack) {
        rack.blocks.push(block)
        rack.used += block.u
      }
    }
  }

  return racks.map(({ id, title, u, blocks, zeroU }) => ({ id, title, u, blocks, zeroU }))
}

export function priceQuote({ lines, mission, catalog }) {
  const cleaned = cleanMission(mission)
  const byId = Object.fromEntries(catalog.map((item) => [item.id, item]))
  const requested = Array.isArray(lines) ? lines : []
  const priced = []

  for (const line of requested) {
    const item = byId[line?.id]
    if (!item) {
      const error = new Error("Unknown component")
      error.status = 400
      error.sku = String(line?.id || "")
      throw error
    }
    const qty = clampInt(line.qty, 0, 100000, 0)
    if (qty <= 0) continue
    const spareQty = spareQtyFor(item, qty, cleaned.sparesPct)
    priced.push({
      sku: item.id,
      name: item.name,
      category: item.category,
      spec: item.spec,
      unit: item.unit,
      qty,
      spareQty,
      sourceUnitPrice: item.sourcePrice,
      sourceLineTotal: (qty + spareQty) * item.sourcePrice,
      leadWeeks: item.leadWeeks,
      tdpW: item.tdpW,
      hbmGb: item.hbmGb,
      gpusIncluded: item.gpusIncluded,
      priceStatus: item.priceStatus || "planning",
      source: item.source,
    })
  }

  priced.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name))

  const hardwareSource = priced.reduce((sum, line) => sum + line.qty * line.sourceUnitPrice, 0)
  const sparesSource = priced.reduce((sum, line) => sum + line.spareQty * line.sourceUnitPrice, 0)
  const freightSource = Math.round(((hardwareSource + sparesSource) * cleaned.freightPct) / 100)
  const capexSource = hardwareSource + sparesSource + freightSource

  const itW = priced.reduce((sum, line) => sum + line.qty * line.tdpW, 0)
  const itKw = round2(itW / 1000)
  const facilityKw = round2(itKw * cleaned.pue)
  const energySource = Math.round(facilityKw * cleaned.hoursPerYear * cleaned.years * cleaned.usdPerKwh)
  const allInSource = capexSource + energySource

  const gpuCount = priced.reduce((sum, line) => sum + line.qty * (line.gpusIncluded || 0), 0)
  const hbmGb = priced.reduce((sum, line) => sum + line.qty * (line.hbmGb || 0), 0)
  const nodeCount = priced.filter((line) => line.category === "chassis").reduce((sum, line) => sum + line.qty, 0)
  const racksFromLines = priced
    .filter((line) => line.sku === "rack-42" || line.sku === "nvl72")
    .reduce((sum, line) => sum + line.qty, 0)
  const hasChassis = priced.some((line) => byId[line.sku]?.category === "chassis" && byId[line.sku]?.rackU > 0)
  const racks = racksFromLines || (hasChassis ? 1 : 0)
  const nodeKw = nodeCount > 0 ? round2(itKw / nodeCount) : round2(itKw / Math.max(racks, 1))
  const critical = priced.reduce((best, line) => (line.leadWeeks > (best?.leadWeeks || 0) ? line : best), null)
  const rackBudgetKw = priced.some((line) => line.sku === "nvl72") ? 120 : priced.some((line) => line.sku === "cdu-inrack") ? 80 : 15

  const gpuHours = gpuCount * cleaned.hoursPerYear * cleaned.years * cleaned.utilization
  const sourcePerGpu = gpuCount ? Math.round(capexSource / gpuCount) : 0
  const sourcePerGpuHour = gpuHours > 0 ? round3(capexSource / gpuHours) : 0
  const allInPerGpuHour = gpuHours > 0 ? round3(allInSource / gpuHours) : 0

  const publicLines = priced.map((line) => {
    const published = {
      sku: line.sku,
      name: line.name,
      category: line.category,
      spec: line.spec,
      unit: line.unit,
      qty: line.qty,
      spareQty: line.spareQty,
      sourceUnitPrice: line.sourceUnitPrice,
      sourceLineTotal: line.sourceLineTotal,
      leadWeeks: line.leadWeeks,
      tdpW: line.tdpW,
      priceStatus: line.priceStatus || "planning",
    }
    if (line.source) published.source = line.source
    return published
  })

  return {
    schemaVersion: "1.0.0",
    currency: "USD",
    pricedAt: new Date().toISOString(),
    pricingPolicy: {
      display: "source",
      listMarkupPercent: 20,
      listPriceIncluded: false,
      note: "Planning figures for November 2026. Confirm before a purchase order.",
    },
    mission: cleaned,
    lines: publicLines,
    facility: {
      gpuCount,
      hbmGb,
      racks,
      itKw,
      facilityKw,
      pue: cleaned.pue,
      leadWeeks: critical?.leadWeeks || 0,
      criticalPath: critical?.name || "",
      rackBudgetKw,
      nodeKw,
    },
    totals: {
      hardwareSource,
      sparesSource,
      freightSource,
      energySource,
      capexSource,
      allInSource,
      sourcePerGpu,
      sourcePerGpuHour,
      allInPerGpuHour,
    },
    rackSchema: placeRacks(publicLines, byId, cleaned),
  }
}
