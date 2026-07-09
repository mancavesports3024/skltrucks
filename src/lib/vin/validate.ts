const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function validateVin(raw: string): { ok: true; vin: string } | { ok: false; error: string } {
  const vin = normalizeVin(raw);

  if (!vin) {
    return { ok: false, error: "Enter a VIN to look up." };
  }

  if (vin.length !== 17) {
    return { ok: false, error: "VIN must be exactly 17 characters." };
  }

  if (!VIN_PATTERN.test(vin)) {
    return {
      ok: false,
      error: "VIN contains invalid characters. Letters I, O, and Q are not used in VINs.",
    };
  }

  return { ok: true, vin };
}
