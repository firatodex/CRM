// Supabase returns at most 1000 rows per request, so large tables are read in pages.
// `buildQuery()` must return a fresh, ordered query each time it is called.
// Returns { data, error, cancelled }.
export async function fetchAllPages(buildQuery, { batchSize = 1000, isCancelled = () => false } = {}) {
  let rows = []
  let from = 0
  while (true) {
    if (isCancelled()) return { data: rows, error: null, cancelled: true }
    const { data, error } = await buildQuery().range(from, from + batchSize - 1)
    if (isCancelled()) return { data: rows, error: null, cancelled: true }
    if (error) return { data: rows, error, cancelled: false }
    if (!data || data.length === 0) break
    rows = [...rows, ...data]
    if (data.length < batchSize) break
    from += batchSize
  }
  return { data: rows, error: null, cancelled: false }
}
