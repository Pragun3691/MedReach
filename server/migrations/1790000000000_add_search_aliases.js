import { escapeValue } from 'node-pg-migrate'

const aliases = [
  ['General Medicine', 'bukhar'],
  ['General Medicine', 'general physician'],
  ['General Medicine', 'khansi'],
  ['General Medicine', 'physician'],
  ['General Medicine', 'sir dard'],
  ['General Medicine', 'खांसी'],
  ['General Medicine', 'बुखार'],
  ['General Medicine', 'सिरदर्द'],
  ['Dermatology', 'daane'],
  ['Dermatology', 'dermatologist'],
  ['Dermatology', 'khujli'],
  ['Dermatology', 'skin doctor'],
  ['Dermatology', 'skin specialist'],
  ['Dermatology', 'twacha'],
  ['Dermatology', 'खुजली'],
  ['Dermatology', 'त्वचा'],
  ['Dermatology', 'दाने'],
  ['Cardiology', 'cardiologist'],
  ['Cardiology', 'dil'],
  ['Cardiology', 'heart doctor'],
  ['Cardiology', 'heart specialist'],
  ['Cardiology', 'hriday'],
  ['Cardiology', 'दिल'],
  ['Cardiology', 'हृदय'],
  ['Pediatrics', 'bachchon ka doctor'],
  ['Pediatrics', 'bal rog'],
  ['Pediatrics', 'child doctor'],
  ['Pediatrics', 'paediatrician'],
  ['Pediatrics', 'pediatrician'],
  ['Pediatrics', 'बाल रोग'],
  ['Psychiatry', 'chinta'],
  ['Psychiatry', 'mansik swasthya'],
  ['Psychiatry', 'mental health doctor'],
  ['Psychiatry', 'psychiatrist'],
  ['Psychiatry', 'चिंता'],
  ['Psychiatry', 'मानसिक स्वास्थ्य'],
  ['Gynecology', 'gynaecologist'],
  ['Gynecology', 'gynecologist'],
  ['Gynecology', 'mahila swasthya'],
  ['Gynecology', 'stri rog'],
  ['Gynecology', "women's health doctor"],
  ['Gynecology', 'महिला स्वास्थ्य'],
  ['Gynecology', 'स्त्री रोग'],
]

function valuesSql() {
  return aliases
    .map(([specialization, term]) => `(${escapeValue(specialization)}, ${escapeValue(term)})`)
    .join(',\n      ')
}

export function up(pgm) {
  pgm.sql(`
    LOCK TABLE specialization_search_terms IN SHARE ROW EXCLUSIVE MODE;

    DO $migration$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM specialization_search_terms AS search_term
        JOIN specializations AS sp ON sp.id = search_term.specialization_id
        JOIN (
          VALUES
          ${valuesSql()}
        ) AS alias(specialization_name, term)
          ON sp.name = alias.specialization_name
         AND search_term.term = alias.term
      ) THEN
        RAISE EXCEPTION 'Search alias migration found a pre-existing target term; no rows were inserted';
      END IF;
    END
    $migration$;
  `)

  pgm.sql(`
    INSERT INTO specialization_search_terms (specialization_id, term)
    SELECT sp.id, alias.term
    FROM (
      VALUES
      ${valuesSql()}
    ) AS alias(specialization_name, term)
    JOIN specializations sp ON sp.name = alias.specialization_name
    ON CONFLICT (specialization_id, term) DO NOTHING
  `)
}

export function down(pgm) {
  pgm.sql(`
    DELETE FROM specialization_search_terms AS search_term
    USING specializations AS sp, (
      VALUES
      ${valuesSql()}
    ) AS alias(specialization_name, term)
    WHERE search_term.specialization_id = sp.id
      AND sp.name = alias.specialization_name
      AND search_term.term = alias.term
  `)
}
