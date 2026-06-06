import { Dropbox, DropboxAuth } from 'dropbox';

const CLIENT_ID = import.meta.env.VITE_DROPBOX_CLIENT_ID as string | undefined;
const TOKEN_KEY = 'lab_results_dropbox_token';
const VERIFIER_KEY = 'lab_results_dropbox_verifier';

export function hasDropboxConfig(): boolean {
  return Boolean(CLIENT_ID && CLIENT_ID !== 'your_dropbox_app_key');
}

function auth(): DropboxAuth {
  if (!CLIENT_ID) throw new Error('VITE_DROPBOX_CLIENT_ID が未設定です。');
  return new DropboxAuth({ clientId: CLIENT_ID });
}

export async function beginDropboxLogin(): Promise<void> {
  const a = auth();
  const redirectUri = location.origin + location.pathname;
  const url = await a.getAuthenticationUrl(redirectUri, undefined, 'code', 'offline', undefined, undefined, true);
  const verifier = a.getCodeVerifier();
  if (verifier) sessionStorage.setItem(VERIFIER_KEY, verifier);
  location.href = String(url);
}

export async function finishDropboxLoginIfNeeded(): Promise<string | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return localStorage.getItem(TOKEN_KEY);
  const a = auth();
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (verifier) a.setCodeVerifier(verifier);
  const redirectUri = location.origin + location.pathname;
  const response = await a.getAccessTokenFromCode(redirectUri, code);
  const token = (response.result as { access_token: string }).access_token;
  localStorage.setItem(TOKEN_KEY, token);
  history.replaceState({}, document.title, location.pathname + location.hash);
  return token;
}

export function logoutDropbox(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
}

export function getClient(token: string): Dropbox {
  return new Dropbox({ accessToken: token });
}

async function ensureFolder(dbx: Dropbox, path: string): Promise<void> {
  try {
    await dbx.filesCreateFolderV2({ path });
  } catch (e) {
    const msg = String(e);
    if (!msg.includes('conflict')) throw e;
  }
}

export async function ensureAppFolders(dbx: Dropbox): Promise<void> {
  await ensureFolder(dbx, '/LabResultApp');
  await ensureFolder(dbx, '/LabResultApp/images');
  await ensureFolder(dbx, '/LabResultApp/data');
}

export async function uploadText(dbx: Dropbox, path: string, text: string): Promise<void> {
  await dbx.filesUpload({ path, contents: text, mode: { '.tag': 'overwrite' }, autorename: false, mute: true });
}

export async function downloadText(dbx: Dropbox, path: string): Promise<string | null> {
  try {
    const r = await dbx.filesDownload({ path });
    const fileBlob = (r.result as unknown as { fileBlob?: Blob }).fileBlob;
    if (!fileBlob) return null;
    return await fileBlob.text();
  } catch (e) {
    const msg = String(e);
    if (msg.includes('not_found') || msg.includes('path/not_found')) return null;
    return null;
  }
}

export async function uploadImage(dbx: Dropbox, fileName: string, blob: Blob): Promise<string> {
  const path = `/LabResultApp/images/${fileName}`;
  await dbx.filesUpload({ path, contents: blob, mode: { '.tag': 'add' }, autorename: true, mute: true });
  return path;
}

export async function createTemporaryImageLink(dbx: Dropbox, path: string): Promise<string> {
  const r = await dbx.filesGetTemporaryLink({ path });
  return r.result.link;
}
