import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const frames = JSON.parse(
    await readFile(
        resolve(root, 'assets/assembly-frames/manifest.json'),
        'utf8',
    ),
)
assert.deepEqual(frames.parts[0], { brace: 0, key: 0, wire: 0, button: 0 })
assert.deepEqual(frames.parts[6], { brace: 1, key: 0, wire: 0, button: 0 })
assert.deepEqual(frames.parts[24], { brace: 1, key: 1, wire: 0, button: 0 })
assert.deepEqual(frames.parts[42], { brace: 1, key: 1, wire: 1, button: 1 })
assert.deepEqual(frames.parts[54], { brace: 1, key: 1, wire: 1, button: 2 })
const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
}
const server = createServer(async (request, response) => {
    try {
        const path = new URL(request.url, 'http://localhost').pathname
        const file = resolve(root, path === '/' ? 'index.html' : `.${path}`)
        if (!file.startsWith(`${root}/`)) throw new Error('Invalid path')
        response.setHeader(
            'Content-Type',
            types[extname(file)] || 'application/octet-stream',
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
    args: ['--no-sandbox', '--disable-webgl'],
})
const url = `http://127.0.0.1:${server.address().port}/`
try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    await page.locator('.assembly-sequence.is-ready').waitFor()
    assert.ok(
        await page
            .locator('.assembly-sequence')
            .evaluate(
                (s) =>
                    s.compareDocumentPosition(document.querySelector('main')) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ),
    )
    async function seek(progress) {
        await page.evaluate((p) => {
            const s = document.querySelector('.assembly-sequence')
            scrollTo({
                top:
                    s.getBoundingClientRect().top +
                    scrollY +
                    p *
                        (s.offsetHeight -
                            s.querySelector('.assembly-sticky').offsetHeight),
                behavior: 'instant',
            })
        }, progress)
        await page.waitForFunction((p) => {
            const s = document.querySelector('.assembly-sequence')
            return (
                Math.abs(Number(s.dataset.progress) - p) < 0.002 &&
                Number(s.dataset.frame) === Math.round(p * 120)
            )
        }, progress)
    }
    async function checkTimeline() {
        const state = await page.locator('.assembly-sequence').evaluate((s) => {
            const buttons = [
                ...s.querySelectorAll('.assembly-navigation button'),
            ]
            const segments = [...s.querySelectorAll('.assembly-progress span')]
            return {
                frame: Number(s.dataset.frame),
                active: buttons.findIndex(
                    (button) => button.getAttribute('aria-current') === 'step',
                ),
                fills: segments.map((segment) =>
                    Number(segment.style.getPropertyValue('--progress')),
                ),
                aligned: segments.every((segment, index) => {
                    const track = segment.getBoundingClientRect()
                    const label = buttons[index].getBoundingClientRect()
                    return (
                        Math.abs(track.left - label.left) < 1 &&
                        Math.abs(track.width - label.width) < 1
                    )
                }),
            }
        })
        const progress = state.frame / 120
        const starts = [0, 0.1, 0.24, 0.32, 0.46, 0.66]
        assert.equal(
            state.active,
            starts.findLastIndex((start) => progress >= start),
        )
        assert.ok(state.aligned)
        starts.forEach((start, index) => {
            const expected = Math.max(
                0,
                Math.min(
                    1,
                    (progress - start) / ((starts[index + 1] ?? 1) - start),
                ),
            )
            assert.ok(Math.abs(state.fills[index] - expected) < 0.00001)
        })
    }
    // Both sides of every transition, going forward and backward.
    const boundaries = [0, 11, 12, 28, 29, 38, 39, 55, 56, 79, 80, 120]
    for (const frame of [...boundaries, ...boundaries.toReversed()]) {
        await seek(frame / 120)
        await checkTimeline()
    }
    for (const [progress, notes] of [
        [0, 0],
        [0.05, 0],
        [0.2, 1],
        [0.65, 12],
        [1, 48],
        [0, 0],
    ]) {
        await seek(progress)
        assert.equal(
            Number(
                await page
                    .locator('.assembly-sequence')
                    .getAttribute('data-note-count'),
            ),
            notes,
        )
        assert.ok(
            await page
                .locator('.assembly-sticky')
                .evaluate((s) => Math.abs(s.getBoundingClientRect().top) < 2),
        )
    }
    await page.mouse.wheel(0, 700)
    await page.waitForFunction(
        () =>
            Number(document.querySelector('.assembly-sequence').dataset.frame) >
            5,
    )
    assert.ok(
        await page
            .locator('.assembly-sticky')
            .evaluate((s) => Math.abs(s.getBoundingClientRect().top) < 2),
    )
    await page.locator('.assembly-navigation button').nth(2).focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(
        () =>
            document.querySelector('.assembly-step').textContent ===
            'slide in the wire',
    )
    for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 568 },
        { width: 844, height: 390 },
    ]) {
        await page.setViewportSize(viewport)
        await seek(1)
        await checkTimeline()
        assert.ok(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        )
        assert.ok(
            await page
                .locator('.assembly-frame')
                .evaluate(
                    (img) =>
                        img.complete &&
                        img.naturalWidth > 0 &&
                        img.getBoundingClientRect().height > 100,
                ),
        )
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(
        () => document.querySelector('.assembly-sequence').offsetHeight < 1000,
    )
    await page.locator('.assembly-navigation button').first().click()
    await page.waitForFunction(
        () =>
            document.querySelector('.assembly-sequence').dataset.frame === '10',
    )
    await page.locator('.assembly-skip').click()
    assert.equal(new URL(page.url()).hash, '#overview')

    const noJs = await browser.newPage({ javaScriptEnabled: false })
    await noJs.goto(url)
    assert.ok(
        await noJs
            .locator('.assembly-frame')
            .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    assert.equal(await noJs.locator('.assembly-navigation').isVisible(), false)

    const localFile = await browser.newPage()
    await localFile.goto(pathToFileURL(resolve(root, 'index.html')).href)
    await localFile.locator('.assembly-sequence.is-ready').waitFor()
    await localFile.locator('.assembly-navigation button').last().click()
    await localFile.waitForFunction(
        () =>
            document.querySelector('.assembly-sequence').dataset.frame ===
            '120',
    )
    assert.ok(
        await localFile
            .locator('.assembly-frame')
            .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    assert.deepEqual(errors, [])

    // A slow frame must not let the highlight run ahead of the visible image.
    const delayed = await browser.newPage({
        reducedMotion: 'reduce',
        viewport: { width: 1440, height: 1000 },
    })
    let releaseFrame
    const gate = new Promise((resolve) => {
        releaseFrame = resolve
    })
    await delayed.route('**/wide/024.webp*', async (route) => {
        await gate
        await route.continue()
    })
    try {
        await delayed.goto(url)
        await delayed.locator('.assembly-sequence.is-ready').waitFor()
        await delayed.locator('.assembly-navigation button').first().click()
        await delayed.waitForFunction(
            () =>
                document.querySelector('.assembly-sequence').dataset.frame ===
                '10',
        )
        await delayed.locator('.assembly-navigation button').nth(1).click()
        await delayed.waitForFunction(
            () =>
                document.querySelector('.assembly-sequence').dataset
                    .progress === '0.2000',
        )
        assert.equal(
            await delayed
                .locator('.assembly-sequence')
                .getAttribute('data-frame'),
            '10',
        )
        assert.equal(
            await delayed
                .locator('.assembly-navigation button[aria-current]')
                .textContent()
                .then((text) => text.trim()),
            'brace',
        )
        releaseFrame()
        await delayed.waitForFunction(
            () =>
                document.querySelector('.assembly-sequence').dataset.frame ===
                '24',
        )
        assert.equal(
            await delayed
                .locator('.assembly-navigation button[aria-current]')
                .textContent()
                .then((text) => text.trim()),
            'key',
        )
    } finally {
        releaseFrame()
        await delayed.close()
    }
    console.log(
        'Passed: stage boundaries in both directions, aligned progress segments, delayed-frame highlights, WebGL disabled, pinned scrolling, 48 notes, keyboard controls, mobile/landscape, reduced motion, no JS, and file:// preview.',
    )
} finally {
    await browser.close()
    await new Promise((done) => server.close(done))
}
