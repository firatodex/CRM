import { useEffect, useState } from 'react'
import { listClients } from '../api/clients'
import { listContactLogs } from '../api/contactLog'
import { listTasks } from '../api/tasks'
import { listDeals } from '../api/deals'
import { listPayments } from '../api/payments'
import { listPipelineSnapshots } from '../api/pipelineSnapshots'
import { listFinalStepClientIds } from '../api/finalStep'

/**
 * Loads every table the app shows and keeps it in state.
 * Returns the data, its setters (for optimistic updates) and a refetch function per table.
 */
export function useCrmData() {
  const [clients, setClients] = useState([])
  const [contactLogs, setContactLogs] = useState([])
  const [tasks, setTasks] = useState([])
  const [pipelineSnapshots, setPipelineSnapshots] = useState([])
  const [deals, setDeals] = useState([])
  const [payments, setPayments] = useState([])
  const [finalStepIds, setFinalStepIds] = useState([]) // client_ids manually flagged Final Step
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchClients(isCancelled = () => false) {
    setLoading(true)
    setError(null)
    const { data, error, cancelled } = await listClients(isCancelled)
    if (cancelled) return
    if (error) setError(error.message)
    setClients(data)
    setLoading(false)
  }

  async function fetchContactLogs(isCancelled = () => false) {
    const { data, cancelled } = await listContactLogs(isCancelled)
    if (!cancelled) setContactLogs(data)
  }

  async function fetchTasks(isCancelled = () => false) {
    const { data, error } = await listTasks()
    if (isCancelled()) return
    if (error) { setError(`Failed to load tasks: ${error.message}`); return }
    setTasks(data || [])
  }

  async function fetchFinalStepIds(isCancelled = () => false) {
    const { data, error } = await listFinalStepClientIds()
    if (isCancelled()) return
    if (error) { setError(`Failed to load Final Step list: ${error.message}`); return }
    setFinalStepIds((data || []).map(r => r.client_id))
  }

  async function fetchPipelineSnapshots(isCancelled = () => false) {
    const { data, error } = await listPipelineSnapshots()
    if (!isCancelled() && !error && data) setPipelineSnapshots(data)
  }

  async function fetchDeals(isCancelled = () => false) {
    const { data, error } = await listDeals()
    if (!isCancelled() && !error && data) setDeals(data)
  }

  async function fetchPayments(isCancelled = () => false) {
    const { data, error } = await listPayments()
    if (!isCancelled() && !error && data) setPayments(data)
  }

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    fetchClients(isCancelled)
    fetchContactLogs(isCancelled)
    fetchTasks(isCancelled)
    fetchPipelineSnapshots(isCancelled)
    fetchFinalStepIds(isCancelled)
    fetchDeals(isCancelled)
    fetchPayments(isCancelled)
    return () => { cancelled = true }
  }, [])

  return {
    clients, setClients,
    contactLogs, setContactLogs,
    tasks, setTasks,
    pipelineSnapshots, setPipelineSnapshots,
    deals, setDeals,
    payments, setPayments,
    finalStepIds, setFinalStepIds,
    loading, error, setError,
    fetchClients, fetchTasks, fetchFinalStepIds, fetchDeals, fetchPayments,
  }
}
