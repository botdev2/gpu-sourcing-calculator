function clampInt(value, min, max) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function add(lines, catalogById, id, qty) {
  const q = Math.round(qty)
  if (!id || !catalogById[id] || q <= 0) return
  const existing = lines.find((line) => line.id === id)
  if (existing) existing.qty += q
  else lines.push({ id, qty: q })
}

function planFabric(nicCount, ports) {
  if (nicCount <= ports) return { leaves: Math.max(1, Math.ceil(nicCount / ports)), spines: 0, uplinks: 0 }
  const usable = Math.max(8, ports - 8)
  const leaves = Math.ceil(nicCount / usable)
  const uplinks = leaves * 4
  const spines = Math.ceil(uplinks / ports)
  return { leaves, spines, uplinks }
}

export function buildBom(mission, catalog) {
  const byId = Object.fromEntries(catalog.map((item) => [item.id, item]))
  const lines = []
  const profile = mission.profile === "inference" || mission.profile === "rack" ? mission.profile : "training"

  if (profile === "rack") {
    const racks = clampInt(mission.nodes, 1, 64)
    add(lines, byId, "nvl72", racks)
    const leaf = byId["sw-sn5600"]
    const leaves = Math.max(1, Math.ceil(racks / 4))
    add(lines, byId, "sw-sn5600", leaves)
    add(lines, byId, "dac-800", racks * 8)
    const netU = leaves * (leaf?.rackU || 2)
    const fabricRacks = Math.max(1, Math.ceil(netU / 36))
    add(lines, byId, "rack-42", fabricRacks)
    add(lines, byId, "pdu-60a", (racks + fabricRacks) * 2)
    return lines
  }

  const acc = byId[mission.acceleratorId]
  if (!acc || acc.category !== "accelerator" || acc.form === "rack") return lines

  const nodes = clampInt(mission.nodes, 1, 256)
  const pcie = acc.form === "pcie"
  const gpn = pcie ? (mission.gpusPerNode === 8 ? 8 : 4) : 8
  const cooling = !pcie && mission.cooling === "air" ? "air" : pcie ? "air" : "liquid"
  const ib = !pcie && mission.fabric !== "ethernet"

  const chassisId = pcie
    ? gpn === 8
      ? "chassis-pcie-8"
      : "chassis-pcie-4"
    : cooling === "liquid"
      ? "chassis-hgx-8-liquid"
      : "chassis-hgx-8-air"

  add(lines, byId, acc.id, nodes * gpn)
  add(lines, byId, chassisId, nodes)
  add(lines, byId, mission.cpuId, nodes * 2)
  add(lines, byId, mission.memoryId, nodes * clampInt(mission.dimmsPerNode, 8, 32))
  add(lines, byId, mission.storageId, nodes * clampInt(mission.drivesPerNode, 2, 16))

  let nicId
  let nicsPer
  let switchId
  let dacId
  if (ib) {
    nicId = "nic-cx7"
    nicsPer = 8
    switchId = "sw-qm9700"
    dacId = "dac-400"
  } else if (!pcie) {
    nicId = "nic-cx8"
    nicsPer = 4
    switchId = "sw-sn5600"
    dacId = "dac-800"
  } else {
    nicId = "nic-100"
    nicsPer = gpn >= 8 ? 2 : 1
    switchId = "sw-tor-100"
    dacId = "dac-100"
  }

  const nics = nodes * nicsPer
  add(lines, byId, nicId, nics)
  const sw = byId[switchId]
  const ports = sw?.ports || 32
  const fabric = sw?.leafOnly ? { leaves: Math.max(1, Math.ceil(nics / ports)), spines: 0, uplinks: 0 } : planFabric(nics, ports)
  add(lines, byId, switchId, fabric.leaves + fabric.spines)
  add(lines, byId, dacId, nics + fabric.uplinks)

  const chassis = byId[chassisId]
  const cpu = byId[mission.cpuId]
  const memory = byId[mission.memoryId]
  const storage = byId[mission.storageId]
  const nic = byId[nicId]
  const dimms = clampInt(mission.dimmsPerNode, 8, 32)
  const drives = clampInt(mission.drivesPerNode, 2, 16)
  const nodeW =
    acc.tdpW * gpn +
    (cpu?.tdpW || 0) * 2 +
    (nic?.tdpW || 0) * nicsPer +
    (memory?.tdpW || 0) * dimms +
    (storage?.tdpW || 0) * drives +
    (chassis?.tdpW || 0)

  const cduU = cooling === "liquid" ? 4 : 0
  const gearU = nodes * (chassis?.rackU || 4) + (fabric.leaves + fabric.spines) * (sw?.rackU || 1)
  const racksByU = Math.max(1, Math.ceil(gearU / (40 - cduU)))
  const budgetW = cooling === "liquid" ? 80000 : 15000
  const racksByPower = Math.max(1, Math.ceil((nodeW * nodes) / budgetW))
  const racks = Math.max(racksByU, racksByPower)

  add(lines, byId, "rack-42", racks)
  add(lines, byId, "pdu-60a", racks * 2)
  if (cooling === "liquid") add(lines, byId, "cdu-inrack", racks)
  else if (acc.tdpW * gpn >= 2800) add(lines, byId, "rdhx", racks)

  return lines
}

export function applyOverrides(lines, overrides) {
  const map = new Map(lines.map((line) => [line.id, line.qty]))
  for (const [id, qty] of Object.entries(overrides || {})) {
    const q = Math.round(Number(qty))
    if (!Number.isFinite(q) || q <= 0) map.delete(id)
    else map.set(id, q)
  }
  return [...map.entries()].map(([id, qty]) => ({ id, qty }))
}
