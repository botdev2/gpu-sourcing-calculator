import { catalog } from "./catalog.js"
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

console.log(
  "ok",
  `training ${training.facility.racks} racks ${training.facility.itKw} kW`,
  `inference check passed`,
  `rack-scale ${rack.facility.gpuCount} GPUs`,
)
