"use client";

import { useEffect, useState } from "react";

/**
 * Invisible fields bots fill / timing token humans pass.
 * Do not style these as visible inputs.
 */
export default function FormSpamGuard() {
  const [startedAt, setStartedAt] = useState("");

  useEffect(() => {
    setStartedAt(String(Date.now()));
  }, []);

  return (
    <>
      <input type="hidden" name="formStartedAt" value={startedAt} readOnly />
      {/* Honeypot — hidden from sighted users and most AT */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
        <label>
          Company URL
          <input type="url" name="company_url" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
    </>
  );
}
