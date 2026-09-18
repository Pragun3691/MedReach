export function up(pgm) {
  pgm.createTable('availability_exceptions', {
    id: 'bigserial',
    doctor_id: {
      type: 'bigint',
      notNull: true,
      references: 'doctor_profiles(user_id)',
      onDelete: 'RESTRICT',
    },
    exception_date: { type: 'date', notNull: true },
    all_day: { type: 'boolean', notNull: true, default: false },
    start_time: { type: 'time' },
    end_time: { type: 'time' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    removed_at: { type: 'timestamptz' },
  }, {
    constraints: {
      primaryKey: 'id',
    },
  })

  pgm.addConstraint('availability_exceptions', 'availability_exceptions_shape_valid', {
    check: `
      (
        all_day = TRUE
        AND start_time IS NULL
        AND end_time IS NULL
      )
      OR
      (
        all_day = FALSE
        AND start_time IS NOT NULL
        AND end_time IS NOT NULL
        AND start_time < end_time
      )
    `,
  })
  pgm.addConstraint('availability_exceptions', 'availability_exceptions_half_hour_aligned', {
    check: `
      all_day = TRUE
      OR
      (
        EXTRACT(MINUTE FROM start_time) IN (0, 30)
        AND EXTRACT(SECOND FROM start_time) = 0
        AND EXTRACT(MINUTE FROM end_time) IN (0, 30)
        AND EXTRACT(SECOND FROM end_time) = 0
      )
    `,
  })

  pgm.createIndex('availability_exceptions', ['doctor_id', 'exception_date'], {
    name: 'availability_exceptions_active_doctor_date_idx',
    where: 'removed_at IS NULL',
  })
  pgm.createIndex('availability_exceptions', ['doctor_id', 'exception_date'], {
    name: 'availability_exceptions_active_all_day_unique',
    unique: true,
    where: 'removed_at IS NULL AND all_day = TRUE',
  })
  pgm.createIndex(
    'availability_exceptions',
    ['doctor_id', 'exception_date', 'start_time', 'end_time'],
    {
      name: 'availability_exceptions_active_partial_unique',
      unique: true,
      where: 'removed_at IS NULL AND all_day = FALSE',
    },
  )
}

export function down(pgm) {
  pgm.dropTable('availability_exceptions')
}
