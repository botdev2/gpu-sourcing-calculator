import { useEffect, useRef, useState } from "react"
import type { Draft, TokenAsk } from "./draft"

type OfferItem = {
  id: string
  category: string
  name: string
  short: string
  spec: string
  unit: string
}

type Role = "guide" | "you"

type Msg = { id: number; role: Role; text: string }

type Step =
  | "choose"
  | "cover"
  | "token-amount"
  | "token-period"
  | "token-use"
  | "gear"
  | "kyc"
  | "dc-where"
  | "dc-site"
  | "dc-power"
  | "dc-utility"
  | "dc-permits"
  | "dc-cooling"
  | "dc-workload"
  | "dc-scale"
  | "dc-network"
  | "dc-when"
  | "dc-who"
  | "dc-done"

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
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("choose")
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 1,
      role: "guide",
      text: "Stratum Infrastructure, Estonia. I can prepare a hardware order, take a token volume, or walk a data-center plan from the site outward. Where should we start?",
    },
  ])
  const [text, setText] = useState("")
  const [kyc, setKyc] = useState(emptyKyc)
  const [who, setWho] = useState({ contact: "", email: "" })
  const [site, setSite] = useState({
    where: "",
    site: "",
    power: "",
    utility: "",
    permits: "",
    cooling: "",
    workload: "",
    scale: "",
    network: "",
    when: "",
  })
  const [afterTokens, setAfterTokens] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")
  const seq = useRef(1)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/offer")
      .then((res) => res.json())
      .then((body) => setItems(body.items || []))
      .catch(() => setItems([]))
  }, [])

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [messages, step, open])

  function say(role: Role, line: string) {
    setMessages((current) => [...current, { id: ++seq.current, role, text: line }])
  }

  function begin(path: "order" | "brief") {
    setOpen(true)
    if (step !== "choose") return
    if (path === "order") {
      say("you", "Source hardware")
      say("guide", "What should we put on the order?")
      setStep("cover")
      return
    }
    say("you", "Plan a data center")
    say("guide", "This path starts from the site. Where is it, or where should it be?")
    setStep("dc-where")
  }

  function cover(choice: string) {
    say("you", choice)
    const tokens = choice === "Inference tokens" || choice === "All of it"
    if (choice === "Fabric and power") setGroup("network")
    if (choice === "GPUs and servers") setGroup("accelerator")
    if (!tokens) {
      say("guide", "Add the pieces from the list. Tell me when the order is ready.")
      setStep("gear")
      return
    }
    setAfterTokens(choice === "All of it")
    if (draft.tokens?.amount) {
      say(
        "guide",
        `${draft.tokens.amount} per ${draft.tokens.period} is on the order. We source that volume from the market at a discount. Add hardware, or continue to the template.`,
      )
      setStep("gear")
      return
    }
    say("guide", "How many tokens do you need?")
    setStep("token-amount")
  }

  function tokenAmount(amount: string) {
    const clean = amount.trim()
    if (!clean) return
    onDraft({ ...draft, tokens: { amount: clean, period: draft.tokens?.period || "month", use: draft.tokens?.use || "" } })
    say("you", clean)
    say("guide", "Over what period?")
    setText("")
    setStep("token-period")
  }

  function tokenPeriod(period: TokenAsk["period"], label: string) {
    onDraft({
      ...draft,
      tokens: { amount: draft.tokens?.amount || text.trim(), period, use: draft.tokens?.use || "" },
    })
    say("you", label)
    say("guide", "What are they for?")
    setStep("token-use")
  }

  function tokenUse(use: string) {
    const tokens = {
      amount: draft.tokens?.amount || "",
      period: draft.tokens?.period || "month",
      use: use.trim(),
    }
    onDraft({ ...draft, tokens })
    say("you", use.trim() || "General pool")
    say(
      "guide",
      `${tokens.amount} per ${tokens.period} is on the order. We source that volume from the market at a discount.${afterTokens ? " Add the hardware from the list, then continue." : " Continue when you want the template."}`,
    )
    setText("")
    setStep("gear")
  }

  function ready(onlyTokens: boolean) {
    say("you", onlyTokens ? "I only need tokens" : "The order is ready")
    if (onlyTokens && !draft.tokens?.amount) {
      say("guide", "How many tokens do you need?")
      setStep("token-amount")
      return
    }
    if (!onlyTokens && !draft.lines.length && !draft.tokens?.amount) {
      say("guide", "The order is still empty. Add a product, or give me the token volume.")
      return
    }
    say("guide", "The calculator stays closed until this template is in.")
    setStep("kyc")
  }

  function setQty(item: OfferItem, qty: number) {
    const next = Math.max(0, qty)
    const lines = draft.lines.filter((line) => line.id !== item.id)
    if (next > 0) lines.push({ id: item.id, name: item.name, qty: next })
    onDraft({ ...draft, lines })
  }

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
        setFormError(body.error || "The template did not go through.")
        return
      }
      say("guide", "Template received. The calculator is open.")
      onUnlocked(body.access)
    } catch {
      setFormError("The template did not go through.")
    } finally {
      setBusy(false)
    }
  }

  function dcChoice(field: keyof typeof site, value: string, label: string, next: Step, prompt: string) {
    setSite((current) => ({ ...current, [field]: value }))
    say("you", label)
    say("guide", prompt)
    setStep(next)
  }

  function dcText(field: "where" | "power" | "scale" | "when", next: Step, prompt: string) {
    const value = text.trim()
    if (value.length < 2) return
    setSite((current) => ({ ...current, [field]: value }))
    say("you", value)
    say("guide", prompt)
    setText("")
    setStep(next)
  }

  async function submitBrief() {
    setBusy(true)
    setFormError("")
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "brief", site: { ...site, ...who } }),
      })
      const body = await res.json()
      if (!res.ok) {
        setFormError(body.error || "The brief did not go through.")
        return
      }
      say("guide", "Brief received. Hardware pricing still waits on the KYC template, if you want it.")
      setStep("dc-done")
    } catch {
      setFormError("The brief did not go through.")
    } finally {
      setBusy(false)
    }
  }

  const shown = items.filter((item) => item.category === group)
  const qtyOf = (id: string) => draft.lines.find((line) => line.id === id)?.qty || 0

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
          <p className="lede">Estonia. Hardware, tokens, and data-center plans.</p>
        </div>
        {access ? (
          <button type="button" className="ghost" onClick={onDesk}>
            Calculator
          </button>
        ) : null}
      </header>

      <main className="front">
        <section className="paths">
          <button type="button" className="path" onClick={() => begin("order")}>
            <strong>Source hardware</strong>
            <span>Choose the gear, add a token volume, and prepare the order.</span>
          </button>
          <button type="button" className="path" onClick={() => begin("brief")}>
            <strong>Plan a data center</strong>
            <span>Site, power, permits, cooling, and the workload.</span>
          </button>
        </section>

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
            <p className="hint">Tell us the volume. Stratum sources tokens from the market at a discount.</p>
            <div className="split">
              <label className="field">
                <span>How many</span>
                <input
                  value={draft.tokens?.amount || ""}
                  placeholder="20 million"
                  onChange={(event) => {
                    const amount = event.target.value
                    if (!amount.trim()) onDraft({ ...draft, tokens: null })
                    else
                      onDraft({
                        ...draft,
                        tokens: { amount, period: draft.tokens?.period || "month", use: draft.tokens?.use || "" },
                      })
                  }}
                />
              </label>
              <label className="field">
                <span>Period</span>
                <select
                  value={draft.tokens?.period || "month"}
                  onChange={(event) => {
                    const period = event.target.value as TokenAsk["period"]
                    if (!draft.tokens?.amount) return
                    onDraft({ ...draft, tokens: { ...draft.tokens, period } })
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
                placeholder="Inference, a named model, or a general pool"
                onChange={(event) => {
                  if (!draft.tokens?.amount) return
                  onDraft({ ...draft, tokens: { ...draft.tokens, use: event.target.value } })
                }}
              />
            </label>
          </div>
        </section>

        {draft.lines.length || draft.tokens?.amount ? (
          <section className="panel">
            <h2>Order</h2>
            <div className="panel-body">
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
              <button type="button" onClick={() => begin("order")}>
                Continue in the guide
              </button>
            </div>
          </section>
        ) : null}
      </main>

      <footer>
        <p>Stratum Infrastructure · Estonia. Confirm the order before you commit to it.</p>
      </footer>

      {open ? (
        <section className="chat" aria-label="Guide">
          <header>
            <strong>Guide</strong>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>
          <div className="thread">
            {messages.map((message) => (
              <p key={message.id} className={message.role}>
                {message.text}
              </p>
            ))}
            <div ref={end} />
          </div>
          <div className="composer">
            {step === "choose" ? (
              <div className="replies">
                <button type="button" className="ghost" onClick={() => begin("order")}>
                  Source hardware
                </button>
                <button type="button" className="ghost" onClick={() => begin("brief")}>
                  Plan a data center
                </button>
              </div>
            ) : null}
            {step === "cover" ? (
              <div className="replies">
                {["GPUs and servers", "Fabric and power", "Inference tokens", "All of it"].map((choice) => (
                  <button key={choice} type="button" className="ghost" onClick={() => cover(choice)}>
                    {choice}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "token-amount" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  tokenAmount(text)
                }}
              >
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="How many" aria-label="Token volume" />
                <button type="submit">Continue</button>
              </form>
            ) : null}
            {step === "token-period" ? (
              <div className="replies">
                {PERIODS.map((period) => (
                  <button key={period.id} type="button" className="ghost" onClick={() => tokenPeriod(period.id, period.label)}>
                    {period.label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "token-use" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  tokenUse(text)
                }}
              >
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Inference, a model, a pool" aria-label="Token use" />
                <button type="submit">Continue</button>
              </form>
            ) : null}
            {step === "gear" ? (
              <div className="replies">
                <button type="button" className="ghost" onClick={() => ready(false)}>
                  The order is ready
                </button>
                <button type="button" className="ghost" onClick={() => ready(true)}>
                  I only need tokens
                </button>
              </div>
            ) : null}
            {step === "kyc" ? (
              <form
                className="kyc"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitOrder()
                }}
              >
                {(
                  [
                    ["company", "Legal name"],
                    ["registry", "Registry code"],
                    ["country", "Country"],
                    ["address", "Address"],
                    ["contact", "Contact name"],
                    ["email", "Work email"],
                    ["role", "Role"],
                    ["phone", "Phone"],
                    ["use", "What the order is for"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="field">
                    <span>{label}</span>
                    <input
                      required
                      type={key === "email" ? "email" : "text"}
                      value={kyc[key]}
                      onChange={(event) => setKyc((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </label>
                ))}
                {formError ? <p className="error">{formError}</p> : null}
                <button type="submit" disabled={busy}>
                  {busy ? "Sending" : "Submit template"}
                </button>
              </form>
            ) : null}
            {step === "dc-where" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  dcText("where", "dc-site", "Do you have the site?")
                }}
              >
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Country and city" aria-label="Location" />
                <button type="submit">Continue</button>
              </form>
            ) : null}
            {step === "dc-site" ? (
              <div className="replies">
                {[
                  ["owned", "Owned"],
                  ["leased", "Leased"],
                  ["searching", "Still looking"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="ghost"
                    onClick={() => dcChoice("site", value, label, "dc-power", "How much power is available now, and how much do you need?")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "dc-power" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  dcText("power", "dc-utility", "Where is the utility connection?")
                }}
              >
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="4 MW now, 20 MW target" aria-label="Power" />
                <button type="submit">Continue</button>
              </form>
            ) : null}
            {step === "dc-utility" ? (
              <div className="replies">
                {[
                  ["connected", "Connected"],
                  ["filed", "Application filed"],
                  ["none", "Not started"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="ghost"
                    onClick={() => dcChoice("utility", value, label, "dc-permits", "Which permits are in hand?")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "dc-permits" ? (
              <div className="replies">
                {[
                  ["none", "None yet"],
                  ["progress", "In progress"],
                  ["granted", "Granted"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="ghost"
                    onClick={() => dcChoice("permits", value, label, "dc-cooling", "How do you want to cool it?")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "dc-cooling" ? (
              <div className="replies">
                {[
                  ["air", "Air"],
                  ["liquid", "Liquid"],
                  ["undecided", "Not decided"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="ghost"
                    onClick={() => dcChoice("cooling", value, label, "dc-workload", "What will the hall run?")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "dc-workload" ? (
              <div className="replies">
                {[
                  ["training", "Training"],
                  ["inference", "Inference"],
                  ["mixed", "Mixed"],
                  ["colo", "Capacity for others"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="ghost"
                    onClick={() => dcChoice("workload", value, label, "dc-scale", "What scale are you planning?")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "dc-scale" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  dcText("scale", "dc-network", "What connectivity do you need?")
                }}
              >
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="1,000 GPUs or 8 MW IT" aria-label="Scale" />
                <button type="submit">Continue</button>
              </form>
            ) : null}
            {step === "dc-network" ? (
              <div className="replies">
                {[
                  ["internet", "Internet"],
                  ["fiber", "Private fiber"],
                  ["infiniband", "InfiniBand on site"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="ghost"
                    onClick={() => dcChoice("network", value, label, "dc-when", "When do you need the first capacity?")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {step === "dc-when" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  dcText("when", "dc-who", "Who should we write back to?")
                }}
              >
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="This year, next summer" aria-label="Timing" />
                <button type="submit">Continue</button>
              </form>
            ) : null}
            {step === "dc-who" ? (
              <form
                className="kyc"
                onSubmit={(event) => {
                  event.preventDefault()
                  submitBrief()
                }}
              >
                <label className="field">
                  <span>Name</span>
                  <input required value={who.contact} onChange={(event) => setWho((current) => ({ ...current, contact: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input required type="email" value={who.email} onChange={(event) => setWho((current) => ({ ...current, email: event.target.value }))} />
                </label>
                {formError ? <p className="error">{formError}</p> : null}
                <button type="submit" disabled={busy}>
                  {busy ? "Sending" : "Send brief"}
                </button>
              </form>
            ) : null}
            {step === "dc-done" ? (
              <div className="replies">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    say("you", "Prepare a hardware order")
                    say("guide", "What should we put on the order?")
                    setStep("cover")
                  }}
                >
                  Prepare a hardware order
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <button type="button" className="launcher" onClick={() => setOpen(true)}>
          Guide
        </button>
      )}
    </>
  )
}
