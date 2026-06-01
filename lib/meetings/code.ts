const MEETING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_CODE_LENGTH = 6;

function secureRandom() {
  if (globalThis.crypto) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] / (0xffffffff + 1);
  }

  return Math.random();
}

export function generateMeetingCode(length = DEFAULT_CODE_LENGTH, random = Math.random) {
  if (!Number.isInteger(length) || length < 4 || length > 12) {
    throw new Error("Meeting code length must be an integer between 4 and 12.");
  }

  let code = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(random() * MEETING_CODE_ALPHABET.length);
    code += MEETING_CODE_ALPHABET[randomIndex];
  }

  return code;
}

export function generateSecureMeetingCode(length = DEFAULT_CODE_LENGTH) {
  return generateMeetingCode(length, secureRandom);
}

export function normalizeMeetingCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function createUniqueMeetingCode({
  exists,
  length = DEFAULT_CODE_LENGTH,
  maxAttempts = 8
}: {
  exists: (code: string) => Promise<boolean>;
  length?: number;
  maxAttempts?: number;
}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateSecureMeetingCode(length);
    if (!(await exists(code))) return code;
  }

  throw new Error("Unable to generate a unique meeting code. Please try again.");
}
