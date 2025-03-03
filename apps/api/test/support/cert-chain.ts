import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate, createHash } from 'node:crypto';

export interface TestChain {
  x5c: string[];
  leafKeyPem: string;
  rootFingerprint: string;
}

/** Builds root → intermediate → leaf (P-256) with openssl, like Apple's StoreKit chain. */
export function makeChain(): TestChain {
  const dir = mkdtempSync(join(tmpdir(), 'bf-chain-'));
  const run = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  const ext = (name: string, body: string) => writeFileSync(join(dir, name), body);
  ext('ca.ext', 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
  ext('leaf.ext', 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n');

  for (const k of ['root', 'int', 'leaf']) run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${k}.key`);
  run('req', '-new', '-x509', '-key', 'root.key', '-subj', '/CN=Test Root', '-days', '30', '-out', 'root.pem', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
  run('req', '-new', '-key', 'int.key', '-subj', '/CN=Test Intermediate', '-out', 'int.csr');
  run('x509', '-req', '-in', 'int.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '30', '-extfile', 'ca.ext', '-out', 'int.pem');
  run('req', '-new', '-key', 'leaf.key', '-subj', '/CN=Test Leaf', '-out', 'leaf.csr');
  run('x509', '-req', '-in', 'leaf.csr', '-CA', 'int.pem', '-CAkey', 'int.key', '-CAcreateserial', '-days', '30', '-extfile', 'leaf.ext', '-out', 'leaf.pem');
  run('pkcs8', '-topk8', '-nocrypt', '-in', 'leaf.key', '-out', 'leaf.pk8');

  const der = (file: string) => new X509Certificate(readFileSync(join(dir, file))).raw;
  const root = der('root.pem');
  return {
    x5c: [der('leaf.pem'), der('int.pem'), root].map((d) => d.toString('base64')),
    leafKeyPem: readFileSync(join(dir, 'leaf.pk8'), 'utf8'),
    rootFingerprint: createHash('sha256').update(root).digest('hex'),
  };
}
