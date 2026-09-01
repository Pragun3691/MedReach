import express from 'express'
import { createAuthenticationMiddleware } from './middleware/authenticate.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFoundHandler } from './middleware/not-found.js'
import { createAuthRouter } from './routes/auth.routes.js'
import { healthRouter } from './routes/health.routes.js'
import { createPublicDoctorRouter } from './routes/public-doctor.routes.js'
import { createSpecializationRouter } from './routes/specialization.routes.js'
import { createSessionMiddleware } from './session/session.js'
import { authService } from './services/auth.service.js'
import { publicDoctorService } from './services/public-doctor.service.js'
import { specializationService } from './services/specialization.service.js'

export function createApp({
  auth = authService,
  doctors = publicDoctorService,
  specializations = specializationService,
  sessionMiddleware,
} = {}) {
  const app = express()

  app.disable('x-powered-by')
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
  app.use(express.json({ limit: '1mb' }))
  app.use(sessionMiddleware ?? createSessionMiddleware())

  const authenticate = createAuthenticationMiddleware(auth)

  app.use('/api/health', healthRouter)
  app.use('/api/auth', createAuthRouter(auth, authenticate))
  app.use('/api/specializations', createSpecializationRouter(specializations))
  app.use('/api/doctors', createPublicDoctorRouter(doctors))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
