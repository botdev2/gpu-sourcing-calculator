import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { applyOverrides, buildBom } from "../shared/bom.js"
import { PRESETS } from "../shared/mission.js"
import { hourly, kw, money } from "./format"
import type { CatalogItem, Mission, Quote } from "./types"

const GROUPS: { id: Quote["lines"][number]["category"]; label: string }[] = [
  { id: "accelerator", label: "Accelerators" },
  { id: "chassis", label: "Chassis" },
  { id: "cpu", label: "CPUs" },
  { id: "memory", label: "Memory" },
  { id: "storage", label: "Storage" },
  { id: "network", label: "Fabric" },
  { id: "facility", label: "Facility" },
]

const CONFIG_1 = [
  "Server: Dell PowerEdge XE9780",
  "GPU platform: NVIDIA HGX B300 NVL8, air-cooled",
  "GPUs: 8× NVIDIA B300 SXM, 1,100 W each",
  "CPU: 2× Intel Xeon 6 6767P, 64 cores / 128 threads, 2.4 GHz",
  "RAM: 32× 96 GB DDR5-6400 RDIMM, 3,072 GB",
  "Boot: BOSS-N1 with 2× 480 GB SSDs in RAID 1",
  "Data: 1.6 TB enterprise NVMe",
  "Networking: 2× NVIDIA BlueField-3, dual-port 400GbE/NDR",
  "Power: 12× 3200 W hot-plug supplies, 6+6",
  "Management: iDRAC10 Datacenter",
  "OS: none included",
  "Support: 36 months basic next-business-day, estimated",
]

const CONFIG_2 = [
  "Base: Giga Computing G894-SD3-AAX7, 8U, 8× B300 HGX",
  "CPU: 2× Intel Xeon 6776P, 64 cores, 2.3 GHz, 350 W",
  "RAM: 32× 128 GB DDR5-6400",
  "Boot: 2× 960 GB PCIe Gen4 M.2",
  "Data: 8× 3.84 TB PM9D3a",
  "GPU ports: 8× 800 Gb/s OSFP, included on the HGX board",
  "DPU: 1× NVIDIA BlueField-3 BF3220, 200GbE/NDR200",
  "Power: 12× 3000 W 80+ Titanium, 6+6, price not posted",
  "Cords: 12× C19, price not posted",
  "Assembly and test: quantity 1, price not posted",
]

const PROFILES = [
  {
    id: "config1" as const,
    label: "Configuration 1",
    copy: "One air-cooled Dell PowerEdge XE9780 with eight B300 SXM GPUs. Posted prices are marked up 20%. Lines with no public price stay out of the total.",
  },
  {
    id: "config2" as const,
    label: "Giga G894",
    copy: "The Giga Computing G894-SD3-AAX7 sheet: eight B300s, two Xeon 6776P, 32× 128 GB, eight 3.84 TB drives, and one BlueField-3 BF3220.",
  },
  {
    id: "training" as const,
    label: "Training island",
    copy: "Eight-GPU liquid nodes, one NIC per GPU, InfiniBand leaf and spine.",
  },
  {
    id: "inference" as const,
    label: "Inference row",
    copy: "PCIe nodes on 100GbE. Racks split when a row would pass 15 kW of air.",
  },
  {
    id: "rack" as const,
    label: "Rack-scale",
    copy: "GB200 NVL72. GPUs, NVLink, and tray cooling sit inside the rack price.",
  },
]

function shownPrice(status: string | undefined, amount: number) {
  if (status === "unpriced") return "Not posted"
  if (status === "included") return "Included"
  return money(amount)
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function App() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [schema, setSchema] = useState<object | null>(null)
  const [mission, setMission] = useState<Mission>(PRESETS.config1 as Mission)
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"rack" | "schema">("rack")
  const [addId, setAddId] = useState("")
  const [copied, setCopied] = useState("")
  const requestId = useRef(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch("/api/catalog").then((res) => res.json()), fetch("/api/schema").then((res) => res.json())])
      .then(([catalogBody, schemaBody]) => {
        if (cancelled) return
        setCatalog(catalogBody.items)
        setSchema(schemaBody)
      })
      .catch(() => {
        if (!cancelled) setError("The catalog did not load.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!catalog.length) return
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      try {
        const lines = applyOverrides(buildBom(mission, catalog), overrides)
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lines, mission }),
        })
        const body = await res.json()
        if (id !== requestId.current) return
        if (!res.ok) {
          setError(body.error || "This bill could not be priced.")
          return
        }
        setError(null)
        setQuote(body)
      } catch {
        if (id === requestId.current) setError("This bill could not be priced.")
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [catalog, mission, overrides])

  const accelerator = catalog.find((item) => item.id === mission.acceleratorId)
  const pcie = accelerator?.form === "pcie"
  const rackScale = mission.profile === "rack"
  const fixed = mission.profile === "config1" || mission.profile === "config2"
  const manual = Object.keys(overrides).length > 0
  const groups = useMemo(() => {
    if (!quote) return []
    return GROUPS.map((group) => ({
      ...group,
      lines: quote.lines.filter((line) => line.category === group.id),
    })).filter((group) => group.lines.length > 0)
  }, [quote])

  const switchShare = useMemo(() => {
    if (!quote || quote.totals.capexSource <= 0) return 0
    const switches = quote.lines
      .filter((line) => line.sku.startsWith("sw-"))
      .reduce((sum, line) => sum + line.sourceLineTotal, 0)
    return switches / quote.totals.capexSource
  }, [quote])

  function applyPreset(profile: Mission["profile"]) {
    setOverrides({})
    setMission(PRESETS[profile] as Mission)
  }

  function shape(patch: Partial<Mission>) {
    setOverrides({})
    setMission((current) => ({ ...current, ...patch }))
  }

  function chooseAccelerator(id: string) {
    const item = catalog.find((entry) => entry.id === id)
    setOverrides({})
    setMission((current) => ({
      ...current,
      acceleratorId: id,
      gpusPerNode: item?.form === "pcie" ? 4 : 8,
      cooling: item?.form === "pcie" ? "air" : current.cooling,
      fabric: item?.form === "pcie" ? "ethernet" : current.fabric,
    }))
  }

  function setQty(sku: string, qty: number) {
    setOverrides((current) => ({ ...current, [sku]: qty }))
  }

  function addComponent() {
    if (!addId) return
    const currentQty = overrides[addId] ?? quote?.lines.find((line) => line.sku === addId)?.qty ?? 0
    setOverrides((current) => ({ ...current, [addId]: currentQty + 1 }))
  }

  async function copyQuote() {
    if (!quote) return
    await copyText(JSON.stringify(quote, null, 2))
    setCopied("quote")
  }

  async function copySchema() {
    if (!schema) return
    await copyText(JSON.stringify(schema, null, 2))
    setCopied("schema")
  }

  const profileCopy = PROFILES.find((profile) => profile.id === mission.profile)?.copy

  return (
    <>
      <header className="top">
        <div>
          <h1>Busbar</h1>
          <p className="lede">GPU and datacenter sourcing. Every figure is list plus 20%. List stays off the desk.</p>
        </div>
        <ul className="meta">
          <li>Nov 2026</li>
          <li>+20%</li>
          <li>List omitted</li>
        </ul>
      </header>

      <main className="desk">
        <section className="panel mission">
          <h2>Mission</h2>
          <div className="panel-body">
            <div className="seg" role="group" aria-label="Deployment profile">
              {PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={mission.profile === profile.id}
                  onClick={() => applyPreset(profile.id)}
                >
                  {profile.label}
                </button>
              ))}
            </div>
            <p className="hint">{profileCopy}</p>

            {fixed ? (
              <ul className="spec">
                {(mission.profile === "config1" ? CONFIG_1 : CONFIG_2).map((line) => {
                  const cut = line.indexOf(": ")
                  const label = cut > 0 ? line.slice(0, cut) : line
                  const value = cut > 0 ? line.slice(cut + 2) : ""
                  return (
                    <li key={line}>
                      <span>{label}</span>
                      {value ? <strong>{value}</strong> : null}
                    </li>
                  )
                })}
              </ul>
            ) : rackScale ? (
              <Field label="NVL72 racks" hint="Each rack includes 72 GPUs.">
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={mission.nodes}
                  onChange={(event) => shape({ nodes: Number(event.target.value) })}
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
            ) : (
              <>
                <Field label="Accelerator">
                  <select value={mission.acceleratorId} onChange={(event) => chooseAccelerator(event.target.value)}>
                    <optgroup label="HGX / OAM">
                      {catalog
                        .filter((item) => item.form === "module")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.spec}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="PCIe">
                      {catalog
                        .filter((item) => item.form === "pcie")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.spec}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </Field>
                <div className="split">
                  <Field label="Nodes">
                    <input
                      type="number"
                      min={1}
                      max={256}
                      value={mission.nodes}
                      onChange={(event) => shape({ nodes: Number(event.target.value) })}
                      onWheel={(event) => event.currentTarget.blur()}
                    />
                  </Field>
                  <Field label="GPUs / node">
                    {pcie ? (
                      <select
                        value={mission.gpusPerNode}
                        onChange={(event) => shape({ gpusPerNode: Number(event.target.value) === 8 ? 8 : 4 })}
                      >
                        <option value={4}>4</option>
                        <option value={8}>8</option>
                      </select>
                    ) : (
                      <input value="8 on the baseboard" readOnly />
                    )}
                  </Field>
                </div>
                <Field label="Cooling">
                  {pcie ? (
                    <input value="Air · PCIe chassis" readOnly />
                  ) : (
                    <select
                      value={mission.cooling}
                      onChange={(event) => shape({ cooling: event.target.value === "air" ? "air" : "liquid" })}
                    >
                      <option value="liquid">Liquid · in-rack CDU</option>
                      <option value="air">Air · rear door if the node is dense</option>
                    </select>
                  )}
                </Field>
                <Field label="Fabric">
                  {pcie ? (
                    <input value="100GbE top-of-rack" readOnly />
                  ) : (
                    <select
                      value={mission.fabric}
                      onChange={(event) =>
                        shape({ fabric: event.target.value === "ethernet" ? "ethernet" : "infiniband" })
                      }
                    >
                      <option value="infiniband">InfiniBand · ConnectX-7 · QM9700</option>
                      <option value="ethernet">Ethernet · ConnectX-8 · SN5600</option>
                    </select>
                  )}
                </Field>
                <Field label="CPU">
                  <select value={mission.cpuId} onChange={(event) => shape({ cpuId: event.target.value })}>
                    {catalog
                      .filter((item) => item.category === "cpu")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="split">
                  <Field label="DIMM">
                    <select value={mission.memoryId} onChange={(event) => shape({ memoryId: event.target.value })}>
                      {catalog
                        .filter((item) => item.category === "memory")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.short}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="DIMMs / node">
                    <input
                      type="number"
                      min={8}
                      max={32}
                      value={mission.dimmsPerNode}
                      onChange={(event) => shape({ dimmsPerNode: Number(event.target.value) })}
                      onWheel={(event) => event.currentTarget.blur()}
                    />
                  </Field>
                </div>
                <div className="split">
                  <Field label="Drive">
                    <select value={mission.storageId} onChange={(event) => shape({ storageId: event.target.value })}>
                      {catalog
                        .filter((item) => item.category === "storage")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.short}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Drives / node">
                    <input
                      type="number"
                      min={2}
                      max={16}
                      value={mission.drivesPerNode}
                      onChange={(event) => shape({ drivesPerNode: Number(event.target.value) })}
                      onWheel={(event) => event.currentTarget.blur()}
                    />
                  </Field>
                </div>
              </>
            )}

            <h3>Commercial</h3>
            <div className="split">
              <Field label="Spares %" hint="GPUs, CPUs, DIMMs, drives, NICs, cables.">
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  value={mission.sparesPct}
                  onChange={(event) => setMission((current) => ({ ...current, sparesPct: Number(event.target.value) }))}
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
              <Field label="Freight %">
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  value={mission.freightPct}
                  onChange={(event) => setMission((current) => ({ ...current, freightPct: Number(event.target.value) }))}
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
            </div>
            <div className="split">
              <Field label="PUE">
                <input
                  type="number"
                  min={1}
                  max={2.2}
                  step={0.01}
                  value={mission.pue}
                  onChange={(event) => setMission((current) => ({ ...current, pue: Number(event.target.value) }))}
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
              <Field label="$ / kWh">
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.001}
                  value={mission.usdPerKwh}
                  onChange={(event) => setMission((current) => ({ ...current, usdPerKwh: Number(event.target.value) }))}
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
            </div>
            <div className="split">
              <Field label="Years">
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={mission.years}
                  onChange={(event) => setMission((current) => ({ ...current, years: Number(event.target.value) }))}
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
              <Field label="Hours / year">
                <input
                  type="number"
                  min={1}
                  max={8760}
                  step={24}
                  value={mission.hoursPerYear}
                  onChange={(event) =>
                    setMission((current) => ({ ...current, hoursPerYear: Number(event.target.value) }))
                  }
                  onWheel={(event) => event.currentTarget.blur()}
                />
              </Field>
            </div>
            <Field label="Utilization %" hint="Used only for the GPU-hour figures.">
              <input
                type="number"
                min={5}
                max={100}
                value={Math.round(mission.utilization * 100)}
                onChange={(event) =>
                  setMission((current) => ({
                    ...current,
                    utilization: Math.min(100, Math.max(5, Number(event.target.value) || 5)) / 100,
                  }))
                }
                onWheel={(event) => event.currentTarget.blur()}
              />
            </Field>
          </div>
        </section>

        <div className="work">
        <section className="panel bill">
          <h2>Bill of materials</h2>
          {manual ? (
            <div className="banner">
              <span>Manual quantities are on. Changing the mission clears them.</span>
              <button type="button" onClick={() => setOverrides({})}>
                Use mission quantities
              </button>
            </div>
          ) : null}
          {!quote ? (
            <p className="empty">Building the bill…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Source</th>
                    <th className="num">Qty</th>
                    <th className="num">Spares</th>
                    <th className="num">Source each</th>
                    <th className="num">Source line</th>
                    <th className="num">Lead</th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.id}>
                    <tr className="group">
                      <th colSpan={7}>{group.label}</th>
                    </tr>
                    {group.lines.map((line) => (
                      <tr key={line.sku}>
                        <td className="part" data-label="Component">
                          <strong>{line.name}</strong>
                          <span>{line.spec}</span>
                        </td>
                        <td className="source" data-label="Source">
                          {line.source?.url ? (
                            <a href={line.source.url} target="_blank" rel="noreferrer">
                              {line.source.name}
                            </a>
                          ) : (
                            <span className="src-name">{line.source?.name || "Planning figure"}</span>
                          )}
                          {line.source ? (
                            <span title={line.source.note}>{line.source.note}</span>
                          ) : (
                            <span>No distributor page checked.</span>
                          )}
                        </td>
                        <td className="num" data-label="Qty">
                          <input
                            aria-label={`${line.name} quantity`}
                            type="number"
                            min={0}
                            max={100000}
                            value={overrides[line.sku] ?? line.qty}
                            onChange={(event) =>
                              setQty(line.sku, Math.max(0, Math.round(Number(event.target.value) || 0)))
                            }
                            onWheel={(event) => event.currentTarget.blur()}
                          />
                        </td>
                        <td className="num" data-label="Spares">
                          {line.spareQty}
                        </td>
                        <td className="num" data-label="Each">
                          {shownPrice(line.priceStatus, line.sourceUnitPrice)}
                        </td>
                        <td className="num" data-label="Line">
                          {shownPrice(line.priceStatus, line.sourceLineTotal)}
                        </td>
                        <td className="num" data-label="Lead">
                          {line.leadWeeks ? `${line.leadWeeks}w` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          <div className="add-row">
            <select value={addId} onChange={(event) => setAddId(event.target.value)} aria-label="Add a component">
              <option value="">Add a component</option>
              {GROUPS.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {catalog
                    .filter((item) => item.category === group.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button type="button" onClick={addComponent} disabled={!addId}>
              Add
            </button>
          </div>
        </section>

        <section className="panel quote">
          <h2>Source quote</h2>
          {!quote ? (
            <p className="empty">Waiting for a price.</p>
          ) : (
            <div className="panel-body">
              <p className="kicker">Source capex</p>
              <p className="total">{money(quote.totals.capexSource)}</p>
              <p className="policy">{quote.pricingPolicy.note}</p>
              <dl className="rows">
                <div>
                  <dt>Hardware</dt>
                  <dd>{money(quote.totals.hardwareSource)}</dd>
                </div>
                <div>
                  <dt>Spares</dt>
                  <dd>{money(quote.totals.sparesSource)}</dd>
                </div>
                <div>
                  <dt>Freight</dt>
                  <dd>{money(quote.totals.freightSource)}</dd>
                </div>
                <div>
                  <dt>
                    Energy · {quote.mission.years} yr at the meter
                  </dt>
                  <dd>{money(quote.totals.energySource)}</dd>
                </div>
                <div className="emph">
                  <dt>All-in</dt>
                  <dd>{money(quote.totals.allInSource)}</dd>
                </div>
              </dl>
              <dl className="rows stats">
                <div>
                  <dt>Per GPU</dt>
                  <dd>{money(quote.totals.sourcePerGpu)}</dd>
                </div>
                <div>
                  <dt>Capex / GPU-hour</dt>
                  <dd>{hourly(quote.totals.sourcePerGpuHour)}</dd>
                </div>
                <div>
                  <dt>All-in / GPU-hour</dt>
                  <dd>{hourly(quote.totals.allInPerGpuHour)}</dd>
                </div>
                <div>
                  <dt>GPUs</dt>
                  <dd>{quote.facility.gpuCount.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>Aggregate memory</dt>
                  <dd>{quote.facility.hbmGb.toLocaleString("en-US")} GB</dd>
                </div>
                <div>
                  <dt>IT load</dt>
                  <dd>{kw(quote.facility.itKw)}</dd>
                </div>
                <div>
                  <dt>With PUE {quote.facility.pue}</dt>
                  <dd>{kw(quote.facility.facilityKw)}</dd>
                </div>
                <div>
                  <dt>Racks</dt>
                  <dd>
                    {quote.facility.racks} · {quote.facility.rackBudgetKw} kW budget
                  </dd>
                </div>
                <div>
                  <dt>Critical path</dt>
                  <dd>
                    {quote.facility.leadWeeks
                      ? `${quote.facility.leadWeeks}w · ${quote.facility.criticalPath}`
                      : "Not in the listings"}
                  </dd>
                </div>
              </dl>
              {switchShare > 0.25 ? (
                <p className="note">
                  Fabric switches are more than a quarter of capex. Grow the node count before you buy a second one.
                </p>
              ) : null}
              {fixed ? (
                <p className="note">
                  IT load sums the published 1,100 W per GPU and 350 W per CPU. Memory, drives, and DPUs do not publish a
                  TDP on these pages. Support is the midpoint of a published 6–9% yearly band, for three years, then
                  marked up 20%. Lines marked not posted are outside the total.
                </p>
              ) : (
                <p className="note">
                  Racks follow the tighter of U-space and a {rackScale ? "120 kW NVL72" : "15 kW air / 80 kW liquid"}{" "}
                  budget. Spares are cold and stay out of the power sum. Energy is facility kW × hours × years × power
                  price.
                </p>
              )}
              {error ? <p className="error">{error}</p> : <p className="valid">Matches the sourcing quote schema.</p>}
              <div className="actions">
                <button type="button" onClick={copyQuote}>
                  {copied === "quote" ? "Copied" : "Copy quote JSON"}
                </button>
                <button type="button" onClick={() => quote && download("sourcing-quote.json", quote)}>
                  Download quote
                </button>
              </div>
            </div>
          )}
        </section>
        </div>
      </main>

      <section className="schema-wrap">
        <div className="schema-head">
          <h2>Schema</h2>
          <div className="seg" role="group" aria-label="Schema view">
            <button type="button" aria-pressed={tab === "rack"} onClick={() => setTab("rack")}>
              Rack schema
            </button>
            <button type="button" aria-pressed={tab === "schema"} onClick={() => setTab("schema")}>
              Quote schema
            </button>
          </div>
        </div>

        {tab === "rack" ? (
          <div className="rack-board">
            {!quote ? (
              <p className="empty">The rack schema appears with the quote.</p>
            ) : (
              <>
                <div className="legend">
                  <span className="swatch accelerator">Accelerator</span>
                  <span className="swatch chassis">Chassis</span>
                  <span className="swatch network">Fabric</span>
                  <span className="swatch facility">Facility</span>
                  <span>Bottom of the rack is the bottom of the drawing. 0U gear is listed under each rack.</span>
                </div>
                <div className="racks">
                  {quote.rackSchema.map((rack) => {
                    const used = rack.blocks.reduce((sum, block) => sum + block.u, 0)
                    return (
                      <article className="rack" key={rack.id}>
                        <header>
                          <strong>{rack.title}</strong>
                          <span>{used} / 42U</span>
                        </header>
                        <div className="rack-bay">
                          {rack.blocks.map((block, index) => (
                            <div key={`${block.sku}-${index}`} className={`bay bay-${block.role}`} style={{ flexGrow: block.u }}>
                              <span>{block.name}</span>
                              <em>{block.u}U</em>
                            </div>
                          ))}
                          <div className="bay bay-empty" style={{ flexGrow: Math.max(0, 42 - used) }} />
                        </div>
                        <ul>
                          {rack.zeroU.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="json-grid">
            <article>
              <header>
                <h3>sourcing-quote.schema.json</h3>
                <div>
                  <button type="button" onClick={copySchema}>
                    {copied === "schema" ? "Copied" : "Copy"}
                  </button>
                  <button type="button" onClick={() => schema && download("sourcing-quote.schema.json", schema)}>
                    Download
                  </button>
                </div>
              </header>
              <pre>{schema ? JSON.stringify(schema, null, 2) : "Loading schema…"}</pre>
            </article>
            <article>
              <header>
                <h3>Live instance</h3>
                <div>
                  <button type="button" onClick={copyQuote}>
                    Copy
                  </button>
                  <button type="button" onClick={() => quote && download("sourcing-quote.json", quote)}>
                    Download
                  </button>
                </div>
              </header>
              <pre>{quote ? JSON.stringify(quote, null, 2) : "Waiting for a quote…"}</pre>
            </article>
          </div>
        )}
      </section>

      <footer>
        <p>
          November 2026 planning basis. Not a live distributor feed. Confirm every source price before you issue a
          purchase order.
        </p>
      </footer>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}
