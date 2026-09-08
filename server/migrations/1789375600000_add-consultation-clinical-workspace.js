export function up(pgm) {
  pgm.addColumns('consultations', {
    notes: { type: 'text', notNull: true, default: '' },
    follow_up_interval: { type: 'integer' },
    follow_up_unit: { type: 'varchar(5)' },
    follow_up_target_at: { type: 'timestamptz' },
  })

  pgm.addConstraint('consultations', 'consultations_notes_length', {
    check: 'char_length(notes) <= 20000',
  })
  pgm.addConstraint('consultations', 'consultations_follow_up_complete', {
    check: `
      (follow_up_interval IS NULL AND follow_up_unit IS NULL AND follow_up_target_at IS NULL)
      OR
      (follow_up_interval BETWEEN 1 AND 365 AND follow_up_unit IN ('days', 'weeks'))
    `,
  })

  pgm.createTable('consultation_prescription_items', {
    id: 'bigserial',
    consultation_id: {
      type: 'bigint',
      notNull: true,
      references: 'consultations',
      onDelete: 'CASCADE',
    },
    position: { type: 'integer', notNull: true },
    medicine_name: { type: 'varchar(200)', notNull: true },
    dosage: { type: 'varchar(120)', notNull: true },
    frequency: { type: 'varchar(120)', notNull: true },
    duration: { type: 'varchar(120)', notNull: true },
    instructions: { type: 'varchar(1000)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, { constraints: { primaryKey: 'id' } })

  pgm.addConstraint('consultation_prescription_items', 'consultation_prescription_position_unique', {
    unique: ['consultation_id', 'position'],
  })
  pgm.addConstraint('consultation_prescription_items', 'consultation_prescription_position_nonnegative', {
    check: 'position >= 0',
  })
  pgm.createIndex('consultation_prescription_items', 'consultation_id')
}

export function down(pgm) {
  pgm.dropTable('consultation_prescription_items')
  pgm.dropConstraint('consultations', 'consultations_follow_up_complete')
  pgm.dropConstraint('consultations', 'consultations_notes_length')
  pgm.dropColumns('consultations', [
    'notes',
    'follow_up_interval',
    'follow_up_unit',
    'follow_up_target_at',
  ])
}
