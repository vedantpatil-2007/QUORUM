/**
 * RFC 8785 - JSON Canonicalization Scheme (JCS)
 * 
 * Provides deterministic canonical serialization of JSON data for cryptographic
 * signing and verification. Guarantees bit-identical byte output regardless of:
 * - Object key ordering
 * - Whitespace differences
 * - Floating point formatting variations
 */

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(`Canonicalization error: ${message}`);
    this.name = 'CanonicalizationError';
  }
}

/**
 * Serializes any JSON-compatible value to its RFC 8785 canonical string representation.
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) {
    throw new CanonicalizationError('Top-level undefined is not valid JSON');
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new CanonicalizationError(`Cannot serialize ${typeof value} to JSON`);
  }

  return serializeValue(value);
}

/**
 * Serializes any JSON-compatible value to canonical UTF-8 Buffer.
 */
export function canonicalizeToBuffer(value: unknown): Buffer {
  const canonicalString = canonicalize(value);
  return Buffer.from(canonicalString, 'utf8');
}

function serializeValue(val: unknown): string {
  if (val === null) {
    return 'null';
  }

  const type = typeof val;

  if (type === 'boolean') {
    return val ? 'true' : 'false';
  }

  if (type === 'number') {
    if (!Number.isFinite(val)) {
      throw new CanonicalizationError('Infinity and NaN are not permitted in JSON');
    }
    // Handle -0: in ECMAScript, Object.is(-0, val) identifies -0, which must serialize as "0"
    if (Object.is(val, -0)) {
      return '0';
    }
    // ECMAScript Number.prototype.toString matches ECMA-262 7.1.12.1 specified by RFC 8785
    return JSON.stringify(val);
  }

  if (type === 'string') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const serializedItems: string[] = [];
    for (let i = 0; i < val.length; i++) {
      const item = val[i];
      // In JSON arrays, undefined, functions, and symbols serialize as null
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        serializedItems.push('null');
      } else {
        serializedItems.push(serializeValue(item));
      }
    }
    return `[${serializedItems.join(',')}]`;
  }

  if (type === 'object') {
    // Check if it's a plain object or has a custom toJSON
    const obj = val as Record<string, unknown>;
    
    // If the object has a toJSON method (e.g. Date), invoke it first
    if (typeof (val as { toJSON?: () => unknown }).toJSON === 'function') {
      return serializeValue((val as { toJSON: () => unknown }).toJSON());
    }

    // RFC 8785 Section 3.2.3: Sort keys by UTF-16 code unit values
    const sortedKeys = Object.keys(obj).sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

    const serializedEntries: string[] = [];
    for (const key of sortedKeys) {
      const propVal = obj[key];
      // Properties with undefined, function, or symbol values are omitted from objects
      if (propVal === undefined || typeof propVal === 'function' || typeof propVal === 'symbol') {
        continue;
      }
      const serializedKey = JSON.stringify(key);
      const serializedProp = serializeValue(propVal);
      serializedEntries.push(`${serializedKey}:${serializedProp}`);
    }

    return `{${serializedEntries.join(',')}}`;
  }

  throw new CanonicalizationError(`Unsupported value type: ${type}`);
}
