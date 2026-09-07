const minute = 60 * 1000

export const consultationTiming = Object.freeze({
  patientReadyLeadMs: 15 * minute,
  doctorStartLeadMs: 5 * minute,
  noShowDelayMs: 15 * minute,
})

export function consultationTimes(startAt, endAt) {
  const start = new Date(startAt).getTime()
  return {
    checkInOpensAt: new Date(start - consultationTiming.patientReadyLeadMs),
    doctorRoomOpensAt: new Date(start - consultationTiming.doctorStartLeadMs),
    noShowAvailableAt: new Date(start + consultationTiming.noShowDelayMs),
    startCutoffAt: new Date(endAt),
  }
}

export function isConsultationEditable(consultation) {
  return Boolean(consultation) && consultation.finished_at == null
}

export function isWithin(now, opensAt, closesAt) {
  const instant = new Date(now).getTime()
  return instant >= new Date(opensAt).getTime() && instant < new Date(closesAt).getTime()
}
