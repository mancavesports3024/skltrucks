/**
 * Local verification: render a sample sales sheet to a one-page Letter PDF.
 * Usage: node scripts/verify-sales-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = "/tmp/sales-pdf";
const outFile = path.join(outDir, "SKL-Trucks-2018-Freightliner-M2.pdf");

const pageCss = fs.readFileSync(path.join(root, "src/styles/sales-sheet-page.css"), "utf8");
const logoData = fs.readFileSync(path.join(root, "public/logo.png")).toString("base64");
const logoUrl = `data:image/png;base64,${logoData}`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>${pageCss}</style>
</head>
<body>
  <article class="sales-sheet-page" data-sales-sheet="true">
    <header class="sales-sheet-header">
      <div class="sales-sheet-header-left">
        <div class="sales-sheet-logo-wrap">
          <img src="${logoUrl}" alt="SKL Trucks LLC" class="sales-sheet-logo" />
        </div>
      </div>
      <div class="sales-sheet-header-center">
        <p class="sales-sheet-company">SKL Trucks LLC</p>
        <p class="sales-sheet-phone">417-434-8669</p>
      </div>
      <div class="sales-sheet-header-right">
        <p class="sales-sheet-address">4000 W 7th St.</p>
        <p class="sales-sheet-address">Joplin, Mo. 64801</p>
      </div>
    </header>
    <div class="sales-sheet-title-row">
      <h1 class="sales-sheet-title">2018 Freightliner M2 - 6month/15,000 miles Engine, Aftertreatment, Trans &amp; Rears Great Financing available!!!</h1>
      <p class="sales-sheet-price">$46,950</p>
    </div>
    <div class="sales-sheet-photo-frame">
      <img class="sales-sheet-photo" src="https://placehold.co/1200x800/png?text=Truck+Photo" alt="Truck" />
    </div>
    <section class="sales-sheet-section">
      <h2>Specifications</h2>
      <dl class="sales-sheet-grid">
        <div class="sales-sheet-row"><dt>Cab Type</dt><dd>Day Cabs</dd></div>
        <div class="sales-sheet-row"><dt>VIN</dt><dd>3ALACWFC4JDJL7861</dd></div>
        <div class="sales-sheet-row"><dt>Year</dt><dd>2018</dd></div>
        <div class="sales-sheet-row"><dt>Manufacturer</dt><dd>Freightliner</dd></div>
        <div class="sales-sheet-row"><dt>Model</dt><dd>M2</dd></div>
        <div class="sales-sheet-row"><dt>Miles</dt><dd>187,168</dd></div>
        <div class="sales-sheet-row"><dt>Condition</dt><dd>Used</dd></div>
      </dl>
    </section>
    <section class="sales-sheet-section">
      <h2>Warranty</h2>
      <dl class="sales-sheet-grid">
        <div class="sales-sheet-row"><dt>Warranty</dt><dd>180 Day/15,000 Mile</dd></div>
      </dl>
    </section>
  </article>
</body>
</html>`;

fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load", timeout: 60000 });
  await page.evaluate(async () => {
    await document.fonts.ready.catch(() => undefined);
    await Promise.all(
      Array.from(document.images).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          })
      )
    );
  });

  const pdf = await page.pdf({
    format: "letter",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    displayHeaderFooter: false,
  });

  const buf = Buffer.from(pdf);
  fs.writeFileSync(outFile, buf);
  // Puppeteer may return Uint8Array — always inspect via Buffer.
  const text = buf.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
  const pageCount = Number((text.match(/\/Count\s+(\d+)/) || [])[1] || 0);
  const hasImage = /\/Subtype\s*\/Image/.test(text);
  const mediaBox = (text.match(/\/MediaBox\s*\[\s*([^\]]+)\]/) || [])[1] || "";
  const ok = pages === 1 && pageCount === 1 && hasImage && buf.length > 1000;
  console.log(
    JSON.stringify(
      { file: outFile, bytes: buf.length, pages, pageCount, hasImage, mediaBox: mediaBox.trim(), ok },
      null,
      2
    )
  );
  if (!ok) process.exit(1);
} finally {
  await browser.close();
}
