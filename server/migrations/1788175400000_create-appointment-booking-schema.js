export function up(pgm) {
  pgm.createTable('appointments', {
    id: 'bigserial',
    patient_id: {
      type: 'bigint',
      notNull: true,
      references: 'patient_profiles(user_id)',
      onDelete: 'RESTRICT',
    },
    slot_id: {
      type: 'bigint',
      notNull: true,
      references: 'slots',
      onDelete: 'RESTRICT',
    },
    rescheduled_from_appointment_id: {
      type: 'bigint',
      references: 'appointments',
      onDelete: 'RESTRICT',
    },
    status: { type: 'varchar(20)', notNull: true, default: 'booked' },
    fee_snapshot: { type: 'numeric(10,2)' },
    cancelled_by_user_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'RESTRICT',
    },
    cancellation_reason: { type: 'text' },
    cancelled_at: { type: 'timestamptz' },
    ready_at: { type: 'timestamptz' },
    no_show_marked_at: { type: 'timestamptz' },
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
    constraints: {
      primaryKey: 'id',
    },
  })

  pgm.addConstraint('appointments', 'appointments_status_valid', {
    check: "status IN ('booked', 'completed', 'cancelled', 'no_show', 'rescheduled')",
  })
  pgm.addConstraint('appointments', 'appointments_fee_nonnegative', {
    check: 'fee_snapshot IS NULL OR fee_snapshot >= 0',
  })
  pgm.addConstraint('appointments', 'appointments_cancellation_metadata_valid', {
    check: `
      (status = 'cancelled' AND cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL)
      OR
      (status <> 'cancelled' AND cancelled_by_user_id IS NULL AND cancellation_reason IS NULL AND cancelled_at IS NULL)
    `,
  })
  pgm.addConstraint('appointments', 'appointments_not_self_rescheduled', {
    check: 'rescheduled_from_appointment_id IS NULL OR rescheduled_from_appointment_id <> id',
  })

  pgm.createIndex('appointments', ['patient_id', 'status'], {
    name: 'appointments_patient_status_idx',
  })
  pgm.createIndex('appointments', ['slot_id', 'status'], {
    name: 'appointments_slot_status_idx',
  })
  pgm.createIndex('appointments', 'slot_id', {
    name: 'appointments_booked_slot_unique',
    unique: true,
    where: "status = 'booked'",
  })
  pgm.createIndex('appointments', 'rescheduled_from_appointment_id', {
    name: 'appointments_reschedule_replacement_unique',
    unique: true,
    where: 'rescheduled_from_appointment_id IS NOT NULL',
  })

  pgm.createTable('notifications', {
    id: 'bigserial',
    recipient_user_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    type: { type: 'varchar(50)', notNull: true },
    message: { type: 'text', notNull: true },
    is_read: { type: 'boolean', notNull: true, default: false },
    action_path: { type: 'varchar(500)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, {
    constraints: {
      primaryKey: 'id',
    },
  })

  pgm.addConstraint('notifications', 'notifications_type_valid', {
    check: "btrim(type) <> ''",
  })
  pgm.addConstraint('notifications', 'notifications_message_valid', {
    check: "btrim(message) <> ''",
  })
  pgm.addConstraint('notifications', 'notifications_action_path_internal', {
    check: "action_path IS NULL OR (action_path LIKE '/%' AND action_path NOT LIKE '//%' AND position(chr(92) in action_path) = 0)",
  })
  pgm.createIndex('notifications', ['recipient_user_id', 'is_read', { name: 'created_at', sort: 'DESC' }], {
    name: 'notifications_recipient_read_created_idx',
  })
}

export function down(pgm) {
  pgm.dropTable('notifications')
  pgm.dropTable('appointments')
}
