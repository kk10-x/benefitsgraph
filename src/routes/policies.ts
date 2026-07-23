import { Router } from "express";
import { pool } from "../db/pool.js";

export const policiesRouter = Router();

// List the employer/plan policies an employee can be enrolled against.
// Handy for discovering valid `employerName` / `planName` values before POST /employees.
policiesRouter.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (employer_name, plan_name)
         employer_name AS "employerName",
         plan_name     AS "planName",
         version,
         rules
       FROM policies
       ORDER BY employer_name, plan_name, version DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});
