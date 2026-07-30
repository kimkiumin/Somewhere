import { createHash } from "node:crypto";
import { ReleaseInputError } from "./release-core.mjs";

function archiveError() {
  throw new ReleaseInputError("prepared source archive is unsafe or malformed");
}

function tarText(header, offset, length) {
  return header.subarray(offset, offset + length).toString().replace(/\0.*$/s, "");
}

function tarNumber(header, offset, length) {
  const text = tarText(header, offset, length).trim();
  if (!/^[0-7]+$/u.test(text)) archiveError();
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) archiveError();
  return value;
}

function parsePax(data) {
  const values = new Map();
  for (let offset = 0; offset < data.length;) {
    const separator = data.indexOf(0x20, offset);
    if (separator <= offset) archiveError();
    const length = Number.parseInt(data.subarray(offset, separator).toString(), 10);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > data.length || data[end - 1] !== 0x0a) {
      archiveError();
    }
    const record = data.subarray(separator + 1, end - 1);
    const equals = record.indexOf(0x3d);
    if (equals <= 0) archiveError();
    values.set(
      record.subarray(0, equals).toString(),
      record.subarray(equals + 1).toString(),
    );
    offset = end;
  }
  return values;
}

function gitObjectId(kind, data) {
  return createHash("sha1")
    .update(Buffer.from(`${kind} ${data.length}\0`))
    .update(data)
    .digest();
}

function addArchiveEntry(root, path, entry) {
  const parts = path.replace(/\/$/u, "").split("/");
  if (
    path.startsWith("/")
    || parts.length === 0
    || parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    archiveError();
  }
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    const child = directory.get(part);
    if (child !== undefined && child.entries === undefined) archiveError();
    if (child === undefined) directory.set(part, { entries: new Map() });
    directory = directory.get(part).entries;
  }
  const name = parts.at(-1);
  const existing = directory.get(name);
  if (entry.entries !== undefined) {
    if (existing !== undefined && existing.entries === undefined) archiveError();
    if (existing === undefined) directory.set(name, entry);
    return;
  }
  if (existing !== undefined) archiveError();
  directory.set(name, entry);
}

function gitTreeId(entries) {
  const records = [...entries]
    .sort(([left, leftEntry], [right, rightEntry]) => Buffer.compare(
      Buffer.from(`${left}${leftEntry.entries === undefined ? "" : "/"}`),
      Buffer.from(`${right}${rightEntry.entries === undefined ? "" : "/"}`),
    ))
    .map(([name, entry]) => {
      const directory = entry.entries !== undefined;
      const mode = directory ? "40000" : entry.mode;
      const objectId = directory ? gitTreeId(entry.entries) : entry.objectId;
      return Buffer.concat([Buffer.from(`${mode} ${name}\0`), objectId]);
    });
  return gitObjectId("tree", Buffer.concat(records));
}

export function inspectSourceArchive(data) {
  if (data.length % 512 !== 0) archiveError();
  const files = new Map();
  const root = new Map();
  const seen = new Set();
  let pax;
  let offset = 0;
  for (; offset + 512 <= data.length; offset += 512) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const expectedChecksum = tarNumber(header, 148, 8);
    const observedChecksum = header.reduce((sum, byte, index) =>
      sum + (index >= 148 && index < 156 ? 0x20 : byte), 0);
    if (expectedChecksum !== observedChecksum) archiveError();
    const size = tarNumber(header, 124, 12);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    const nextOffset = contentStart + Math.ceil(size / 512) * 512;
    if (contentEnd > data.length || nextOffset > data.length) archiveError();
    const content = data.subarray(contentStart, contentEnd);
    const type = tarText(header, 156, 1);
    if (type === "g") {
      parsePax(content);
      offset = nextOffset - 512;
      continue;
    }
    if (type === "x") {
      if (pax !== undefined) archiveError();
      pax = parsePax(content);
      offset = nextOffset - 512;
      continue;
    }
    const prefix = tarText(header, 345, 155);
    const headerPath = `${prefix === "" ? "" : `${prefix}/`}${tarText(header, 0, 100)}`;
    const path = pax?.get("path") ?? headerPath;
    const link = pax?.get("linkpath") ?? tarText(header, 157, 100);
    pax = undefined;
    if (seen.has(path)) archiveError();
    seen.add(path);
    if (type === "5") {
      addArchiveEntry(root, path, { entries: new Map() });
    } else if (type === "2") {
      addArchiveEntry(root, path, {
        mode: "120000",
        objectId: gitObjectId("blob", Buffer.from(link)),
      });
    } else if (type === "" || type === "0") {
      const mode = tarNumber(header, 100, 8);
      const bytes = Buffer.from(content);
      files.set(path, bytes);
      addArchiveEntry(root, path, {
        mode: (mode & 0o111) === 0 ? "100644" : "100755",
        objectId: gitObjectId("blob", bytes),
      });
    } else {
      archiveError();
    }
    offset = nextOffset - 512;
  }
  if (pax !== undefined || [...data.subarray(offset)].some((byte) => byte !== 0)) archiveError();
  return { files, sourceTree: gitTreeId(root).toString("hex") };
}
