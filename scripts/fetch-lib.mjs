/**
 * 抓取层：本机出口被 hasaki WAF 403，node TLS 指纹同样被拦；
 * 只有 curl 经本机代理 127.0.0.1:7890 能通。所以一律用 curl。
 * 批量模式：curl -K <config> --parallel，一次进程打一批 URL。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const PROXY = 'http://127.0.0.1:7890';
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 单个 URL → 字符串（走 curl） */
export function curlGet(url, { timeout = 60, headers = {} } = {}) {
  const args = ['-s', '--max-time', String(timeout), '-x', PROXY, '-A', UA,
    '-H', 'Accept: application/json, text/plain, */*',
    '-H', 'Accept-Language: vi-VN,vi;q=0.9,en;q=0.8'];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push('-w', '\n__STATUS:%{http_code}', url);
  const out = execFileSync('curl.exe', args).toString('utf8');
  const m = out.match(/\n__STATUS:(\d+)$/);
  const status = m ? Number(m[1]) : 0;
  const body = m ? out.slice(0, m.index) : out;
  return { status, body };
}

/**
 * 批量：jobs = [{url, out}]，一次 curl 进程并发抓。
 * 返回 {ok:[out], fail:[{url,out,status}]}
 */
export function curlBatch(jobs, { concurrency = 8, timeout = 45, cfgDir, cwd } = {}) {
  if (!jobs.length) return { ok: [], fail: [] };
  const runDir = cwd || cfgDir;
  const cfgFile = path.join(runDir, '_batch.cfg');
  const lines = [];
  for (const j of jobs) {
    // 注意：curl config 里 `next` 之后的块不继承命令行选项，所以每块都写全。
    lines.push(`url = "${j.url}"`);
    lines.push(`output = "${j.out}"`);
    lines.push(`proxy = "${PROXY}"`);
    lines.push(`user-agent = "${UA}"`);
    lines.push(`header = "Accept: application/json, text/plain, */*"`);
    lines.push(`header = "Accept-Language: vi-VN,vi;q=0.9,en;q=0.8"`);
    lines.push(`header = "Referer: https://hasaki.vn/"`);
    lines.push(`silent`);
    lines.push(`max-time = ${timeout}`);
    lines.push(`retry = 2`);
    lines.push(`retry-delay = 2`);
    lines.push(`write-out = "%{http_code} %{url_effective}\\n"`);
    lines.push(`next`);
  }
  lines.pop();
  fs.writeFileSync(cfgFile, lines.join('\n'), 'utf8');

  const out = execFileSync('curl.exe', ['-K', cfgFile, '--parallel', '--parallel-max', String(concurrency), '-s'],
    { maxBuffer: 64 * 1024 * 1024, cwd: runDir, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');

  const codes = new Map();
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d{3}) (\S+)$/);
    if (m) codes.set(m[2], Number(m[1]));
  }
  const ok = [], fail = [];
  for (const j of jobs) {
    const st = codes.get(j.url) || 0;
    const p = path.join(runDir, j.out);
    const exists = fs.existsSync(p) && fs.statSync(p).size > 20;
    if (st === 200 && exists) ok.push(p);
    else {
      fail.push({ url: j.url, out: j.out, status: st });
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
  }
  return { ok, fail };
}

export async function pool(items, worker, concurrency = 8) {
  let i = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}
