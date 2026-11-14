import { useState } from "react"
import { App } from "./App"
import { emptyDraft, type Draft } from "./draft"
import { Front } from "./Front"

export function Root() {
  const [access, setAccess] = useState(() => sessionStorage.getItem("stratum-access") || "")
  const [view, setView] = useState<"front" | "desk">("front")
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  if (view === "desk" && access) {
    return <App access={access} draft={draft} onFront={() => setView("front")} />
  }

  return (
    <Front
      draft={draft}
      onDraft={setDraft}
      access={access}
      onDesk={() => access && setView("desk")}
      onUnlocked={(token) => {
        sessionStorage.setItem("stratum-access", token)
        setAccess(token)
        setView("desk")
      }}
    />
  )
}
