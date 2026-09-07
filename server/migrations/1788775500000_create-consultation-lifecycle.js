export function up(pgm) {
  pgm.addColumn('appointments', {
    room_opened_at: { type: 'timestamptz' },
  })

  pgm.createTable('consultations', {
    id: 'bigserial',
    appointment_id: {
      type: 'bigint',
      notNull: true,
      references: 'appointments',
      onDelete: 'RESTRICT',
    },
    started_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    finished_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, {
    constraints: { primaryKey: 'id' },
  })

  pgm.addConstraint('consultations', 'consultations_one_per_appointment', {
    unique: ['appointment_id'],
  })
  pgm.addConstraint('consultations', 'consultations_finish_after_start', {
    check: 'finished_at IS NULL OR finished_at >= started_at',
  })
}

export function down(pgm) {
  pgm.dropTable('consultations')
  pgm.dropColumn('appointments', 'room_opened_at')
}
