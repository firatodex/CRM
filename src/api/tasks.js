import { supabase } from '../supabase'

export function listTasks() {
  return supabase.from('tasks').select('*').order('due_date', { ascending: true })
}

export function insertTask(row) {
  return supabase.from('tasks').insert(row).select().single()
}

export function markTaskDone(taskId) {
  return supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', taskId)
}

export function rescheduleTask(taskId, dueDate, dueTime) {
  return supabase.from('tasks').update({ due_date: dueDate, due_time: dueTime }).eq('id', taskId).select().single()
}
