// tools/asar-read.mjs — 极简 asar 读取器（只读，用于查 DSH 安装产物里的源码）
//   node tools/asar-read.mjs <asar> list [关键字]
//   node tools/asar-read.mjs <asar> cat <内部路径>
import { readFileSync } from 'node:fs';

const [, , asarPath, cmd, arg] = process.argv;
if (!asarPath || !cmd) { console.error('用法: node asar-read.mjs <asar> list [kw] | cat <path>'); process.exit(1); }

const buf = readFileSync(asarPath);
if (buf.readUInt32LE(0) !== 4) throw new Error('不是 asar（magic 不符）');
const headerPickleSize = buf.readUInt32LE(4);
const headerSize = buf.readUInt32LE(12);
const headerJson = buf.toString('utf8', 16, 16 + headerSize);
const header = JSON.parse(headerJson);
const dataOffset = 8 + headerPickleSize;

const files = [];
(function walk(node, prefix) {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (value.files) walk(value, p);
    else files.push({ path: p, size: value.size, offset: value.offset === undefined ? undefined : Number(value.offset), unpacked: !!value.unpacked });
  }
})(header, '');

if (cmd === 'list') {
  const kw = arg;
  for (const f of files) if (!kw || f.path.includes(kw)) console.log(`${String(f.size).padStart(9)}  ${f.path}`);
} else if (cmd === 'cat') {
  const hit = files.find((f) => f.path === arg) ?? files.find((f) => f.path.endsWith(arg));
  if (!hit) { console.error('找不到：' + arg); process.exit(1); }
  if (hit.unpacked) { console.error('该文件是 unpacked，直接读磁盘：' + hit.path); process.exit(1); }
  process.stdout.write(buf.subarray(dataOffset + hit.offset, dataOffset + hit.offset + hit.size));
} else console.error('未知命令');
