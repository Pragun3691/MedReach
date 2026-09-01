export function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export function destroySession(request) {
  return new Promise((resolve, reject) => {
    request.session.destroy(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
