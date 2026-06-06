import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Tesseract from 'tesseract.js';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from 'recharts';
import type { Dropbox } from '@dropbox/dropbox-sdk';
import { compressImage, objectUrl } from './image';
import { decryptJson, encryptJson } from './crypto';
import { AppData, defaultData, Exam, LabResult } from './types';
import {
  beginDropboxLogin,
  createTemporaryImageLink,
  downloadText,
  ensureAppFolders,
  finishDropboxLoginIfNeeded,
  getClient,
  hasDropboxConfig,
  logoutDropbox,
  uploadImage,
  uploadText,
} from './dropbox';
import './style.css';

const DATA_PATH = '/LabResultApp/data/lab-results.enc.json';

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(name: string, aliases: Record<string, string[]>): string {
  const compact = name.replace(/\s/g, '').toUpperCase();
  for (const [normalized, patterns] of Object.entries(aliases)) {
    if (patterns.some((p) => p.replace(/\s/g, '').toUpperCase() === compact)) return normalized;
  }
  return name.trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function guessResults(text: string, aliases: Record<string, string[]>): LabResult[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: LabResult[] = [];
  const known = Object.entries(aliases).flatMap(([n, pats]) => [n, ...pats]);
  for (const line of lines) {
    for (const key of known) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${escaped}[^0-9+\-.]{0,16}([+-]?\\d+(?:[.,]\\d+)?)\\s*([a-zA-Zμµ/%\\/]+)?`, 'i');
      const m = line.match(re);
      if (m) {
        const value = Number(m[1].replace(',', '.'));
        if (!Number.isFinite(value)) continue;
        const normalizedName = normalize(key, aliases);
        if (!out.some((x) => x.normalizedName === normalizedName && x.value === value)) {
          out.push({ id: id('result'), itemName: key, normalizedName, value, unit: m[2] || '', normalMin: null, normalMax: null, memo: '' });
        }
      }
    }
  }
  return out;
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    finishDropboxLoginIfNeeded()
      .then((token) => token && onLogin(token))
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }, [onLogin]);
  if (!hasDropboxConfig()) {
    return <Card title="Dropbox設定が必要です">
      <p><code>.env.local</code> に <code>VITE_DROPBOX_CLIENT_ID</code> を設定してください。</p>
      <p>READMEの手順に沿って、Dropbox Developersでアプリを作成します。</p>
    </Card>;
  }
  return <Card title="検査結果ログ">
    <p>スマホで撮影した検査結果画像をDropboxに保存し、OCR結果と検査値は暗号化して保存します。</p>
    {error && <p className="error">{error}</p>}
    <button disabled={busy} onClick={() => beginDropboxLogin()}>{busy ? '確認中...' : 'Dropboxでログイン'}</button>
    <p className="note">画像は暗号化されません。Dropboxアカウントの2段階認証とフォルダ非共有を推奨します。</p>
  </Card>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [dbx, setDbx] = useState<Dropbox | null>(null);
  const [pass, setPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState<AppData>(defaultData());
  const [tab, setTab] = useState<'home' | 'new' | 'list' | 'graph' | 'settings'>('home');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (token) setDbx(getClient(token));
  }, [token]);

  async function unlock() {
    if (!dbx || !pass) return;
    await ensureAppFolders(dbx);
    const encrypted = await downloadText(dbx, DATA_PATH);
    if (!encrypted) {
      const fresh = defaultData();
      await uploadText(dbx, DATA_PATH, await encryptJson(fresh, pass));
      setData(fresh);
      setUnlocked(true);
      setMessage('新しい暗号化データを作成しました。');
      return;
    }
    const loaded = await decryptJson<AppData>(encrypted, pass);
    setData({ ...defaultData(), ...loaded, aliases: { ...defaultData().aliases, ...(loaded.aliases || {}) } });
    setUnlocked(true);
    setMessage('暗号化データを読み込みました。');
  }

  async function save(next: AppData) {
    if (!dbx) return;
    await uploadText(dbx, DATA_PATH, await encryptJson(next, pass));
    setData(next);
    setMessage('Dropboxに保存しました。');
  }

  function logout() {
    logoutDropbox();
    setToken(null); setDbx(null); setUnlocked(false); setPass(''); setData(defaultData());
  }

  if (!token) return <Shell><Login onLogin={setToken} /></Shell>;
  if (!unlocked) return <Shell><Card title="復号パスフレーズ">
    <p>検査データを開くためのパスフレーズを入力してください。画像はDropbox上で通常画像として保存されます。</p>
    <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="パスフレーズ" />
    <button onClick={unlock}>開く / 新規作成</button>
    <button className="ghost" onClick={logout}>ログアウト</button>
  </Card></Shell>;

  return <Shell>
    <header className="topbar"><h1>検査結果ログ</h1><button className="ghost" onClick={logout}>ログアウト</button></header>
    <nav className="tabs">
      <button onClick={() => setTab('home')} className={tab === 'home' ? 'active' : ''}>ホーム</button>
      <button onClick={() => setTab('new')} className={tab === 'new' ? 'active' : ''}>登録</button>
      <button onClick={() => setTab('list')} className={tab === 'list' ? 'active' : ''}>一覧</button>
      <button onClick={() => setTab('graph')} className={tab === 'graph' ? 'active' : ''}>グラフ</button>
      <button onClick={() => setTab('settings')} className={tab === 'settings' ? 'active' : ''}>設定</button>
    </nav>
    {message && <p className="toast">{message}</p>}
    {tab === 'home' && <Home data={data} />}
    {tab === 'new' && dbx && <NewExam dbx={dbx} data={data} save={save} />}
    {tab === 'list' && dbx && <ExamList dbx={dbx} data={data} save={save} />}
    {tab === 'graph' && <Graph data={data} />}
    {tab === 'settings' && <Settings data={data} save={save} />}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="shell">{children}</main>; }

function Home({ data }: { data: AppData }) {
  const items = new Set(data.exams.flatMap(e => e.results.map(r => r.normalizedName))).size;
  const latest = [...data.exams].sort((a, b) => b.testedAt.localeCompare(a.testedAt))[0]?.testedAt || '未登録';
  return <Card title="ホーム">
    <div className="stats"><div><b>{data.exams.length}</b><span>検査回数</span></div><div><b>{items}</b><span>項目数</span></div><div><b>{latest}</b><span>最新検査日</span></div></div>
    <p className="note">まずは登録画面で画像を撮影し、OCR後に数値を確認してください。OCRは入力補助です。</p>
  </Card>;
}

function NewExam({ dbx, data, save }: { dbx: Dropbox; data: AppData; save: (d: AppData) => Promise<void> }) {
  const [testedAt, setTestedAt] = useState(today());
  const [facility, setFacility] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [results, setResults] = useState<LabResult[]>([]);

  async function onFile(file?: File) {
    if (!file) return;
    const compressed = await compressImage(file);
    setImageBlob(compressed);
    setPreview(objectUrl(compressed));
  }
  async function runOcr() {
    if (!imageBlob) return;
    setOcrBusy(true);
    try {
      const r = await Tesseract.recognize(imageBlob, 'jpn+eng');
      const text = r.data.text;
      setOcrText(text);
      const guessed = guessResults(text, data.aliases);
      setResults(guessed.length ? guessed : results);
    } finally { setOcrBusy(false); }
  }
  function addRow() {
    setResults([...results, { id: id('result'), itemName: '', normalizedName: '', value: 0, unit: '', normalMin: null, normalMax: null, memo: '' }]);
  }
  function updateRow(i: number, patch: Partial<LabResult>) {
    const next = results.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    setResults(next);
  }
  async function submit() {
    const imageFiles = [];
    if (imageBlob) {
      const fileName = `${testedAt}_${String(data.exams.length + 1).padStart(3, '0')}.jpg`;
      const path = await uploadImage(dbx, fileName, imageBlob);
      imageFiles.push({ id: id('img'), fileName, dropboxPath: path });
    }
    const now = new Date().toISOString();
    const exam: Exam = {
      id: id('exam'), testedAt, facilityName: facility, status: ocrText ? 'ocr_done' : imageFiles.length ? 'image_saved' : 'draft',
      imageFiles,
      ocrText,
      results: results.filter(r => r.itemName && Number.isFinite(r.value)).map(r => ({ ...r, normalizedName: r.normalizedName || normalize(r.itemName, data.aliases) })),
      createdAt: now, updatedAt: now,
    };
    await save({ ...data, exams: [exam, ...data.exams] });
    setOcrText(''); setResults([]); setImageBlob(null); setPreview(''); setFacility(''); setTestedAt(today());
  }
  return <Card title="新規登録">
    <label>検査日<input type="date" value={testedAt} onChange={e => setTestedAt(e.target.value)} /></label>
    <label>医療機関名 任意<input value={facility} onChange={e => setFacility(e.target.value)} /></label>
    <label>検査結果画像<input type="file" accept="image/*" capture="environment" onChange={e => onFile(e.target.files?.[0])} /></label>
    {preview && <img className="preview" src={preview} />}
    <button disabled={!imageBlob || ocrBusy} onClick={runOcr}>{ocrBusy ? 'OCR中...' : 'OCR読取'}</button>
    <textarea value={ocrText} onChange={e => setOcrText(e.target.value)} placeholder="OCR結果" rows={5} />
    <h3>検査データ</h3>
    <button className="ghost" onClick={addRow}>行を追加</button>
    <div className="rows">{results.map((r, i) => <div className="row" key={r.id}>
      <input placeholder="項目名" value={r.itemName} onChange={e => updateRow(i, { itemName: e.target.value, normalizedName: normalize(e.target.value, data.aliases) })} />
      <input placeholder="正規化名" value={r.normalizedName} onChange={e => updateRow(i, { normalizedName: e.target.value })} />
      <input type="number" step="any" placeholder="数値" value={r.value} onChange={e => updateRow(i, { value: Number(e.target.value) })} />
      <input placeholder="単位" value={r.unit} onChange={e => updateRow(i, { unit: e.target.value })} />
    </div>)}</div>
    <button onClick={submit}>Dropboxに保存</button>
  </Card>;
}

function ExamList({ dbx, data, save }: { dbx: Dropbox; data: AppData; save: (d: AppData) => Promise<void> }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  async function openImage(path: string) {
    const link = links[path] || await createTemporaryImageLink(dbx, path);
    setLinks({ ...links, [path]: link });
    window.open(link, '_blank');
  }
  async function setStatus(exam: Exam, status: Exam['status']) {
    const next = { ...data, exams: data.exams.map(e => e.id === exam.id ? { ...e, status, updatedAt: new Date().toISOString() } : e) };
    await save(next);
  }
  async function remove(exam: Exam) {
    if (!confirm('暗号化データからこの検査結果を削除します。画像ファイル自体はDropboxに残ります。')) return;
    await save({ ...data, exams: data.exams.filter(e => e.id !== exam.id) });
  }
  return <Card title="検査結果一覧">
    {data.exams.map(exam => <details key={exam.id} className="exam"><summary>{exam.testedAt}　{exam.facilityName || ''}　<span>{exam.status}</span></summary>
      <div className="detail">
        <div>{exam.imageFiles.map(img => <button className="ghost" key={img.id} onClick={() => openImage(img.dropboxPath)}>画像を開く：{img.fileName}</button>)}</div>
        <pre>{exam.ocrText || 'OCRテキストなし'}</pre>
        <table><thead><tr><th>項目</th><th>数値</th><th>単位</th></tr></thead><tbody>{exam.results.map(r => <tr key={r.id}><td>{r.normalizedName}</td><td>{r.value}</td><td>{r.unit}</td></tr>)}</tbody></table>
        <div className="buttonrow"><button onClick={() => setStatus(exam, 'confirmed')}>確認済み</button><button onClick={() => setStatus(exam, 'archived')}>紙原本破棄OK</button><button className="danger" onClick={() => remove(exam)}>削除</button></div>
      </div>
    </details>)}
  </Card>;
}

function Graph({ data }: { data: AppData }) {
  const names = Array.from(new Set(data.exams.flatMap(e => e.results.map(r => r.normalizedName)))).sort();
  const [selected, setSelected] = useState<string[]>(names.slice(0, 3));
  useEffect(() => { if (!selected.length && names.length) setSelected(names.slice(0, 3)); }, [names.join('|')]);
  const chartData = useMemo(() => {
    return [...data.exams].sort((a, b) => a.testedAt.localeCompare(b.testedAt)).map(e => {
      const row: Record<string, string | number> = { date: e.testedAt };
      for (const r of e.results) if (selected.includes(r.normalizedName)) row[r.normalizedName] = r.value;
      return row;
    });
  }, [data, selected]);
  return <Card title="グラフ">
    <div className="chips">{names.map(n => <label key={n}><input type="checkbox" checked={selected.includes(n)} onChange={e => setSelected(e.target.checked ? [...selected, n] : selected.filter(x => x !== n))} />{n}</label>)}</div>
    <div className="chart"><ResponsiveContainer width="100%" height={320}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend />{selected.map(n => <Line key={n} type="monotone" dataKey={n} connectNulls strokeWidth={2} dot />)}</LineChart></ResponsiveContainer></div>
  </Card>;
}

function Settings({ data, save }: { data: AppData; save: (d: AppData) => Promise<void> }) {
  const [text, setText] = useState(JSON.stringify(data.aliases, null, 2));
  async function apply() {
    const aliases = JSON.parse(text) as Record<string, string[]>;
    await save({ ...data, aliases });
  }
  return <Card title="設定">
    <p>項目名の表記ゆれをJSONで管理します。</p>
    <textarea rows={12} value={text} onChange={e => setText(e.target.value)} />
    <button onClick={apply}>設定を保存</button>
  </Card>;
}

createRoot(document.getElementById('root')!).render(<App />);
