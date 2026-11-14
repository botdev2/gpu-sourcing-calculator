export type Category = "accelerator" | "chassis" | "cpu" | "memory" | "storage" | "network" | "facility"

export type CatalogItem = {
  id: string
  category: Category
  form: "module" | "pcie" | "rack" | "part"
  name: string
  short: string
  spec: string
  unit: string
  sourcePrice: number
  tdpW: number
  hbmGb: number
  gpusIncluded: number
  rackU: number
  leadWeeks: number
  ports: number
  leafOnly: boolean
}

export type Mission = {
  profile: "config1" | "config2" | "training" | "inference" | "rack"
  acceleratorId: string
  nodes: number
  gpusPerNode: 4 | 8
  fabric: "infiniband" | "ethernet"
  cooling: "air" | "liquid"
  cpuId: string
  memoryId: string
  dimmsPerNode: number
  storageId: string
  drivesPerNode: number
  sparesPct: number
  freightPct: number
  pue: number
  usdPerKwh: number
  hoursPerYear: number
  years: number
  utilization: number
  gb300?: number
}

export type QuoteLine = {
  sku: string
  name: string
  category: Category
  spec: string
  unit: string
  qty: number
  spareQty: number
  sourceUnitPrice: number
  sourceLineTotal: number
  leadWeeks: number
  tdpW: number
  priceStatus?: "sourced" | "included" | "unpriced" | "estimated" | "planning"
  source?: { name: string; url: string; retrieved: string; note: string }
}

export type RackBlock = { sku: string; name: string; u: number; role: Category }

export type Rack = {
  id: string
  title: string
  u: 42
  blocks: RackBlock[]
  zeroU: string[]
}

export type Quote = {
  schemaVersion: string
  currency: "USD"
  pricedAt: string
  pricingPolicy: {
    display: "source"
    listMarkupPercent: 20
    listPriceIncluded: false
    note: string
  }
  mission: Mission
  lines: QuoteLine[]
  facility: {
    gpuCount: number
    hbmGb: number
    racks: number
    itKw: number
    facilityKw: number
    pue: number
    leadWeeks: number
    criticalPath: string
    rackBudgetKw: number
    nodeKw: number
  }
  totals: {
    hardwareSource: number
    sparesSource: number
    freightSource: number
    energySource: number
    capexSource: number
    allInSource: number
    sourcePerGpu: number
    sourcePerGpuHour: number
    allInPerGpuHour: number
  }
  rackSchema: Rack[]
}
