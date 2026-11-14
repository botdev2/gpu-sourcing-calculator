import { useEffect, useState } from "react"
import type { Draft, TokenAsk } from "./draft"

type OfferItem = {
  id: string
  category: string
  name: string
  short: string
  spec: string
  unit: string
}

type Screen = "home" | "order" | "kyc" | "site" | "sent"

const GROUPS = [
  { id: "accelerator", label: "Accelerators" },
  { id: "chassis", label: "Servers" },
  { id: "cpu", label: "CPUs" },
  { id: "memory", label: "Memory" },
  { id: "storage", label: "Storage" },
  { id: "network", label: "Fabric" },
  { id: "facility", label: "Facility" },
]

const PERIODS: { id: TokenAsk["period"]; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
]

const emptyKyc = {
  company: "",
  registry: "",
  country: "",
  address: "",
  contact: "",
  email: "",
  role: "",
  phone: "",
  use: "",
}

const emptySite = {
  where: "",
  site: "searching",
  power: "",
  utility: "none",
  permits: "none",
  cooling: "undecided",
  workload: "mixed",
  scale: "",
  network: "internet",
  when: "",
  contact: "",
  email: "",
}

export function Front({
  draft,
  onDraft,
  access,
  onUnlocked,
  onDesk,
}: {
  draft: Draft
  onDraft: (next: Draft) => void
  access: string
  onUnlocked: (access: string) => void
  onDesk: () => void
}) {
  const [items, setItems] = useState<OfferItem[]>([])
  const [group, setGroup] = useState("accelerator")
  const [screen, setScreen] = useState<Screen>("home")
  const [kyc, setKyc] = useState(emptyKyc)
  const [site, setSite] = useState(emptySite)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    fetch("/api/offer")
      .then((res) => res.json())
      .then((body) => setItems(body.items || []))
      .catch(() => setItems([]))
  }, [])

  function setQty(item: OfferItem, qty: number) {
    const next = Math.max(0, qty)
    const lines = draft.lines.filter((line) => line.id !== item.id)
    if (next > 0) lines.push({ id: item.id, name: item.name, qty: next })
    onDraft({ ...draft, lines })
  }

  function setTokens(patch: Partial<TokenAsk> | null) {
    if (!patch) {
      onDraft({ ...draft, tokens: null })
      return
    }
    onDraft({
      ...draft,
      tokens: {
        amount: draft.tokens?.amount || "",
        period: draft.tokens?.period || "month",
        use: draft.tokens?.use || "",
        ...patch,
      },
    })
  }

  const ready = draft.lines.length > 0 || Boolean(draft.tokens?.amount?.trim())
  const shown = items.filter((item) => item.category === group)
  const qtyOf = (id: string) => draft.lines.find((line) => line.id === id)?.qty || 0

  async function submitOrder() {
    setBusy(true)
    setFormError("")
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "order", kyc, order: draft.lines, tokens: draft.tokens }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error || "The form did not go through.")
        return
      }
      onUnlocked(body.access)
    } catch {
      setFormError("The form did not go through.")
    } finally {
      setBusy(false)
    }
  }

  async function submitBrief() {
    setBusy(true)
    setFormError("")
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "brief", site }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error || "The brief did not go through.")
        return
      }
      setScreen("sent")
    } catch {
      setFormError("The brief did not go through.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="top">
        <div>
          <h1>
            <span className="mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="16" height="16">
                <rect x="4" y="6" width="24" height="3" rx="1.5" fill="#fff" />
                <rect x="4" y="14.5" width="17" height="3" rx="1.5" fill="#fff" />
                <rect x="4" y="23" width="10" height="3" rx="1.5" fill="#fff" />
              </svg>
            </span>
            <span className="brand-name">
              <span>Stratum</span>
              <span>Infrastructure</span>
            </span>
          </h1>
          <p className="lede">Estonia. The calculator opens after client verification.</p>
        </div>
        <div className="meta-row">
          {screen !== "home" ? (
            <button type="button" className="ghost" onClick={() => setScreen("home")}>
              Back
            </button>
          ) : null}
          {access ? (
            <button type="button" className="ghost" onClick={onDesk}>
              Calculator
            </button>
          ) : null}
        </div>
      </header>

      <main className="front">
        {screen === "home" ? (
          <section className="paths">
            <button type="button" className="path" onClick={() => setScreen("order")}>
              <strong>Source hardware</strong>
              <span>Build the order, then complete verification.</span>
            </button>
            <button type="button" className="path" onClick={() => setScreen("site")}>
              <strong>Plan a data center</strong>
              <span>Site, power, permits, cooling, and the workload.</span>
            </button>
          </section>
        ) : null}

        {screen === "order" ? (
          <>
            <section className="panel offer">
              <h2>Hardware</h2>
              <div className="panel-body">
                <div className="seg" role="group" aria-label="Hardware group">
                  {GROUPS.map((entry) => (
                    <button key={entry.id} type="button" aria-pressed={group === entry.id} onClick={() => setGroup(entry.id)}>
                      {entry.label}
                    </button>
                  ))}
                </div>
                <ul className="offer-list">
                  {shown.map((item) => {
                    const qty = qtyOf(item.id)
                    return (
                      <li key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.spec}</span>
                        </div>
                        <div className="qty">
                          <button type="button" className="ghost" onClick={() => setQty(item, qty - 1)} aria-label={`Remove one ${item.name}`}>
                            −
                          </button>
                          <span>{qty ? `${qty} ${item.unit}` : item.unit}</span>
                          <button type="button" className="ghost" onClick={() => setQty(item, qty + 1)} aria-label={`Add one ${item.name}`}>
                            +
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>

            <section className="panel">
              <h2>Tokens</h2>
              <div className="panel-body">
                <p className="hint">Optional. Stratum sources the volume from the market at a discount.</p>
                <div className="split">
                  <label className="field">
                    <span>How many</span>
                    <input
                      value={draft.tokens?.amount || ""}
                      placeholder="20 million"
                      onChange={(event) => {
                        const amount = event.target.value
                        if (!amount.trim()) setTokens(null)
                        else setTokens({ amount })
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Period</span>
                    <select
                      value={draft.tokens?.period || "month"}
                      onChange={(event) => {
                        if (!draft.tokens?.amount?.trim()) return
                        setTokens({ period: event.target.value as TokenAsk["period"] })
                      }}
                    >
                      {PERIODS.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>What they are for</span>
                  <input
                    value={draft.tokens?.use || ""}
                    onChange={(event) => {
                      if (!draft.tokens?.amount) return
                      setTokens({ use: event.target.value })
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="panel">
              <h2>Order</h2>
              <div className="panel-body">
                {ready ? (
                  <ul className="order-list">
                    {draft.lines.map((line) => (
                      <li key={line.id}>
                        <span>{line.name}</span>
                        <strong>{line.qty}</strong>
                      </li>
                    ))}
                    {draft.tokens?.amount ? (
                      <li>
                        <span>
                          Tokens · {draft.tokens.amount} / {draft.tokens.period}
                        </span>
                        <strong>{draft.tokens.use || "Open"}</strong>
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="hint">Add hardware or a token volume.</p>
                )}
                <button type="button" disabled={!ready} onClick={() => setScreen("kyc")}>
                  Continue to verification
                </button>
              </div>
            </section>
          </>
        ) : null}

        {screen === "kyc" ? (
          <section className="panel">
            <h2>Client verification</h2>
            <form
              className="panel-body"
              onSubmit={(event) => {
                event.preventDefault()
                submitOrder()
              }}
            >
              <p className="hint">The calculator opens when this form is submitted.</p>
              <div className="kyc-grid">
                {(
                  [
                    ["company", "Legal name", "text"],
                    ["registry", "Registry code", "text"],
                    ["country", "Country", "text"],
                    ["contact", "Contact name", "text"],
                    ["email", "Work email", "email"],
                    ["role", "Role", "text"],
                    ["phone", "Phone", "tel"],
                  ] as const
                ).map(([key, label, type]) => (
                  <label key={key} className="field">
                    <span>{label}</span>
                    <input
                      required
                      type={type}
                      autoComplete={key === "email" ? "email" : "on"}
                      value={kyc[key]}
                      onChange={(event) => setKyc((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </label>
                ))}
                <label className="field wide">
                  <span>Address</span>
                  <input
                    required
                    value={kyc.address}
                    onChange={(event) => setKyc((current) => ({ ...current, address: event.target.value }))}
                  />
                </label>
                <label className="field wide">
                  <span>Intended use</span>
                  <input
                    required
                    value={kyc.use}
                    onChange={(event) => setKyc((current) => ({ ...current, use: event.target.value }))}
                  />
                </label>
              </div>
              {formError ? <p className="error">{formError}</p> : null}
              <div className="actions">
                <button type="button" className="ghost" onClick={() => setScreen("order")}>
                  Back to the order
                </button>
                <button type="submit" disabled={busy || !ready}>
                  {busy ? "Sending" : "Submit and open calculator"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {screen === "site" ? (
          <section className="panel">
            <h2>Data center</h2>
            <form
              className="panel-body"
              onSubmit={(event) => {
                event.preventDefault()
                submitBrief()
              }}
            >
              <div className="kyc-grid">
                <label className="field wide">
                  <span>Location</span>
                  <input required value={site.where} placeholder="Country and city" onChange={(event) => setSite({ ...site, where: event.target.value })} />
                </label>
                <label className="field">
                  <span>Site</span>
                  <select value={site.site} onChange={(event) => setSite({ ...site, site: event.target.value })}>
                    <option value="owned">Owned</option>
                    <option value="leased">Leased</option>
                    <option value="searching">Still looking</option>
                  </select>
                </label>
                <label className="field">
                  <span>Power</span>
                  <input required value={site.power} placeholder="4 MW now, 20 MW target" onChange={(event) => setSite({ ...site, power: event.target.value })} />
                </label>
                <label className="field">
                  <span>Utility</span>
                  <select value={site.utility} onChange={(event) => setSite({ ...site, utility: event.target.value })}>
                    <option value="connected">Connected</option>
                    <option value="filed">Application filed</option>
                    <option value="none">Not started</option>
                  </select>
                </label>
                <label className="field">
                  <span>Permits</span>
                  <select value={site.permits} onChange={(event) => setSite({ ...site, permits: event.target.value })}>
                    <option value="none">None yet</option>
                    <option value="progress">In progress</option>
                    <option value="granted">Granted</option>
                  </select>
                </label>
                <label className="field">
                  <span>Cooling</span>
                  <select value={site.cooling} onChange={(event) => setSite({ ...site, cooling: event.target.value })}>
                    <option value="air">Air</option>
                    <option value="liquid">Liquid</option>
                    <option value="undecided">Not decided</option>
                  </select>
                </label>
                <label className="field">
                  <span>Workload</span>
                  <select value={site.workload} onChange={(event) => setSite({ ...site, workload: event.target.value })}>
                    <option value="training">Training</option>
                    <option value="inference">Inference</option>
                    <option value="mixed">Mixed</option>
                    <option value="colo">Capacity for others</option>
                  </select>
                </label>
                <label className="field">
                  <span>Scale</span>
                  <input required value={site.scale} placeholder="1,000 GPUs or 8 MW IT" onChange={(event) => setSite({ ...site, scale: event.target.value })} />
                </label>
                <label className="field">
                  <span>Connectivity</span>
                  <select value={site.network} onChange={(event) => setSite({ ...site, network: event.target.value })}>
                    <option value="internet">Internet</option>
                    <option value="fiber">Private fiber</option>
                    <option value="infiniband">InfiniBand on site</option>
                  </select>
                </label>
                <label className="field">
                  <span>First capacity</span>
                  <input required value={site.when} placeholder="This year" onChange={(event) => setSite({ ...site, when: event.target.value })} />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input required value={site.contact} onChange={(event) => setSite({ ...site, contact: event.target.value })} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input required type="email" value={site.email} onChange={(event) => setSite({ ...site, email: event.target.value })} />
                </label>
              </div>
              {formError ? <p className="error">{formError}</p> : null}
              <div className="actions">
                <button type="submit" disabled={busy}>
                  {busy ? "Sending" : "Send brief"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {screen === "sent" ? (
          <section className="panel">
            <h2>Brief received</h2>
            <div className="panel-body">
              <p className="hint">Hardware pricing still goes through verification.</p>
              <button type="button" onClick={() => setScreen("order")}>
                Prepare a hardware order
              </button>
            </div>
          </section>
        ) : null}
      </main>

      <footer>
        <p>Stratum Infrastructure · Estonia. Confirm the order before you commit to it.</p>
      </footer>
    </>
  )
}
