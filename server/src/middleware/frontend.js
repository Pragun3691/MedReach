import { fileURLToPath } from 'node:url'
import express from 'express'

const frontendDirectory = fileURLToPath(new URL('../../../client/dist/', import.meta.url))

// Keep these page routes aligned with client/src/App.jsx. Asset paths never match.
const pageRoutes = [
  /^\/$/,
  /^\/(?:doctors|login|register|appointments|notifications)\/?$/i,
  /^\/(?:doctors|appointments)\/[^/.\\]+\/?$/i,
  /^\/doctor\/(?:appointments|availability|verification)\/?$/i,
  /^\/admin\/doctor-verifications\/?$/i,
]

export function createFrontendRouter(directory = frontendDirectory) {
  const router = express.Router()
  router.use(express.static(directory, { dotfiles: 'ignore', index: false, redirect: false }))

  // Middleware avoids the wildcard route syntax differences between Express versions.
  router.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next()
    if (!request.get('Accept')?.includes('text/html') || !request.accepts('html')) return next()
    if (request.get('Sec-Fetch-Mode') && request.get('Sec-Fetch-Mode') !== 'navigate') return next()
    if (request.get('Sec-Fetch-Dest') && !['document', 'iframe'].includes(request.get('Sec-Fetch-Dest'))) return next()

    let pathname
    try {
      pathname = decodeURIComponent(request.path)
    } catch {
      return next()
    }
    if (!pageRoutes.some(route => route.test(pathname))) return next()

    response.sendFile('index.html', { root: directory, dotfiles: 'deny' }, error => {
      if (error?.status === 404) return next()
      if (error) next(error)
    })
  })

  return router
}
