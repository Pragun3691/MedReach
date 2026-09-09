const latinSearchPattern = /^[a-z]+(?:[ '-][a-z]+)*$/u
const minimumPrefixLength = 4
const minimumFuzzyLength = 5
const minimumSimilarity = 0.8
const ambiguityMargin = 0.05

export function normalizeSearchTerm(value) {
  return String(value).normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ')
}

export function normalizeDoctorName(value) {
  return normalizeSearchTerm(value).replace(/^dr\.(?=\s|$)/u, 'dr')
}

export function editDistance(leftValue, rightValue) {
  const left = Array.from(leftValue)
  const right = Array.from(rightValue)
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }
    previous = current
  }

  return previous[right.length]
}

function normalizedVocabulary(vocabulary) {
  return vocabulary.map(item => ({
    specializationId: Number(item.specializationId),
    canonical: normalizeSearchTerm(item.name),
    terms: item.terms.map(normalizeSearchTerm),
  }))
}

function uniqueIds(entries) {
  return [...new Set(entries.map(entry => entry.specializationId))]
}

function prefixMatches(value, query) {
  if (value.startsWith(query)) return true
  return !query.includes(' ') && value.split(' ').some(token => token.startsWith(query))
}

function fuzzyLimit(length) {
  if (length < minimumFuzzyLength) return 0
  return length <= 8 ? 1 : 2
}

export function resolveSpecializationQuery(value, vocabulary) {
  const query = normalizeSearchTerm(value)
  const normalized = normalizedVocabulary(vocabulary)
  const canonicalEntries = normalized.map(item => ({
    specializationId: item.specializationId,
    value: item.canonical,
  }))
  const termEntries = normalized.flatMap(item => item.terms.map(term => ({
    specializationId: item.specializationId,
    value: term,
  })))

  const exactCanonical = canonicalEntries.filter(entry => entry.value === query)
  if (exactCanonical.length > 0) {
    return { kind: 'canonical-exact', specializationIds: uniqueIds(exactCanonical) }
  }

  const exactTerms = termEntries.filter(entry => entry.value === query)
  if (exactTerms.length > 0) {
    return { kind: 'term-exact', specializationIds: uniqueIds(exactTerms) }
  }

  if (Array.from(query).length >= minimumPrefixLength) {
    const prefixIds = uniqueIds([...canonicalEntries, ...termEntries].filter(entry => prefixMatches(entry.value, query)))
    if (prefixIds.length === 1) return { kind: 'prefix', specializationIds: prefixIds }
    if (prefixIds.length > 1) return { kind: 'none', specializationIds: [] }
  }

  const queryLength = Array.from(query).length
  const maximumDistance = fuzzyLimit(queryLength)
  if (!maximumDistance || !latinSearchPattern.test(query)) {
    return { kind: 'none', specializationIds: [] }
  }

  const bestBySpecialization = new Map()
  for (const entry of [...canonicalEntries, ...termEntries]) {
    if (!latinSearchPattern.test(entry.value)) continue
    const distance = editDistance(query, entry.value)
    const denominator = Math.max(queryLength, Array.from(entry.value).length)
    const similarity = denominator === 0 ? 1 : 1 - distance / denominator
    if (distance > maximumDistance || similarity < minimumSimilarity) continue

    const current = bestBySpecialization.get(entry.specializationId)
    if (!current || distance < current.distance || (distance === current.distance && similarity > current.similarity)) {
      bestBySpecialization.set(entry.specializationId, {
        specializationId: entry.specializationId,
        distance,
        similarity,
      })
    }
  }

  const candidates = [...bestBySpecialization.values()].sort((left, right) => (
    left.distance - right.distance || right.similarity - left.similarity
  ))
  const best = candidates[0]
  const next = candidates[1]
  if (!best || (next && (next.distance === best.distance || best.similarity - next.similarity < ambiguityMargin))) {
    return { kind: 'none', specializationIds: [] }
  }

  return { kind: 'fuzzy', specializationIds: [best.specializationId] }
}
