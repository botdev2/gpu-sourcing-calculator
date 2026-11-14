import { catalog } from "./catalog.js"
import { normalizeIntake, publicOffer } from "./intake.js"
import { PRESETS } from "../shared/mission.js"
import { buildBom } from "../shared/bom.js"
import { priceQuote, validateQuote } from "../shared/pricing.js"
import { quoteSchema } from "../shared/schema.js"

function assert(condition, message) {
  if (!condition) {
    console.error(message)
    process.exit(1)
  }
}

const banned = /"list"|"retail"|"listPrice"|"retailPrice"|"msrp"/i

for (const item of catalog) {
  assert(!("list" in item) && !("retail" in item), `${item.id} stores a list price`)
  const implied = Math.round(item.sourcePrice / 1.2)
  assert(Math.round(implied * 1.2) === item.sourcePrice, `${item.id} is not a clean list-plus-20% source price`)
}

assert(!banned.test(JSON.stringify(quoteSchema)), "schema exposes list or retail")

for (const [name, preset] of Object.entries(PRESETS)) {
  const quote = priceQuote({ lines: buildBom(preset, catalog), mission: preset, catalog })
  if (!validateQuote(quote)) {
    console.error(name, JSON.stringify(validateQuote.errors, null, 2))
    process.exit(1)
  }
  assert(!banned.test(JSON.stringify(quote)), `${name} quote exposes list or retail`)
  for (const rack of quote.rackSchema) {
    const used = rack.blocks.reduce((sum, block) => sum + block.u, 0)
    assert(used <= 42, `${name} ${rack.id} overflows ${used}U`)
  }
}

const training = priceQuote({
  lines: buildBom(PRESETS.training, catalog),
  mission: PRESETS.training,
  catalog,
})
const b200 = training.lines.find((line) => line.sku === "gpu-b200")
assert(b200.qty === 64, `expected 64 B200s, got ${b200.qty}`)
assert(b200.sourceUnitPrice === 40800, `B200 source price ${b200.sourceUnitPrice}`)
assert(b200.spareQty === 2, `expected 2 spare B200s, got ${b200.spareQty}`)
assert(training.facility.gpuCount === 64, "gpu count")
assert(!JSON.stringify(training).includes("34000"), "list price leaked into the quote")

const rack = priceQuote({
  lines: buildBom(PRESETS.rack, catalog),
  mission: PRESETS.rack,
  catalog,
})
assert(rack.facility.gpuCount === 288, `expected 288 GPUs in four NVL72 racks, got ${rack.facility.gpuCount}`)

const config1 = priceQuote({
  lines: buildBom(PRESETS.config1, catalog),
  mission: PRESETS.config1,
  catalog,
})
const board = config1.lines.find((line) => line.sku === "hgx-b300-nvl8")
const dimms = config1.lines.find((line) => line.sku === "dimm-96-6400")
const psus = config1.lines.find((line) => line.sku === "psu-3200")
const chassis = config1.lines.find((line) => line.sku === "chassis-xe9780")
assert(config1.facility.gpuCount === 8, "configuration 1 gpu count")
assert(board?.qty === 1 && board.sourceUnitPrice === 545100, "B300 board source price")
assert(board?.source?.url?.includes("gatewellusa.com"), "B300 source link")
assert(dimms?.qty === 32, "32 memory modules")
assert(psus?.qty === 12, "12 power supplies")
assert(chassis?.priceStatus === "unpriced" && chassis.sourceUnitPrice === 0, "chassis stays unpriced")
assert(!/\b454250\b|\b8400\b|\b4817\b|\b2789\b/.test(JSON.stringify(config1)), "posted price leaked into configuration 1")

const config2 = priceQuote({
  lines: buildBom(PRESETS.config2, catalog),
  mission: PRESETS.config2,
  catalog,
})
assert(config2.lines.find((line) => line.sku === "cpu-6776p")?.qty === 2, "Giga CPU quantity")
assert(config2.lines.find((line) => line.sku === "pm9d3a-3.84")?.qty === 8, "Giga drive quantity")
assert(config2.lines.find((line) => line.sku === "hgx-osfp")?.priceStatus === "included", "OSFP ports included")

const offer = publicOffer(catalog)
assert(offer.length === catalog.length, "offer drops products")
assert(!JSON.stringify(offer).includes("sourcePrice"), "offer includes a price")
assert(!offer.some((item) => "source" in item || "leadWeeks" in item), "offer includes sourcing detail")
const rejected = normalizeIntake({ kind: "order", kyc: {}, order: [] }, catalog)
assert(rejected.error, "empty template rejected")
const accepted = normalizeIntake(
  {
    kind: "order",
    kyc: {
      company: "North Mill",
      registry: "12345678",
      country: "Estonia",
      address: "Tallinn 1",
      contact: "Ada Saar",
      email: "ada@example.com",
      role: "Buyer",
      phone: "+372 5551 234",
      use: "Training cluster",
    },
    order: [{ id: "gpu-b200", qty: 8 }],
    tokens: { amount: "20 million", period: "month", use: "Inference" },
  },
  catalog,
)
assert(accepted.record?.order[0].qty === 8, "order line kept")
assert(!JSON.stringify(accepted.record).includes("sourcePrice"), "intake stores a price")

console.log(
  "ok",
  `training ${training.facility.racks} racks ${training.facility.itKw} kW`,
  `configuration 1 ${config1.totals.capexSource} source capex`,
  `rack-scale ${rack.facility.gpuCount} GPUs`,
)
