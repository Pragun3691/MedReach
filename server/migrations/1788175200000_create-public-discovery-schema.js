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

  pgm.createTable('users', {
    id: 'bigserial',
    full_name: { type: 'varchar(120)', notNull: true },
    email: { type: 'varchar(254)', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'varchar(20)', notNull: true },
    is_enabled: { type: 'boolean', notNull: true, default: true },
    ...timestampColumns,
  }, {
    constraints: {
      primaryKey: 'id',
      check: "role IN ('patient', 'doctor', 'admin')",
    },
  })

  pgm.createTable('doctor_profiles', {
    user_id: {
      type: 'bigint',
      primaryKey: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    qualification: { type: 'text', notNull: true },
    experience_years: { type: 'integer', notNull: true, default: 0 },
    bio: { type: 'text' },
    clinic_name: { type: 'varchar(160)' },
    clinic_city: { type: 'varchar(100)' },
    clinic_district: { type: 'varchar(100)' },
    default_fee: { type: 'numeric(10,2)' },
    ...timestampColumns,
  })

  pgm.addConstraint('doctor_profiles', 'doctor_profiles_experience_nonnegative', {
    check: 'experience_years >= 0',
  })
  pgm.addConstraint('doctor_profiles', 'doctor_profiles_default_fee_nonnegative', {
    check: 'default_fee IS NULL OR default_fee >= 0',
  })

  pgm.createTable('specializations', {
    id: 'bigserial',
    name: { type: 'varchar(100)', notNull: true, unique: true },
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

  pgm.createTable('doctor_specializations', {
    doctor_id: {
      type: 'bigint',
      notNull: true,
      references: 'doctor_profiles',
      onDelete: 'CASCADE',
    },
    specialization_id: {
      type: 'bigint',
      notNull: true,
      references: 'specializations',
      onDelete: 'RESTRICT',
    },
  })
  pgm.addConstraint('doctor_specializations', 'doctor_specializations_pkey', {
    primaryKey: ['doctor_id', 'specialization_id'],
  })
  pgm.createIndex('doctor_specializations', ['specialization_id', 'doctor_id'], {
    name: 'doctor_specializations_specialization_doctor_idx',
  })

  pgm.createTable('specialization_search_terms', {
    specialization_id: {
      type: 'bigint',
      notNull: true,
      references: 'specializations',
      onDelete: 'CASCADE',
    },
    term: { type: 'varchar(100)', notNull: true },
  })
  pgm.addConstraint('specialization_search_terms', 'specialization_search_terms_pkey', {
    primaryKey: ['specialization_id', 'term'],
  })
  pgm.addConstraint('specialization_search_terms', 'specialization_search_terms_normalized', {
    check: 'term = lower(btrim(term))',
  })
  pgm.createIndex('specialization_search_terms', 'term', {
    name: 'specialization_search_terms_term_idx',
  })

  pgm.createTable('doctor_verifications', {
    id: 'bigserial',
    doctor_id: {
      type: 'bigint',
      notNull: true,
      unique: true,
      references: 'doctor_profiles',
      onDelete: 'CASCADE',
    },
    registration_number: { type: 'varchar(100)', notNull: true },
    issuing_authority: { type: 'varchar(160)', notNull: true },
    status: { type: 'varchar(20)', notNull: true, default: 'pending' },
    rejection_reason: { type: 'text' },
    submitted_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    reviewed_by_user_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'RESTRICT',
    },
    reviewed_at: { type: 'timestamptz' },
    ...timestampColumns,
  }, {
    constraints: {
      primaryKey: 'id',
      unique: ['issuing_authority', 'registration_number'],
    },
  })

  pgm.addConstraint('doctor_verifications', 'doctor_verifications_status_valid', {
    check: "status IN ('pending', 'approved', 'rejected')",
  })
  pgm.addConstraint('doctor_verifications', 'doctor_verifications_rejection_reason_valid', {
    check: "(status = 'rejected' AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '') OR (status <> 'rejected' AND rejection_reason IS NULL)",
  })
  pgm.addConstraint('doctor_verifications', 'doctor_verifications_review_metadata_valid', {
    check: "(status = 'pending') OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)",
  })
  pgm.createIndex('doctor_verifications', ['status', 'submitted_at'], {
    name: 'doctor_verifications_status_submitted_idx',
  })

  pgm.createTable('availability_blocks', {
    id: 'bigserial',
    doctor_id: {
      type: 'bigint',
      notNull: true,
      references: 'doctor_profiles',
      onDelete: 'RESTRICT',
    },
    start_at: { type: 'timestamptz', notNull: true },
    end_at: { type: 'timestamptz', notNull: true },
    effective_fee: { type: 'numeric(10,2)' },
    ...timestampColumns,
  }, {
    constraints: {
      primaryKey: 'id',
    },
  })

  pgm.addConstraint('availability_blocks', 'availability_blocks_time_valid', {
    check: 'start_at < end_at',
  })
  pgm.addConstraint('availability_blocks', 'availability_blocks_fee_nonnegative', {
    check: 'effective_fee IS NULL OR effective_fee >= 0',
  })
  pgm.createIndex('availability_blocks', ['doctor_id', 'start_at'], {
    name: 'availability_blocks_doctor_start_idx',
  })

  pgm.createTable('slots', {
    id: 'bigserial',
    availability_block_id: {
      type: 'bigint',
      notNull: true,
      references: 'availability_blocks',
      onDelete: 'RESTRICT',
    },
    start_at: { type: 'timestamptz', notNull: true },
    end_at: { type: 'timestamptz', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  }, {
    constraints: {
      primaryKey: 'id',
      unique: ['availability_block_id', 'start_at'],
    },
  })

  pgm.addConstraint('slots', 'slots_exactly_thirty_minutes', {
    check: "end_at = start_at + interval '30 minutes'",
  })
  pgm.createIndex('slots', ['availability_block_id', 'start_at'], {
    name: 'slots_block_start_idx',
  })
}

export function down(pgm) {
  pgm.dropTable('slots')
  pgm.dropTable('availability_blocks')
  pgm.dropTable('doctor_verifications')
  pgm.dropTable('specialization_search_terms')
  pgm.dropTable('doctor_specializations')
  pgm.dropTable('specializations')
  pgm.dropTable('doctor_profiles')
  pgm.dropTable('users')
}
