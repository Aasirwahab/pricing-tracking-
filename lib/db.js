import { neon } from "@neondatabase/serverless";

// Neon serverless driver: HTTP queries, safe for Vercel functions
export const sql = neon(process.env.DATABASE_URL);
