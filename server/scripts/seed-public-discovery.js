import { closePool, getPool } from '../src/db/pool.js'
import {
  availabilityTemplates,
  doctorSeeds,
  specializationSeeds,
} from '../src/seed/public-discovery-data.js'

const seedAdminEmail = 'seed.admin@medreach.example.test'
const nonLoginSeedHash = '$argon2id$v=19$m=65536,t=3,p=1$ZGV2ZWxvcG1lbnQtc2VlZA$bm90LXVzZWQtZm9yLWxvZ2lu'

function dateInIndia(dayOffset, time) {
  const indiaDateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(indiaDateParts.map(part => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)))
  date.setUTCDate(date.getUTCDate() + dayOffset)

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return new Date(`${year}-${month}-${day}T${time}:00+05:30`)
}

function buildThirtyMinuteSlots(startAt, endAt) {
  const slots = []

  for (
    let slotStart = startAt.getTime();
    slotStart + 30 * 60 * 1000 <= endAt.getTime();
    slotStart += 30 * 60 * 1000
  ) {
    slots.push({
      startAt: new Date(slotStart),
      endAt: new Date(slotStart + 30 * 60 * 1000),
    })
  }

  return slots
}

async function insertUser(client, { fullName, email, role, isEnabled = true }) {
  const result = await client.query(
    `INSERT INTO users (full_name, email, password_hash, role, is_enabled)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [fullName, email, nonLoginSeedHash, role, isEnabled],
  )

  return result.rows[0].id
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed data cannot run in production')
  }

  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const existingSeed = await client.query('SELECT 1 FROM users WHERE email = $1', [seedAdminEmail])

    if (existingSeed.rowCount > 0) {
      await client.query('ROLLBACK')
      console.log('Public discovery seed data already exists. No changes made.')
      return
    }

    const adminId = await insertUser(client, {
      fullName: 'MedReach Development Admin',
      email: seedAdminEmail,
      role: 'admin',
    })

    const specializationIds = new Map()

    for (const specialization of specializationSeeds) {
      const specializationResult = await client.query(
        `INSERT INTO specializations (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [specialization.name],
      )
      const specializationId = specializationResult.rows[0].id
      specializationIds.set(specialization.name, specializationId)

      for (const term of specialization.terms) {
        await client.query(
          `INSERT INTO specialization_search_terms (specialization_id, term)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [specializationId, term],
        )
      }
    }

    let availabilityBlockCount = 0
    let slotCount = 0

    for (const [doctorIndex, doctor] of doctorSeeds.entries()) {
      const doctorId = await insertUser(client, {
        fullName: doctor.fullName,
        email: doctor.email,
        role: 'doctor',
        isEnabled: doctor.isEnabled,
      })

      await client.query(
        `INSERT INTO doctor_profiles (
           user_id, qualification, experience_years, bio, clinic_name,
           clinic_city, clinic_district, default_fee
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          doctorId,
          doctor.qualification,
          doctor.experienceYears,
          doctor.bio,
          doctor.clinicName,
          doctor.clinicCity,
          doctor.clinicDistrict,
          doctor.defaultFee,
        ],
      )

      for (const specializationName of doctor.specializations) {
        await client.query(
          `INSERT INTO doctor_specializations (doctor_id, specialization_id)
           VALUES ($1, $2)`,
          [doctorId, specializationIds.get(specializationName)],
        )
      }

      const isApproved = doctor.verificationStatus === 'approved'
      await client.query(
        `INSERT INTO doctor_verifications (
           doctor_id, registration_number, issuing_authority, status,
           reviewed_by_user_id, reviewed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          doctorId,
          `MR-DEV-${String(doctorIndex + 1).padStart(3, '0')}`,
          'MedReach Development Medical Council',
          doctor.verificationStatus,
          isApproved ? adminId : null,
          isApproved ? new Date() : null,
        ],
      )

      if (!isApproved || !doctor.isEnabled) {
        continue
      }

      for (const template of availabilityTemplates) {
        const shiftedDayOffset = template.dayOffset + (doctorIndex % 3)
        const startAt = dateInIndia(shiftedDayOffset, template.start)
        const endAt = dateInIndia(shiftedDayOffset, template.end)
        const blockResult = await client.query(
          `INSERT INTO availability_blocks (doctor_id, start_at, end_at, effective_fee)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [doctorId, startAt, endAt, doctor.defaultFee],
        )
        const availabilityBlockId = blockResult.rows[0].id
        availabilityBlockCount += 1

        for (const slot of buildThirtyMinuteSlots(startAt, endAt)) {
          await client.query(
            `INSERT INTO slots (availability_block_id, start_at, end_at)
             VALUES ($1, $2, $3)`,
            [availabilityBlockId, slot.startAt, slot.endAt],
          )
          slotCount += 1
        }
      }
    }

    await client.query('COMMIT')
    console.log(
      `Seeded ${doctorSeeds.length} doctors, ${availabilityBlockCount} availability blocks and ${slotCount} slots.`,
    )
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

seed()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(closePool)
