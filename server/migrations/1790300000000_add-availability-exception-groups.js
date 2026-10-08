export function up(pgm) {
  pgm.addColumn('availability_exceptions', {
    exception_group_id: { type: 'uuid' },
  })

  pgm.addConstraint(
    'availability_exceptions',
    'availability_exceptions_group_all_day',
    {
      check: 'exception_group_id IS NULL OR all_day = TRUE',
    },
  )

  pgm.createIndex('availability_exceptions', ['doctor_id', 'exception_group_id'], {
    name: 'availability_exceptions_doctor_group_idx',
    where: 'exception_group_id IS NOT NULL',
  })
}

export function down(pgm) {
  pgm.dropIndex('availability_exceptions', ['doctor_id', 'exception_group_id'], {
    name: 'availability_exceptions_doctor_group_idx',
  })
  pgm.dropConstraint(
    'availability_exceptions',
    'availability_exceptions_group_all_day',
  )
  pgm.dropColumn('availability_exceptions', 'exception_group_id')
}
