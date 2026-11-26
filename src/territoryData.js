import { supabase } from './supabase'

// District of each lead (manual override, else PM Surya Ghar portal data) + market size per district.
// Loaded once per session and shared by the Territory tab and the lead screen.
let cache = null
let inflight = null

export function loadTerritory(force = false) {
  if (cache && !force) return Promise.resolve(cache)
  if (inflight && !force) return inflight
  inflight = Promise.all([
    supabase.rpc('territory_data'),
    fetch('/gujarat-districts.json').then(r => r.json()),
  ]).then(([{ data, error }, map]) => {
    if (error) throw error
    const districtOf = {}
    ;(data?.clients || []).forEach(c => { districtOf[c.id] = { district: c.district, how: c.how, stage: c.stage } })
    const market = {}
    ;(data?.districts || []).forEach(d => { market[d.district] = { vendors: Number(d.vendors) || 0, installs: Number(d.installs) || 0 } })
    cache = { districtOf, market, map, snapshotDate: data?.snapshot_date }
    inflight = null
    return cache
  }).catch(e => { inflight = null; throw e })
  return inflight
}

export const GUJARAT_DISTRICTS = [
  'Ahmedabad', 'Amreli', 'Anand', 'Arvalli', 'Banas Kantha', 'Bharuch', 'Bhavnagar', 'Botad', 'Chhotaudepur',
  'Dahod', 'Dangs', 'Devbhoomi Dwarka', 'Gandhinagar', 'Gir Somnath', 'Jamnagar', 'Junagadh', 'Kachchh', 'Kheda',
  'Mahesana', 'Mahisagar', 'Morbi', 'Narmada', 'Navsari', 'Panch Mahals', 'Patan', 'Porbandar', 'Rajkot',
  'Sabar Kantha', 'Surat', 'Surendranagar', 'Tapi', 'Vadodara', 'Valsad',
]

/** District for a client: manual value on the record wins, otherwise the portal match. */
export function districtFor(client, territory) {
  if (client?.district) return client.district
  return territory?.districtOf?.[client?.id]?.district || null
}
