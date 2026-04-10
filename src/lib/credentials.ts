import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.js';
import type { Credentials } from './types.js';

function getCredentialsPath(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR, CONFIG.CREDENTIALS_FILE);
}

function getCredentialsDir(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR);
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const data = await readFile(getCredentialsPath(), 'utf-8');
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  const dir = getCredentialsDir();
  await mkdir(dir, { recursive: true });

  const filePath = getCredentialsPath();
  await writeFile(filePath, JSON.stringify(credentials, null, 2), 'utf-8');
  await chmod(filePath, 0o600);
}

export async function clearCredentials(): Promise<void> {
  try {
    await unlink(getCredentialsPath());
  } catch {
    // File doesn't exist, that's fine
  }
}
