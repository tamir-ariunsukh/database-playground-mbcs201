// Turbopack/ESM дэх import дарааллыг шалгана
const t0 = Date.now()
await import("mingo/init/system")
console.log("init/system loaded in", Date.now()-t0, "ms")

const m = await import("mingo")
console.log("exports:", Object.keys(m).join(", "))

const data = [{ a: 1, b: 10 }, { a: 2, b: 20 }, { a: 1, b: 30 }]
try {
  const r = m.aggregate(data, [
    { $group: { _id: "$a", total: { $sum: "$b" }, n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  console.log("OK:", JSON.stringify(r))
} catch (e) { console.log("ERR:", e.message) }
