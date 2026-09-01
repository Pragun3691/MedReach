export function up(pgm) {
  pgm.createTable('patient_profiles', {
    user_id: {
      type: 'bigint',
      primaryKey: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    date_of_birth: { type: 'date' },
    gender: { type: 'varchar(30)' },
    city: { type: 'varchar(100)' },
    district: { type: 'varchar(100)' },
    blood_group: { type: 'varchar(10)' },
    allergies: { type: 'text' },
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
  })

  pgm.addConstraint('patient_profiles', 'patient_profiles_date_of_birth_valid', {
    check: "date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01'",
  })
  pgm.addConstraint('patient_profiles', 'patient_profiles_gender_valid', {
    check: "gender IS NULL OR gender IN ('male', 'female', 'non-binary', 'other', 'prefer_not_to_say')",
  })
  pgm.addConstraint('patient_profiles', 'patient_profiles_city_valid', {
    check: "city IS NULL OR btrim(city) <> ''",
  })
  pgm.addConstraint('patient_profiles', 'patient_profiles_district_valid', {
    check: "district IS NULL OR btrim(district) <> ''",
  })
  pgm.addConstraint('patient_profiles', 'patient_profiles_blood_group_valid', {
    check: "blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')",
  })

  pgm.createTable('user_sessions', {
    sid: { type: 'varchar', primaryKey: true },
    sess: { type: 'json', notNull: true },
    expire: { type: 'timestamptz', notNull: true },
  })
  pgm.createIndex('user_sessions', 'expire', {
    name: 'user_sessions_expire_idx',
  })

  pgm.addConstraint('users', 'users_email_normalized', {
    check: 'email = lower(btrim(email))',
  })
}

export function down(pgm) {
  pgm.dropConstraint('users', 'users_email_normalized')
  pgm.dropTable('user_sessions')
  pgm.dropTable('patient_profiles')
}
