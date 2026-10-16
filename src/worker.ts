/** Fail closed if a deployment contains malformed or executable key data. */
export function normalizeKeys(input: string): string {
  if (typeof input !== "string" || input.length > 65536) throw new Error("Invalid public key configuration");
  // JSON is useful for deployment forms that only provide a single text box.
  if (input.trimStart().startsWith("[")) {
    const values: unknown = JSON.parse(input);
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
      throw new Error("Expected an array of public key strings");
    }
    input = values.join("\n");
  }
  input = input.replace(/\\n/g, "\n");
  const identities = new Set<string>();
  const keys: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) ([A-Za-z0-9+/]+={0,2})(?: [\x20-\x7e]*)?$/.exec(line);
    if (!match) throw new Error("Invalid public key line");
    const [, type, encoded] = match;
    const decoded = atob(encoded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    if (bytes.length < 4) throw new Error("Invalid SSH key blob");
    let offset = 0;
    const field = (): Uint8Array => {
      if (offset + 4 > bytes.length) throw new Error("Truncated SSH key");
      const size = new DataView(bytes.buffer).getUint32(offset);
      offset += 4;
      if (offset + size > bytes.length) throw new Error("Truncated SSH key");
      const result = bytes.slice(offset, offset + size);
      offset += size;
      return result;
    };
    const text = (value: Uint8Array) => new TextDecoder().decode(value);
    if (text(field()) !== type) throw new Error("SSH key type does not match blob");
    if (type === "ssh-ed25519") {
      if (field().length !== 32) throw new Error("Invalid Ed25519 key");
    } else if (type === "ssh-rsa") {
      if (!field().length || !field().length) throw new Error("Invalid RSA key");
    } else {
      const curve = type.slice("ecdsa-sha2-".length);
      if (text(field()) !== curve) throw new Error("Invalid ECDSA curve");
      const point = field();
      const size = curve === "nistp256" ? 65 : curve === "nistp384" ? 97 : 133;
      if (point.length !== size || point[0] !== 4) throw new Error("Invalid ECDSA point");
    }
    if (offset !== bytes.length) throw new Error("Unexpected SSH key data");
    const identity = `${type} ${encoded}`;
    if (!identities.has(identity)) {
      identities.add(identity);
      // Comments are unnecessary in the generated shell payload.
      keys.push(identity);
    }
  }
  if (!keys.length) throw new Error("At least one public key is required");
  return keys.join("\n") + "\n";
}

export interface KeydropEnv {
  SSH_PUBLIC_KEYS?: string;
}

/** Runtime configuration keeps every deployment independent of the template. */
export function createService(template: string) {
  return (request: Request, env: KeydropEnv): Response => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (!["/", "/install.sh", "/keys"].includes(new URL(request.url).pathname)) {
      return new Response(request.method === "HEAD" ? null : "Not found\n", { status: 404 });
    }
    try {
      return createHandler(env.SSH_PUBLIC_KEYS ?? "", template)(request);
    } catch {
      return new Response(request.method === "HEAD" ? null : "Service not configured: set SSH_PUBLIC_KEYS to valid OpenSSH public keys in Worker Settings > Variables and Secrets.\n", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
  };
}

export function createHandler(publicKeys: string, template: string) {
  const keys = normalizeKeys(publicKeys);
  const marker = "@@PUBLIC_KEYS@@";
  if (template.split(marker).length !== 2) throw new Error("Invalid installer template");
  const script = template.replace(marker, keys.trimEnd());
  return (request: Request): Response => {
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
    }
    const path = new URL(request.url).pathname;
    const body = path === "/" || path === "/install.sh" ? script : path === "/keys" ? keys : "Not found\n";
    const status = ["/", "/install.sh", "/keys"].includes(path) ? 200 : 404;
    return new Response(request.method === "HEAD" ? null : body, { status, headers });
  };
}
