// Run by the migration runner in a transaction. The insert is independently
// idempotent so it can also repair missing rows without touching existing ones.
export const backfillDoctorVerificationsSql = `
  INSERT INTO doctor_verifications (
    doctor_id, registration_number, issuing_authority, status, submitted_at
  )
  SELECT profile.user_id, NULL, NULL, 'missing_credentials', NULL
  FROM doctor_profiles profile
  JOIN users doctor ON doctor.id = profile.user_id AND doctor.role = 'doctor'
  LEFT JOIN doctor_verifications existing ON existing.doctor_id = profile.user_id
  WHERE existing.id IS NULL
  ON CONFLICT (doctor_id) DO NOTHING
`

export function up(pgm) {
  pgm.sql(`
    ALTER TABLE doctor_verifications
      ALTER COLUMN registration_number DROP NOT NULL,
      ALTER COLUMN issuing_authority DROP NOT NULL,
      ALTER COLUMN submitted_at DROP NOT NULL,
      ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
    ALTER TABLE doctor_verifications DROP CONSTRAINT doctor_verifications_status_valid;
    ALTER TABLE doctor_verifications ADD CONSTRAINT doctor_verifications_status_valid
      CHECK (status IN ('missing_credentials', 'pending', 'approved', 'rejected'));
    ALTER TABLE doctor_verifications DROP CONSTRAINT doctor_verifications_review_metadata_valid;
    ALTER TABLE doctor_verifications ADD CONSTRAINT doctor_verifications_review_metadata_valid
      CHECK (status IN ('pending', 'missing_credentials') OR
        (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL));
    -- NOT VALID preserves pre-existing reviewed records, even malformed legacy
    -- data. PostgreSQL still enforces this check on every new/updated row.
    ALTER TABLE doctor_verifications ADD CONSTRAINT doctor_verifications_credentials_valid
      CHECK (
        (status = 'missing_credentials' AND registration_number IS NULL
          AND issuing_authority IS NULL AND submitted_at IS NULL
          AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
        OR (status <> 'missing_credentials' AND registration_number IS NOT NULL
          AND length(btrim(registration_number)) >= 2 AND issuing_authority IS NOT NULL
          AND length(btrim(issuing_authority)) >= 2 AND submitted_at IS NOT NULL)
      ) NOT VALID;
  `)
  pgm.sql(backfillDoctorVerificationsSql)
  pgm.sql(`
    CREATE TABLE doctor_verification_reviews (
      id bigserial PRIMARY KEY,
      verification_id bigint NOT NULL REFERENCES doctor_verifications(id) ON DELETE RESTRICT,
      submission_version integer NOT NULL,
      decision varchar(20) NOT NULL CHECK (decision IN ('approved', 'rejected')),
      registration_number varchar(100) NOT NULL,
      issuing_authority varchar(160) NOT NULL,
      reason text,
      reviewed_by_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reviewed_at timestamptz NOT NULL DEFAULT current_timestamp,
      UNIQUE (verification_id, submission_version),
      CHECK ((decision = 'rejected' AND reason IS NOT NULL AND btrim(reason) <> '')
        OR (decision = 'approved' AND reason IS NULL))
    );
  `)
}

export function down() {
  throw new Error('Doctor verification migration is forward-only: preserve credentials and review history; use a corrective forward migration.')
}
