import { z } from 'zod'
import { calendarDateSchema } from './public-doctor.schemas.js'

const currentDate = () => new Date().toISOString().slice(0, 10)

const fullNameSchema = z.string().trim().min(2).max(120)
const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase())
const passwordSchema = z.string().min(12).max(128)
const loginPasswordSchema = z.string().min(1).max(128)
const optionalText = maximum => z.string().trim().min(1).max(maximum).optional()

const patientProfileSchema = {
  dateOfBirth: calendarDateSchema
    .refine(value => value >= '1900-01-01', 'Date of birth must be on or after 1900-01-01')
    .refine(value => value <= currentDate(), 'Date of birth cannot be in the future')
    .optional(),
  gender: z.enum(['male', 'female', 'non-binary', 'other', 'prefer_not_to_say']).optional(),
  city: optionalText(100),
  district: optionalText(100),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: optionalText(4000),
}

export const patientRegistrationSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  ...patientProfileSchema,
}).strict()

export const doctorRegistrationSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  qualification: z.string().trim().min(2).max(500),
  experienceYears: z.number().int().min(0).max(80),
  specializationIds: z.array(z.number().int().positive()).min(1).max(20)
    .refine(values => new Set(values).size === values.length, 'Specializations must be unique'),
  bio: optionalText(4000),
  clinicName: optionalText(160),
  clinicCity: optionalText(100),
  clinicDistrict: optionalText(100),
  defaultFee: z.number().min(0).max(100000).optional(),
}).strict()

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
}).strict()
