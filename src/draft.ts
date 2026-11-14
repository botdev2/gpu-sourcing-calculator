export type TokenAsk = {
  amount: string
  period: "day" | "month" | "quarter" | "year"
  use: string
}

export type OrderLine = {
  id: string
  name: string
  qty: number
}

export type Draft = {
  lines: OrderLine[]
  tokens: TokenAsk | null
}

export const emptyDraft: Draft = { lines: [], tokens: null }
