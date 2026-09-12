import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import frames from '../assets/assembly-frames/manifest.json'
import { stages } from './assembly-stages.js'

gsap.registerPlugin(ScrollTrigger)

const section = document.querySelector('.assembly-sequence')
const viewport = section.querySelector('.assembly-viewport')
const picture = section.querySelector('picture')
const image = section.querySelector('.assembly-frame')
const status = section.querySelector('.assembly-status')
const navigation = section.querySelector('.assembly-navigation')
const title = section.querySelector('.assembly-step')
const description = section.querySelector('.assembly-description')
const progressSegments = [
    ...section.querySelectorAll('.assembly-progress span'),
]
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
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
    updateTimeline(frame / (frames.count - 1))
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
    section.dataset.progress = progress.toFixed(4)
}

// The caption, highlight and progress segments follow the displayed frame,
// so they cannot run ahead while a new image is still loading.
function updateTimeline(progress) {
    let stageIndex = 0
    stages.forEach(([start], index) => {
        if (progress >= start) stageIndex = index
        const end = stages[index + 1]?.[0] ?? 1
        const filled = gsap.utils.clamp(
            0,
            1,
            (progress - start) / (end - start),
        )
        progressSegments[index].style.setProperty('--progress', String(filled))
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
    // Expanding the animation must not move a previously selected section away.
    const destination = document.getElementById(location.hash.slice(1))
    if (destination && document.querySelector('main').contains(destination)) {
        requestAnimationFrame(() => {
            ScrollTrigger.refresh()
            destination.scrollIntoView({ behavior: 'instant', block: 'start' })
        })
    }
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
