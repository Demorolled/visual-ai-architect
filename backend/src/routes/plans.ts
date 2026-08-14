/**
 * Plan Mode routes.
 *
 * Plan Mode captures the user's app ideas and saves them to a text file
 * (data/plans/<project-name>.txt) for later creation. The user defines the
 * project name; when one is not provided the API answers with `needName` so
 * the UI can ask the user for it before saving.
 */

import { Router, Request, Response } from 'express';
import { savePlanFile, listPlanFiles, readPlanFile } from '../utils/planFile.js';

const router = Router();

// POST /api/plans — save (create or update) a plan file
router.post('/', (req: Request, res: Response) => {
  try {
    const { projectName, ideas, guidance, questions } = req.body || {};
    if (!projectName || typeof projectName !== 'string' || !projectName.trim()) {
      res.status(400).json({
        error: 'A project name is required to save a plan.',
        needName: true,
        hint: 'Give this plan a project name so it can be saved for later creation.',
      });
      return;
    }
    if (!ideas || typeof ideas !== 'string' || !ideas.trim()) {
      res.status(400).json({ error: 'Plan ideas/notes are required.' });
      return;
    }
    const record = savePlanFile({
      projectName,
      ideas,
      guidance: guidance || '',
      questions: questions || '',
    });
    res.json({ success: true, ...record });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plans — list saved plans
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, plans: listPlanFiles() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/plans/:name — read a plan's text content
router.get('/:name', (req: Request, res: Response) => {
  try {
    const plan = readPlanFile(req.params.name);
    if (!plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({ success: true, ...plan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as planRoutes };
