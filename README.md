# Busbar

Planning desk for GPU and datacenter component sourcing.

Quotes use a **source price**, which is list plus 20%. List is not stored in this repository, not shown in the desk, and not present on the quote schema. The schema is [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema). A quote is returned only when it validates.

Figures are a November 2026 planning basis, not a live distributor feed, except Configuration 1 and the Giga G894 sheet. Those two bills cite the page each priced line came from. The number on the desk is still 20% above the posted figure, and that posted figure is not shown. Lines with no public price are marked and left out of the total.

## Run

```bash
npm install
npm test
npm run dev
```

The desk is at `http://127.0.0.1:5173`. The API and health check listen on port 3000.

```bash
npm run build
npm start
```

`GET /health` returns `{ "ok": true }`.

## Quote schema

`GET /schema/sourcing-quote.json`

Money fields are `sourceUnitPrice`, `sourceLineTotal`, and the `totals` object. There is no list or retail property. `pricingPolicy.listMarkupPercent` is `20` and `listPriceIncluded` is `false`.

`rackSchema` is the placement drawing: racks, the gear in each one, and 0U notes.
