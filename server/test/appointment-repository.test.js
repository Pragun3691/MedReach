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
      start_at: validSlot.start_at,
      end_at: validSlot.end_at,
      doctor_id: 10,
      patient_name: 'Ananya Rao',
      doctor_name: 'Dr. Aditi Sharma',
    }
    const { database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FROM appointments a') && sql.includes('FOR UPDATE OF a')) return { rows: [lockedAppointment] }
      if (sql.includes('FROM consultations')) return { rows: [] }
      if (sql.includes('FROM slots s')) return { rows: [{ ...validSlot, id: 103, is_active: false }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    await expect(repository.reschedule({ appointmentId: 1000, patientId: 1, slotId: 103 }))
      .rejects.toBeInstanceOf(AppointmentDataError)
    expect(statements).toContain('ROLLBACK')
    expect(statements.some(sql => sql.includes("SET status = 'rescheduled'"))).toBe(false)
  })

  it('allows an assigned Doctor to cancel an unresolved booking after the slot ends', async () => {
    const statements = []
    const cancelled = { ...appointmentRow, status: 'cancelled' }
    const { database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql.includes('FOR UPDATE OF a')) return { rows: [appointmentRow] }
      if (sql.includes('FROM consultations')) return { rows: [] }
      if (sql.includes("SET status = 'cancelled'")) return { rows: [] }
      if (sql.includes('UPDATE slots SET is_active = FALSE')) return { rows: [] }
      if (sql.includes('INSERT INTO notifications')) return { rows: [] }
      if (sql.includes('FROM appointments a')) return { rows: [cancelled] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    const result = await repository.cancel({
      appointmentId: 1000,
      actorId: 10,
      actorRole: 'doctor',
      reason: 'Emergency',
      now: new Date('2030-01-01T10:00:00.000Z'),
    })

    expect(result.status).toBe('cancelled')
    expect(statements.some(sql => sql.includes('FOR UPDATE OF a'))).toBe(true)
    expect(statements.some(sql => sql.includes('INSERT INTO notifications'))).toBe(true)
    expect(statements.at(-1)).toBe('COMMIT')
  })

  it('locks the appointment and preserves the first Ready timestamp', async () => {
    const statements = []
    const { database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql.includes('FOR UPDATE OF a')) return { rows: [appointmentRow] }
      if (sql.includes('FROM consultations')) return { rows: [] }
      if (sql.includes('SET ready_at = COALESCE')) return { rows: [] }
      if (sql.includes('FROM appointments a')) return { rows: [{ ...appointmentRow, ready_at: '2030-01-01T08:45:00.000Z' }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    await repository.markReady({ appointmentId: 1000, patientId: 1, now: new Date('2030-01-01T08:45:00.000Z') })

    expect(statements.some(sql => sql.includes('FOR UPDATE OF a, s, ab'))).toBe(true)
    expect(statements.some(sql => sql.includes('ready_at = COALESCE(ready_at, $2)'))).toBe(true)
    expect(statements.at(-1)).toBe('COMMIT')
  })

  it('creates a Consultation only after locking the appointment', async () => {
    const statements = []
    const locked = { ...appointmentRow, room_opened_at: '2030-01-01T08:55:00.000Z' }
    const begun = { ...locked, consultation_id: 44, consultation_started_at: '2030-01-01T08:55:00.000Z' }
    const { database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql.includes('FOR UPDATE OF a')) return { rows: [locked] }
      if (sql.includes('FROM consultations')) return { rows: [] }
      if (sql.includes('INSERT INTO consultations')) return { rows: [] }
      if (sql.includes('FROM appointments a')) return { rows: [begun] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    const result = await repository.beginConsultation({ appointmentId: 1000, doctorId: 10, now: new Date('2030-01-01T08:55:00.000Z') })

    expect(result.consultation_id).toBe(44)
    expect(statements.indexOf('BEGIN')).toBeLessThan(statements.findIndex(sql => sql.includes('INSERT INTO consultations')))
    expect(statements.findIndex(sql => sql.includes('FOR UPDATE OF a'))).toBeLessThan(statements.findIndex(sql => sql.includes('INSERT INTO consultations')))
  })

  it('records no-show and its Patient notification in one transaction', async () => {
    const statements = []
    const resolved = { ...appointmentRow, status: 'no_show', no_show_marked_at: '2030-01-01T09:15:00.000Z' }
    const { database } = databaseWith(vi.fn(async (sql, parameters) => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] }
      if (sql.includes('FOR UPDATE OF a')) return { rows: [appointmentRow] }
      if (sql.includes('FROM consultations')) return { rows: [] }
      if (sql.includes("SET status = 'no_show'")) return { rows: [] }
      if (sql.includes('INSERT INTO notifications')) {
        expect(parameters[0]).toBe(1)
        expect(parameters[1]).toBe('appointment_no_show')
        expect(parameters[2]).toContain('Dr. Aditi Sharma')
        return { rows: [] }
      }
      if (sql.includes('FROM appointments a')) return { rows: [resolved] }
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    await repository.markNoShow({ appointmentId: 1000, doctorId: 10, now: new Date('2030-01-01T09:15:00.000Z') })

    expect(statements.some(sql => sql.includes('INSERT INTO consultations'))).toBe(false)
    expect(statements.filter(sql => sql.includes('INSERT INTO notifications'))).toHaveLength(1)
    expect(statements.at(-1)).toBe('COMMIT')
  })

  it('finishes Consultation and appointment atomically and rolls back on failure', async () => {
    const statements = []
    const failure = new Error('appointment update failed')
    const activeConsultation = { id: 44, appointment_id: 1000, started_at: '2030-01-01T08:55:00.000Z', finished_at: null }
    const { database } = databaseWith(vi.fn(async sql => {
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('FOR UPDATE OF a')) return { rows: [appointmentRow] }
      if (sql.includes('FROM consultations')) return { rows: [activeConsultation] }
      if (sql.includes('UPDATE consultations')) return { rows: [] }
      if (sql.includes("SET status = 'completed'")) throw failure
      throw new Error(`Unexpected SQL: ${sql}`)
    }))
    const repository = createAppointmentRepository(() => database)

    await expect(repository.finishConsultation({ appointmentId: 1000, doctorId: 10, now: new Date('2030-01-01T10:00:00.000Z') }))
      .rejects.toBe(failure)
    expect(statements.some(sql => sql.includes('UPDATE consultations'))).toBe(true)
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
  })
})
