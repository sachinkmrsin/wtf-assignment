import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/members?gym_id=&status=&page=&limit=
router.get('/', async (req: Request, res: Response) => {
  try {
    const { gym_id, status, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (gym_id) {
      conditions.push(`gym_id = $${p++}`);
      params.push(gym_id);
    }
    if (status) {
      conditions.push(`status = $${p++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit as string), offset);

    const { rows } = await pool.query(
      `SELECT id, gym_id, name, email, status, last_checkin_at, created_at
       FROM members
       ${where}
       ORDER BY created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[members] GET /', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/members/churn-risk — Q3 benchmark query
router.get('/churn-risk', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, last_checkin_at, gym_id, email
      FROM members
      WHERE status = 'active'
        AND last_checkin_at < NOW() - INTERVAL '45 days'
      ORDER BY last_checkin_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[members] GET /churn-risk', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/members/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, gym_id, name, email, status, last_checkin_at, created_at
       FROM members WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[members] GET /:id', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
