# Stratum Infrastructure

Planning desk for GPU and datacenter component sourcing.

The schema is [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema). A quote is returned only when it validates.

Figures are a November 2026 planning basis, not a live distributor feed, except Configuration 1 and the Giga G894 sheet. Those two bills cite the page each priced line came from. Lines with no public price are marked and left out of the total.

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

Money fields are `sourceUnitPrice`, `sourceLineTotal`, and the `totals` object.

`rackSchema` is the placement drawing: racks, the gear in each one, and 0U notes.
