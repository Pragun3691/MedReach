import { describe, expect, it, vi } from 'vitest'
import {
  AppointmentDataError,
  createAppointmentRepository,
} from '../src/data-access/appointment.repository.js'

const validSlot = {
  id: 101,
  start_at: '2030-01-01T09:00:00.000Z',
  end_at: '2030-01-01T09:30:00.000Z',
  is_active: true,
  is_future: true,
  doctor_id: 10,
  effective_fee: '700.00',
  default_fee: '650.00',
  doctor_name: 'Dr. Aditi Sharma',
  doctor_is_enabled: true,
  verification_status: 'approved',
  is_booked: false,
}

const appointmentRow = {
  id: 1000,
  patient_id: 1,
  slot_id: 101,
  status: 'booked',
  fee_snapshot: '700.00',
  patient_name: 'Ananya Rao',
  doctor_id: 10,
  doctor_name: 'Dr. Aditi Sharma',
  start_at: validSlot.start_at,
  end_at: validSlot.end_at,
  specializations: [{ id: 1, name: 'General Medicine' }],
  created_at: '2029-12-01T09:00:00.000Z',
  updated_at: '2029-12-01T09:00:00.000Z',
}

function databaseWith(query) {
  const client = { query, release: vi.fn() }
  return { client, database: { connect: vi.fn().mockResolvedValue(client) } }
}

describe('appointment repository transactions', () => {
  it('locks scheduling records, inserts notifications and commits a booking', async () => {
    const statements = []
    const { client, database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql.includes('FROM slots s')) return { rows: [validSlot] }
      if (sql.includes('INSERT INTO appointments')) return { rows: [{ id: 1000 }] }
      if (sql.includes('INSERT INTO notifications')) return { rows: [] }
      if (sql.includes('FROM appointments a')) return { rows: [appointmentRow] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    const result = await repository.book({ patientId: 1, patientName: 'Ananya Rao', slotId: 101 })

    expect(result).toEqual(appointmentRow)
    expect(statements[0]).toBe('BEGIN')
    expect(statements.some(sql => sql.includes('FOR UPDATE OF s, ab, dp, doctor_user, verification'))).toBe(true)
    expect(statements.filter(sql => sql.includes('INSERT INTO notifications'))).toHaveLength(2)
    expect(statements.at(-1)).toBe('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back and maps the database unique constraint to SLOT_UNAVAILABLE', async () => {
    const statements = []
    const uniqueError = Object.assign(new Error('unique violation'), {
      code: '23505',
      constraint: 'appointments_booked_slot_unique',
    })
    const { client, database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FROM slots s')) return { rows: [validSlot] }
      if (sql.includes('INSERT INTO appointments')) throw uniqueError
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    await expect(repository.book({ patientId: 1, patientName: 'Ananya Rao', slotId: 101 }))
      .rejects.toMatchObject({ name: 'AppointmentDataError', code: 'SLOT_UNAVAILABLE' })
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back a reschedule before changing the old appointment when the new slot fails validation', async () => {
    const statements = []
    const lockedAppointment = {
      id: 1000,
      patient_id: 1,
      slot_id: 101,
      status: 'booked',
      is_future: true,
      doctor_id: 10,
      patient_name: 'Ananya Rao',
      doctor_name: 'Dr. Aditi Sharma',
    }
    const { database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FROM appointments a') && sql.includes('FOR UPDATE OF a')) return { rows: [lockedAppointment] }
      if (sql.includes('FROM slots s')) return { rows: [{ ...validSlot, id: 103, is_active: false }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    await expect(repository.reschedule({ appointmentId: 1000, patientId: 1, slotId: 103 }))
      .rejects.toBeInstanceOf(AppointmentDataError)
    expect(statements).toContain('ROLLBACK')
    expect(statements.some(sql => sql.includes("SET status = 'rescheduled'"))).toBe(false)
  })
})
