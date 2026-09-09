import type { Browser } from "puppeteer-core";

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");

  // Local/dev: system Chrome. Vercel/AWS: bundled Chromium.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import("@sparticuz/chromium");
    // Disable WebGL/swiftshader extraction on serverless (property, not a method).
    chromium.default.setGraphicsMode = false;
    return puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: { width: 1024, height: 1280, deviceScaleFactor: 1 },
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });
  }

  const executablePath =
    process.env.CHROME_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/usr/bin/google-chrome";

  return puppeteer.default.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    defaultViewport: { width: 1024, height: 1280, deviceScaleFactor: 1 },
    executablePath,
    headless: true,
  });
}

/** Render sales-sheet HTML to a one-page US Letter PDF (selectable text). */
export async function renderSalesSheetPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 60_000,
    });

    // Wait for webfonts and images before capturing.
    await page.evaluate(async () => {
      await document.fonts.ready.catch(() => undefined);
      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalWidth > 0) {
                resolve();
                return;
              }
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
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

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
