import { getPool } from '../db/pool.js'

export const specializationRepository = {
  async findAll() {
    const result = await getPool().query(
      'SELECT id, name FROM specializations ORDER BY name ASC',
    )

    return result.rows
  },
}
