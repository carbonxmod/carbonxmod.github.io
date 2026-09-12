import * as THREE from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { createOxygenHousing } from './oxygen-housing.js'
import { stages } from './assembly-stages.js'

const section = document.querySelector('.assembly-sequence')
const viewport = section.querySelector('.assembly-viewport')
const canvas = section.querySelector('canvas')
const status = section.querySelector('.assembly-status')
const title = section.querySelector('.assembly-step')
const description = section.querySelector('.assembly-description')
const navigation = section.querySelector('.assembly-navigation')
const progressBar = section.querySelector('.assembly-progress span')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

const clamp = THREE.MathUtils.clamp
const mix = THREE.MathUtils.lerp
const interval = (progress, start, end) =>
    THREE.MathUtils.smoothstep(progress, start, end)
const asset = (path) => new URL(path, document.baseURI).href

async function initialize() {
    status.textContent = 'Loading the parts…'
    let renderer
    let scrollFrame = 0
    let resizeObserver
    let disposed = false
    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
        })
        renderer.setPixelRatio(
            Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2),
        )
        renderer.setClearColor(0x202427, 1)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.3
        renderer.shadowMap.enabled = innerWidth >= 700
        renderer.shadowMap.type = THREE.PCFSoftShadowMap

        const loader = new STLLoader()
        const names = ['brace', 'key_long', 'key_short', 'button']
        const [placementResponse, ...loaded] = await Promise.all([
            fetch(asset('assets/assembly-placements.json')),
            ...names.map((name) =>
                loader.loadAsync(asset(`files/preview/${name}.stl`)),
            ),
        ])
        if (!placementResponse.ok)
            throw new Error('Cannot load assembly placements')
        const placements = await placementResponse.json()
        const geometries = Object.fromEntries(
            names.map((name, i) => [name, loaded[i]]),
        )
        const scene = new THREE.Scene()
        const camera = new THREE.OrthographicCamera(
            -200,
            200,
            150,
            -150,
            0.1,
            2500,
        )
        const model = new THREE.Group()
        scene.add(model)
        const { housing, originalKeys, bottom, top } =
            await createOxygenHousing()
        scene.add(housing)
        // Composite the fully opaque keyboard once, then fade that whole layer.
        // Per-material opacity exposes overlapping shells and keys during entry.
        const fadeTarget = new THREE.WebGLRenderTarget(1, 1)
        fadeTarget.texture.colorSpace = THREE.SRGBColorSpace
        const fadeScene = new THREE.Scene()
        const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const fadeMaterial = new THREE.MeshBasicMaterial({
            map: fadeTarget.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        })
        const fadeQuad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            fadeMaterial,
        )
        fadeScene.add(fadeQuad)

        scene.add(new THREE.HemisphereLight(0xf0f5f1, 0x45504d, 2.4))
        const keyLight = new THREE.DirectionalLight(0xfff6e9, 3.2)
        keyLight.position.set(-120, 350, 200)
        keyLight.target.position.set(250, 0, 80)
        keyLight.castShadow = true
        keyLight.shadow.mapSize.set(2048, 2048)
        Object.assign(keyLight.shadow.camera, {
            left: -500,
            right: 500,
            top: 320,
            bottom: -320,
            near: 1,
            far: 1200,
        })
        keyLight.shadow.bias = -0.0002
        keyLight.shadow.normalBias = 0.15
        scene.add(keyLight, keyLight.target)
        const rim = new THREE.DirectionalLight(0xd0e2ec, 2.4)
        rim.position.set(450, 130, -160)
        scene.add(rim)

        const surface = new THREE.Mesh(
            new THREE.PlaneGeometry(2400, 1800),
            new THREE.ShadowMaterial({ color: 0x090d0e, opacity: 0.24 }),
        )
        surface.rotation.x = -Math.PI / 2
        surface.position.set(330, -26, 70)
        surface.receiveShadow = true
        scene.add(surface)

        const material = (color, metalness = 0, roughness = 0.65) =>
            new THREE.MeshStandardMaterial({ color, metalness, roughness })
        const palette = {
            brace: material(0x687775, 0.12),
            key: material(0xb5c0bb, 0.06),
            white: material(0xe7e8df, 0.04, 0.4),
            black: material(0x252a2b, 0.04, 0.4),
            wire: material(0xc6d2d1, 0.8, 0.3),
        }
        const parts = []
        const blackNotes = new Set([1, 3, 6, 8, 10])
        const addPart = (geometry, baseMaterial, data) => {
            const mesh = new THREE.Mesh(geometry, baseMaterial.clone())
            mesh.castShadow = true
            mesh.receiveShadow = true
            mesh.material.transparent = true
            mesh.userData = data
            mesh.position.copy(data.home)
            model.add(mesh)
            parts.push(mesh)
            return mesh
        }

        // The CAD contains one octave. Repeat its original transforms at 162 mm.
        for (let octave = 0; octave < 4; octave++) {
            for (const part of placements.parts) {
                const note = part.note === null ? null : octave * 12 + part.note
                const home = new THREE.Vector3(...part.position)
                home.x += octave * placements.octavePitch
                const baseMaterial =
                    part.kind === 'brace'
                        ? palette.brace
                        : part.kind === 'button'
                        ? blackNotes.has(note % 12)
                            ? palette.black
                            : palette.white
                        : palette.key
                addPart(geometries[part.kind], baseMaterial, {
                    kind: part.kind,
                    note,
                    octave,
                    home,
                    // Front and rear buttons fit in sequence in the close-up.
                    buttonOrder:
                        part.kind === 'button' && part.position[2] < -40
                            ? 0
                            : 1,
                })
            }
        }
        const wireGeometry = new THREE.CylinderGeometry(0.55, 0.55, 163, 12)
        wireGeometry.rotateZ(Math.PI / 2)
        for (let octave = 0; octave < 4; octave++) {
            addPart(wireGeometry, palette.wire, {
                kind: 'wire',
                note: null,
                octave,
                home: new THREE.Vector3(
                    octave * 162 + 81.5,
                    placements.pivot[1],
                    placements.pivot[2],
                ),
            })
        }

        let lastStage = -1
        let width = 1
        let height = 1
        const lookAt = new THREE.Vector3()
        const cameraOffset = new THREE.Vector3()
        const progressFromScroll = () => {
            if (reducedMotion.matches) return 1
            const bounds = section.getBoundingClientRect()
            return clamp(
                -bounds.top /
                    Math.max(
                        1,
                        section.offsetHeight -
                            section.querySelector('.assembly-sticky')
                                .offsetHeight,
                    ),
                0,
                1,
            )
        }

        function screenBounds(objects) {
            const bounds = new THREE.Box3()
            for (const object of objects) {
                const box = new THREE.Box3().setFromObject(object)
                for (const x of [box.min.x, box.max.x])
                    for (const y of [box.min.y, box.max.y])
                        for (const z of [box.min.z, box.max.z])
                            bounds.expandByPoint(
                                new THREE.Vector3(x, y, z).applyMatrix4(
                                    camera.matrixWorldInverse,
                                ),
                            )
            }
            return bounds
        }

        function update(timeline, paint = true) {
            if (disposed) return
            const progress = Math.min(timeline, 1)
            // Once the housing arrives, only its actual surfaces receive shadows.
            surface.visible = timeline <= 1
            renderer.shadowMap.enabled = width >= 700 || timeline > 1
            const reveal = interval(timeline, 1, 1.07)
            const cameraReveal = interval(timeline, 0.92, 1.2)
            const pullback = cameraReveal * (1 - interval(timeline, 1.32, 1.5))
            const close = interval(timeline, 1.44, 1.5)
            const open = interval(timeline, 1.07, 1.16) * (1 - close)
            const remove = interval(timeline, 1.18, 1.3)
            const fit = interval(timeline, 1.32, 1.44)
            top.position.y = 90 * open
            bottom.position.set(324, -31 - 120 * open, 30)
            housing.visible = timeline > 1
            housing.position.set(0, -180 * (1 - reveal), 260 * (1 - reveal))
            originalKeys.visible = remove < 1
            let visibleNotes = 0
            const visibleParts = { brace: 0, key: 0, wire: 0, button: 0 }
            for (const mesh of parts) {
                const data = mesh.userData
                let settled = 1
                let opacity = 1
                let lift = 0
                let slide = 0
                if (
                    data.octave === 0 &&
                    (data.note === 0 || data.note === null)
                ) {
                    if (data.kind === 'brace') {
                        settled = interval(progress, 0, 0.1)
                        slide = -130 * (1 - settled)
                        lift = 14 * (1 - settled)
                        opacity = interval(progress, 0, 0.035)
                    } else if (data.kind.startsWith('key')) {
                        settled = interval(progress, 0.1, 0.24)
                        lift = 100 * (1 - settled)
                        opacity = interval(progress, 0.1, 0.125)
                    } else if (data.kind === 'wire') {
                        settled = interval(progress, 0.24, 0.32)
                        // Withdraw the pin while adding the other keys, then refit it.
                        if (progress >= 0.46) {
                            settled =
                                progress < 0.5
                                    ? 1 - interval(progress, 0.46, 0.5)
                                    : interval(progress, 0.63, 0.66)
                        }
                        slide = -185 * (1 - settled)
                        opacity = interval(progress, 0.24, 0.265)
                    } else {
                        const start = 0.32 + data.buttonOrder * 0.07
                        settled = interval(progress, start, start + 0.06)
                        lift = (112 + data.buttonOrder * 30) * (1 - settled)
                        opacity = interval(progress, start, start + 0.02)
                    }
                } else {
                    const start =
                        data.kind === 'wire'
                            ? 0.67 +
                              ((data.octave * 12 + 11 - 12) / 35) * 0.2 +
                              0.085
                            : data.note === null
                            ? 0.66 + (data.octave - 1) * 0.055
                            : data.note < 12
                            ? 0.48 + (data.note - 1) * 0.006
                            : 0.67 + ((data.note - 12) / 35) * 0.2
                    const delay = data.kind === 'button' ? 0.035 : 0
                    settled = interval(
                        progress,
                        start + delay,
                        start + delay + (data.kind === 'wire' ? 0.03 : 0.085),
                    )
                    opacity = interval(
                        progress,
                        start + delay,
                        start + delay + 0.025,
                    )
                    lift =
                        (data.kind === 'button'
                            ? 92
                            : data.kind === 'brace'
                            ? -35
                            : 65) *
                        (1 - settled)
                    if (data.kind === 'wire') {
                        slide = -60 * (1 - settled)
                        lift = 0
                    }
                }
                mesh.visible = opacity > 0.001
                mesh.material.opacity = opacity
                mesh.material.depthWrite = opacity > 0.95
                mesh.position.copy(data.home)
                mesh.position.y += lift
                mesh.position.x += slide
                if (data.kind.startsWith('key') && mesh.visible) visibleNotes++
                if (mesh.visible) {
                    visibleParts[
                        data.kind.startsWith('key') ? 'key' : data.kind
                    ]++
                }
            }

            const octaveView = interval(progress, 0.44, 0.62)
            const fullView = interval(progress, 0.61, 0.98)
            const mobile = width < 600
            lookAt.set(
                mix(mix(45, 81, octaveView), 324, fullView),
                mix(50, 7, interval(progress, 0.25, 0.62)),
                86,
            )
            cameraOffset.set(
                mix(170, 65, fullView),
                mix(155, 380, fullView),
                mix(260, 430, fullView),
            )
            // Continue the opening camera drift through the swap without
            // flipping the model or changing the portrait orientation.
            const drift = interval(timeline, 1, 1.5)
            cameraOffset.applyAxisAngle(
                new THREE.Vector3(0, 1, 0),
                0.16 * drift,
            )
            cameraOffset.y += 28 * drift
            lookAt.lerp(new THREE.Vector3(275, 85, 40), cameraReveal)
            lookAt.y -= 50 * pullback
            camera.position.copy(lookAt).add(cameraOffset)
            camera.up.set(0, 1, 0)
            camera.lookAt(lookAt)
            if (mobile) camera.rotateZ((-Math.PI / 2) * fullView)
            // Follow screen-up so the slides stay vertical in portrait framing too.
            const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
                camera.quaternion,
            )
            originalKeys.position.copy(screenUp).multiplyScalar(-950 * remove)
            model.position.set(0, 0, 0)
            camera.updateMatrixWorld(true)
            scene.updateMatrixWorld(true)
            let composition
            const waiting = reveal * (1 - fit)
            if (timeline > 1) {
                const shellBounds = new THREE.Box3().setFromObject(top)
                const keyBounds = new THREE.Box3().setFromObject(model)
                // Park behind the rear edge with a generous gap, then slide forward.
                const distance = Math.max(
                    0,
                    keyBounds.max.z - shellBounds.min.z + 160,
                )
                model.position.z = -distance * waiting
                composition = screenBounds([top, bottom, model])
            }
            section.dataset.swap = JSON.stringify({
                housing: housing.visible,
                originalKeys: originalKeys.visible,
                lift: model.position.y,
                bottomOpen: open,
                installed: fit,
                slide: model.position.x,
            })
            const aspect = width / height
            const closeHeight = Math.max(280, 305 / aspect)
            const farHeight = mobile
                ? Math.max(790, 280 / aspect)
                : Math.max(320, 790 / aspect)
            let viewHeight =
                180 * pullback +
                mix(
                    mix(closeHeight, farHeight, fullView),
                    mobile ? 1250 : Math.max(620, 1100 / aspect),
                    cameraReveal,
                )
            if (composition) {
                const size = composition.getSize(new THREE.Vector3())
                const center = composition.getCenter(new THREE.Vector3())
                const offset = new THREE.Vector3(center.x, center.y, 0)
                    .applyQuaternion(camera.quaternion)
                    .multiplyScalar(mobile ? reveal : waiting)
                camera.position.add(offset)
                lookAt.add(offset)
                viewHeight = mix(
                    viewHeight,
                    Math.max(
                        viewHeight,
                        size.y * 1.18,
                        (size.x / aspect) * 1.18,
                    ),
                    pullback,
                )
            }
            // Anticipate the entrance and settle after it instead of tracking
            // the housing's shorter movement exactly.
            viewHeight *= 1 + 0.18 * pullback
            camera.left = (-viewHeight * aspect) / 2
            camera.right = (viewHeight * aspect) / 2
            camera.top = viewHeight / 2
            camera.bottom = -viewHeight / 2
            camera.updateProjectionMatrix()
            if (paint) {
                if (reveal > 0 && reveal < 1) {
                    const size = renderer.getDrawingBufferSize(
                        new THREE.Vector2(),
                    )
                    fadeTarget.setSize(size.x, size.y)
                    model.visible = surface.visible = false
                    renderer.setRenderTarget(fadeTarget)
                    renderer.setClearColor(0x202427, 0)
                    renderer.render(scene, camera)
                    renderer.setRenderTarget(null)
                    renderer.setClearColor(0x202427, 1)
                    model.visible = true
                    surface.visible = false
                    housing.visible = false
                    renderer.render(scene, camera)
                    fadeMaterial.opacity = reveal
                    renderer.autoClear = false
                    renderer.render(fadeScene, fadeCamera)
                    renderer.autoClear = true
                    housing.visible = true
                } else renderer.render(scene, camera)
            }

            const stageIndex = stages.findLastIndex(
                ([start]) => timeline / 1.5 >= start,
            )
            if (stageIndex !== lastStage) {
                lastStage = stageIndex
                title.textContent = stages[stageIndex][1]
                description.textContent = stages[stageIndex][2]
                navigation
                    .querySelectorAll('button')
                    .forEach((button, index) => {
                        if (index === stageIndex)
                            button.setAttribute('aria-current', 'step')
                        else button.removeAttribute('aria-current')
                    })
            }
            progressBar.style.transform = `scaleX(${progress})`
            section.dataset.progress = progress.toFixed(4)
            section.dataset.noteCount = String(visibleNotes)
            section.dataset.partCounts = JSON.stringify(visibleParts)
        }

        function schedule() {
            if (disposed || scrollFrame || reducedMotion.matches) return
            scrollFrame = requestAnimationFrame(() => {
                scrollFrame = 0
                const bounds = section.getBoundingClientRect()
                if (bounds.bottom < 0 || bounds.top > innerHeight) return
                update(progressFromScroll())
            })
        }
        function resize() {
            width = viewport.clientWidth
            height = viewport.clientHeight
            if (!width || !height) return
            renderer.setSize(width, height, false)
            update(progressFromScroll())
        }

        section.classList.add('is-ready')
        navigation.hidden = false
        status.textContent = ''
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(viewport)
        window.addEventListener('scroll', schedule, { passive: true })
        reducedMotion.addEventListener('change', resize)
        navigation.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-progress]')
            if (!button) return
            const progress = Number(button.dataset.progress)
            if (reducedMotion.matches) {
                update(progress)
                return
            }
            const top = section.getBoundingClientRect().top + scrollY
            const distance =
                section.offsetHeight -
                section.querySelector('.assembly-sticky').offsetHeight
            window.scrollTo({
                top: top + progress * distance,
                behavior: 'smooth',
            })
        })
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            dispose()
            status.textContent =
                'The 3D view is unavailable. The finished keyboard is shown below.'
        })
        function dispose() {
            disposed = true
            cancelAnimationFrame(scrollFrame)
            window.removeEventListener('scroll', schedule)
            reducedMotion.removeEventListener('change', resize)
            resizeObserver?.disconnect()
            section.classList.remove('is-ready')
            navigation.hidden = true
            Object.values(geometries).forEach((geometry) => geometry.dispose())
            wireGeometry.dispose()
            parts.forEach((mesh) => mesh.material.dispose())
            Object.values(palette).forEach((entry) => entry.dispose())
            surface.geometry.dispose()
            surface.material.dispose()
            fadeTarget.dispose()
            fadeMaterial.dispose()
            fadeQuad.geometry.dispose()
            renderer.dispose()
        }
        resize()
        // Build-time renderer only; the public page uses the generated frames.
        window.renderAssemblyFrame = update
    } catch (error) {
        disposed = true
        renderer?.dispose()
        section.classList.remove('is-ready')
        navigation.hidden = true
        status.textContent =
            'The 3D view is unavailable. The finished keyboard is shown below.'
        console.warn('Assembly preview:', error)
    }
}

// Load the meshes only as the section approaches the viewport.
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
        (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect()
                initialize()
            }
        },
        { rootMargin: '1200px' },
    )
    observer.observe(section)
} else {
    initialize()
}
