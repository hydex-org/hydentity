import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const paths = [
    '/var/task',
    '/var/task/circuit2',
    '/var/task/apps',
    '/var/task/apps/hydentity-app',
    '/var/task/apps/hydentity-app/circuit2',
    '/var/task/node_modules/privacycash',
    '/var/task/node_modules/privacycash/circuit2',
    process.cwd(),
    path.join(process.cwd(), 'circuit2'),
    path.join(process.cwd(), 'node_modules', 'privacycash', 'circuit2'),
  ];

  const results: Record<string, any> = {
    cwd: process.cwd(),
    env: {
      PRIVACYCASH_CIRCUIT_PATH: process.env.PRIVACYCASH_CIRCUIT_PATH,
      PRIVACYCASH_CACHE_DIR: process.env.PRIVACYCASH_CACHE_DIR,
    },
    paths: {},
  };

  for (const p of paths) {
    try {
      const exists = fs.existsSync(p);
      if (exists) {
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
          results.paths[p] = {
            exists: true,
            isDir: true,
            contents: fs.readdirSync(p).slice(0, 20), // First 20 items
          };
        } else {
          results.paths[p] = {
            exists: true,
            isDir: false,
            size: stats.size,
          };
        }
      } else {
        results.paths[p] = { exists: false };
      }
    } catch (err) {
      results.paths[p] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
