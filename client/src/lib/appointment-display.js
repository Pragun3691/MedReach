export function getAppointmentDisplayStatus(appointment, now = new Date()) {
  if (
    appointment?.status === 'booked'
    && new Date(appointment.slot.startAt).getTime() < now.getTime()
  ) {
    return 'awaiting_outcome'
  }

  return appointment?.status
}

export const appointmentStatusLabels = {
  booked: 'Booked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  rescheduled: 'Rescheduled',
  awaiting_outcome: 'Awaiting outcome',
}
