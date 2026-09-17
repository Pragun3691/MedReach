const timestamps = {
  created_at: {
    type: 'timestamptz',
    notNull: true,
    default: pgm => pgm.func('current_timestamp'),
  },
  updated_at: {
    type: 'timestamptz',
    notNull: true,
    default: pgm => pgm.func('current_timestamp'),
  },
}

export function up(pgm) {
  const timestampColumns = Object.fromEntries(
    Object.entries(timestamps).map(([name, definition]) => [
      name,
      {
        ...definition,
        default: definition.default(pgm),
      },
    ]),
  )

  pgm.createTable('recurring_availability_rules', {
    id: 'bigserial',
    doctor_id: {
      type: 'bigint',
      notNull: true,
      references: 'doctor_profiles(user_id)',
      onDelete: 'RESTRICT',
    },
    weekdays: { type: 'smallint[]', notNull: true },
    start_time: { type: 'time', notNull: true },
    end_time: { type: 'time', notNull: true },
    starts_on: { type: 'date', notNull: true },
    ends_on: { type: 'date' },
    effective_fee: { type: 'numeric(10,2)' },
    status: { type: 'varchar(20)', notNull: true, default: 'active' },
    materialized_through: { type: 'date' },
    ...timestampColumns,
  }, {
    constraints: {
      primaryKey: 'id',
    },
  })

  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_status_valid', {
    check: "status IN ('active', 'stopped')",
  })
  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_time_valid', {
    check: 'start_time < end_time',
  })
  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_half_hour_aligned', {
    check: `
      EXTRACT(MINUTE FROM start_time) IN (0, 30)
      AND EXTRACT(SECOND FROM start_time) = 0
      AND EXTRACT(MINUTE FROM end_time) IN (0, 30)
      AND EXTRACT(SECOND FROM end_time) = 0
    `,
  })
  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_fee_nonnegative', {
    check: 'effective_fee IS NULL OR effective_fee >= 0',
  })
  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_date_range_valid', {
    check: 'ends_on IS NULL OR ends_on >= starts_on',
  })
  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_weekdays_nonempty', {
    check: 'cardinality(weekdays) > 0',
  })
  pgm.addConstraint('recurring_availability_rules', 'recurring_availability_rules_weekdays_iso', {
    check: `
      array_position(weekdays, NULL) IS NULL
      AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
    `,
  })

  pgm.addColumn('availability_blocks', {
    recurring_rule_id: { type: 'bigint' },
  })
  pgm.addConstraint('availability_blocks', 'availability_blocks_recurring_rule_fk', {
    foreignKeys: {
      columns: 'recurring_rule_id',
      references: 'recurring_availability_rules(id)',
      onDelete: 'RESTRICT',
    },
  })
  pgm.createIndex('availability_blocks', ['recurring_rule_id', 'start_at'], {
    name: 'availability_blocks_recurring_rule_start_unique',
    unique: true,
    where: 'recurring_rule_id IS NOT NULL',
  })
}

export function down(pgm) {
  pgm.dropIndex('availability_blocks', ['recurring_rule_id', 'start_at'], {
    name: 'availability_blocks_recurring_rule_start_unique',
  })
  pgm.dropConstraint('availability_blocks', 'availability_blocks_recurring_rule_fk')
  pgm.dropColumn('availability_blocks', 'recurring_rule_id')
  pgm.dropTable('recurring_availability_rules')
}
