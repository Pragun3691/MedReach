async function requestJson(path, { signal, ...options } = {}) {
  const response = await fetch(path, {
    ...options,
    signal,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = new Error(payload?.error?.message ?? 'We could not load this information.')
    error.code = payload?.error?.code
    error.status = response.status
    error.details = payload?.error?.details ?? []
    throw error
  }

  return response.json()
}

export function listSpecializations(signal) {
  return requestJson('/api/specializations', { signal })
}

export function searchDoctors(searchParams, signal) {
  const query = searchParams.toString()
  return requestJson(`/api/doctors${query ? `?${query}` : ''}`, { signal })
}

export function getDoctor(doctorId, signal) {
  return requestJson(`/api/doctors/${doctorId}`, { signal })
}

export function getDoctorSlots(doctorId, date, signal) {
  const query = new URLSearchParams({ date })
  return requestJson(`/api/doctors/${doctorId}/slots?${query.toString()}`, { signal })
}

export function getCurrentUser(signal) {
  return requestJson('/api/auth/me', { signal })
}

export function login(credentials) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function logout() {
  return requestJson('/api/auth/logout', { method: 'POST' })
}

export function registerPatientAccount(account) {
  return requestJson('/api/auth/register/patient', {
    method: 'POST',
    body: JSON.stringify(account),
  })
}

export function registerDoctorAccount(account) {
  return requestJson('/api/auth/register/doctor', {
    method: 'POST',
    body: JSON.stringify(account),
  })
}

export function bookAppointment(slotId) {
  return requestJson('/api/appointments', {
    method: 'POST',
    body: JSON.stringify({ slotId }),
  })
}

export function listPatientAppointments(signal) {
  return requestJson('/api/appointments/me', { signal })
}

export function listDoctorAppointments(signal) {
  return requestJson('/api/doctors/me/appointments', { signal })
}

export function getAppointment(appointmentId, signal) {
  return requestJson(`/api/appointments/${appointmentId}`, { signal })
}

export function cancelAppointment(appointmentId, reason) {
  return requestJson(`/api/appointments/${appointmentId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  })
}

export function rescheduleAppointment(appointmentId, slotId) {
  return requestJson(`/api/appointments/${appointmentId}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ slotId }),
  })
}

export function listNotifications({ limit = 20, offset = 0, signal } = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  return requestJson(`/api/notifications?${query.toString()}`, { signal })
}

export function markNotificationRead(notificationId) {
  return requestJson(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
}

export function getHomeDiscovery(signal) {
  return Promise.all([
    listSpecializations(signal),
    searchDoctors(new URLSearchParams({ limit: '2', offset: '0' }), signal),
  ]).then(([specializations, doctors]) => ({
    specializations: specializations.items,
    doctors: doctors.items,
  }))
}
