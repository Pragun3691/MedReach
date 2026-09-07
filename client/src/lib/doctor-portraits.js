import aaravMehtaPortrait from '../assets/doctors/aarav-mehta.jpg'
import aditiSharmaPortrait from '../assets/doctors/aditi-sharma.jpg'
import arjunVermaPortrait from '../assets/doctors/arjun-verma.jpg'

const demoDoctorPortraits = {
  'Dr. Aarav Mehta': aaravMehtaPortrait,
  'Dr. Aditi Sharma': aditiSharmaPortrait,
  'Dr. Arjun Verma': arjunVermaPortrait,
}

export function resolveDoctorPortrait(doctor) {
  return doctor.profileImageUrl ?? doctor.photoUrl ?? demoDoctorPortraits[doctor.fullName] ?? null
}
