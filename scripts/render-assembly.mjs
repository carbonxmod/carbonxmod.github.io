import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile, copyFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { extname, resolve } from 'node:path'

// Render the original CAD/STL assembly once, not on visitors' GPUs.
const root = resolve(import.meta.dirname, '..')
const bundle = await build({
    entryPoints: [resolve(root, 'src/assembly-scene.js')],
    bundle: true,
    write: false,
    format: 'iife',
})
const server = createServer(async (request, response) => {
    try {
        const path = new URL(request.url, 'http://localhost').pathname
        if (path === '/__render.js') {
            response.setHeader('Content-Type', 'text/javascript')
            response.end(bundle.outputFiles[0].text)
            return
        }
        if (path === '/') {
            response.setHeader('Content-Type', 'text/html')
            response.end(`<!doctype html><html><head><style>
                *{box-sizing:border-box}body{margin:0;background:#202427}
                .assembly-sticky,.assembly-viewport,canvas{width:100vw;height:100vh}
                canvas{display:block}.assembly-navigation,.assembly-status{display:none}
            </style></head><body>
                <section class="assembly-sequence"><div class="assembly-sticky">
                    <div class="assembly-viewport"><canvas></canvas></div>
                    <p class="assembly-step"></p><p class="assembly-description"></p>
                    <div class="assembly-navigation"><div class="assembly-progress"><span></span></div></div>
                    <p class="assembly-status"></p>
                </div></section><script src="/__render.js"></script>
            </body></html>`)
            return
        }
        const file = resolve(root, `.${path}`)
        if (!file.startsWith(`${root}/`)) throw new Error('Invalid path')
        response.setHeader(
            'Content-Type',
            extname(file) === '.json'
                ? 'application/json'
                : 'application/octet-stream',
        )
        response.end(await readFile(file))
    } catch {
        response.writeHead(404).end()
    }
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const count = 181
const notes = []
const parts = []
const swaps = []
const version = createHash('sha256')
    .update(bundle.outputFiles[0].text)
    .digest('hex')
    .slice(0, 12)
try {
    for (const [variant, width, height] of [
        ['wide', 1200, 800],
        ['narrow', 480, 720],
    ]) {
        const directory = resolve(root, 'assets/assembly-frames', variant)
        await mkdir(directory, { recursive: true })
        const page = await browser.newPage({ viewport: { width, height } })
        await page.goto(`http://127.0.0.1:${server.address().port}/`)
        await page.waitForFunction(
            () => typeof window.renderAssemblyFrame === 'function',
        )
        for (let frame = 0; frame < count; frame++) {
            const target = resolve(
                directory,
                `${String(frame).padStart(3, '0')}.webp`,
            )
            // Opt-in resume is only for interrupted renders with unchanged scene geometry.
            const cached =
                process.env.ASSEMBLY_RESUME === '1' &&
                (await access(target).then(
                    () => true,
                    () => false,
                ))
            const result = await page.evaluate(
                ({ progress, cached }) => {
                    window.renderAssemblyFrame(progress, !cached)
                    return {
                        image: cached
                            ? null
                            : document
                                  .querySelector('canvas')
                                  .toDataURL('image/webp', 0.86),
                        notes: Number(
                            document.querySelector('.assembly-sequence').dataset
                                .noteCount,
                        ),
                        swap: JSON.parse(
                            document.querySelector('.assembly-sequence').dataset
                                .swap,
                        ),
                        parts: JSON.parse(
                            document.querySelector('.assembly-sequence').dataset
                                .partCounts,
                        ),
                    }
                },
                { progress: frame / 120, cached },
            )
            if (!cached)
                await writeFile(
                    target,
                    Buffer.from(result.image.split(',')[1], 'base64'),
                )
            if (variant === 'wide') {
                notes.push(result.notes)
                parts.push(result.parts)
                swaps.push(result.swap)
            }
            if (frame % 30 === 0)
                console.log(`${variant}: ${frame}/${count - 1}`)
        }
        // Without JS, show a completed note instead of the empty first frame.
        await copyFile(
            resolve(directory, '056.webp'),
            resolve(directory, 'poster.webp'),
        )
        await page.close()
    }
    await writeFile(
        resolve(root, 'assets/assembly-frames/manifest.json'),
        `${JSON.stringify({ count, version, notes, parts, swaps })}\n`,
    )
} finally {
    await browser.close()
    await new Promise((done) => server.close(done))
}
