import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import frames from '../assets/assembly-frames/manifest.json'

gsap.registerPlugin(ScrollTrigger)

const section = document.querySelector('.assembly-sequence')
const viewport = section.querySelector('.assembly-viewport')
const picture = section.querySelector('picture')
const image = section.querySelector('.assembly-frame')
const status = section.querySelector('.assembly-status')
const navigation = section.querySelector('.assembly-navigation')
const title = section.querySelector('.assembly-step')
const description = section.querySelector('.assembly-description')
const progressBar = section.querySelector('.assembly-progress span')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const stages = [
    [0, 'start with the holder', 'One brace holds twelve keys.'],
    [0.1, 'seat the key', 'The key fits into its slot in the brace.'],
    [0.24, 'slide in the wire', 'A 1.1 mm steel wire holds the key in place.'],
    [0.32, 'fit the buttons', 'Two buttons snap onto the same key.'],
    [0.48, 'one octave', 'Six long keys and six short keys share a brace.'],
    [0.66, '48 notes', 'Four complete octaves, with the highest C left out.'],
]
const cache = new Map()
const playhead = { progress: 0 }
let tween
let wanted
let lastStage = -1
let resizeFrame

function frameUrl(frame) {
    const variant = viewport.clientWidth < 600 ? 'narrow' : 'wide'
    return new URL(
        `assets/assembly-frames/${variant}/${String(frame).padStart(
            3,
            '0',
        )}.webp?v=${frames.version}`,
        document.baseURI,
    ).href
}

function loadFrame(frame) {
    const url = frameUrl(frame)
    if (cache.has(url)) return cache.get(url)
    const entry = { image: new Image(), ready: false }
    cache.set(url, entry)
    entry.image.onload = () => {
        entry.ready = true
        if (wanted === url) showFrame(entry, frame)
        // Keep a small decoded working set; the browser caches the compressed files.
        for (const [key, value] of cache) {
            if (cache.size <= 16) break
            if (value.ready && key !== wanted) cache.delete(key)
        }
    }
    entry.image.onerror = () => {
        if (wanted === url) {
            status.textContent =
                'This frame could not load. Try reloading the page, or skip to the instructions below.'
        }
        cache.delete(url)
    }
    entry.image.src = url
    return entry
}

function showFrame(entry, frame) {
    picture.querySelector('source')?.remove()
    if (image.src !== entry.image.src) image.src = entry.image.src
    status.textContent = ''
    section.dataset.frame = String(frame)
    section.dataset.noteCount = String(frames.notes[frame])
}

function render(progress) {
    playhead.progress = progress
    const frame = Math.round(progress * (frames.count - 1))
    wanted = frameUrl(frame)
    const entry = loadFrame(frame)
    if (entry.ready) showFrame(entry, frame)
    // Warm nearby frames without downloading or decoding the whole sequence.
    for (let offset = 1; offset <= 5; offset++) {
        if (frame + offset < frames.count) loadFrame(frame + offset)
        if (frame - offset >= 0) loadFrame(frame - offset)
    }
    let stageIndex = 0
    stages.forEach(([start], index) => {
        if (progress >= start) stageIndex = index
    })
    if (stageIndex !== lastStage) {
        lastStage = stageIndex
        title.textContent = stages[stageIndex][1]
        description.textContent = stages[stageIndex][2]
        navigation.querySelectorAll('button').forEach((button, index) => {
            if (index === stageIndex)
                button.setAttribute('aria-current', 'step')
            else button.removeAttribute('aria-current')
        })
    }
    progressBar.style.transform = `scaleX(${progress})`
    section.dataset.progress = progress.toFixed(4)
}

function setupScroll() {
    tween?.scrollTrigger?.kill()
    tween?.kill()
    if (reducedMotion.matches) {
        render(1)
        return
    }
    playhead.progress = 0
    tween = gsap.to(playhead, {
        progress: 1,
        ease: 'none',
        onUpdate: () => render(playhead.progress),
        scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () =>
                `+=${
                    section.offsetHeight -
                    section.querySelector('.assembly-sticky').offsetHeight
                }`,
            scrub: 0.25,
            invalidateOnRefresh: true,
        },
    })
    render(tween.scrollTrigger.progress)
}

function initialize() {
    section.classList.add('is-ready')
    navigation.hidden = false
    setupScroll()
    reducedMotion.addEventListener('change', setupScroll)
    const resize = () => {
        cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
            ScrollTrigger.refresh()
            render(playhead.progress)
        })
    }
    new ResizeObserver(resize).observe(viewport)
    navigation.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-progress]')
        if (!button) return
        const progress = Number(button.dataset.progress)
        if (reducedMotion.matches) {
            render(progress)
            return
        }
        const trigger = tween.scrollTrigger
        window.scrollTo({
            top: trigger.start + progress * (trigger.end - trigger.start),
            behavior: 'smooth',
        })
    })
}

// A real 3D frame is visible in the HTML before the script loads, even without JS.
// Enhance only after it loads so a failed image never creates a long blank section.
if (image.complete && image.naturalWidth) initialize()
else {
    image.addEventListener('load', initialize, { once: true })
    image.addEventListener(
        'error',
        () => {
            status.textContent =
                'The assembly images could not load. The instructions and finished keyboard are below.'
        },
        { once: true },
    )
}
