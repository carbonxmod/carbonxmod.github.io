import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Illustrative Oxygen49 Mk III housing, sized to the existing CAD keybed.
// Exterior only: this is not a mechanical model of the controller's internals.
export async function createOxygenHousing() {
    const housing = new THREE.Group()
    const originalKeys = new THREE.Group()
    housing.add(originalKeys)
    const material = (color) =>
        new THREE.MeshLambertMaterial({ color, flatShading: true })
    const shell = material(0x272c2f)
    const dark = material(0x363a3b)
    const white = material(0xd8d9d7)
    function box(parent, size, position, finish, radius = 1) {
        const mesh = new THREE.Mesh(
            new RoundedBoxGeometry(...size, 2, radius),
            finish,
        )
        mesh.position.set(...position)
        mesh.receiveShadow = true
        parent.add(mesh)
        return mesh
    }
    // Narrow cheeks and controls across the rear match assets/keyboard.svg.
    const base = box(housing, [720, 10, 300], [324, -31, 30], shell, 5)
    box(housing, [720, 36, 126], [324, -5, -57], shell, 5)
    box(housing, [24, 44, 174], [-24, -1, 93], shell, 3)
    box(housing, [24, 44, 174], [672, -1, 93], shell, 3)
    box(housing, [672, 10, 8], [324, -23, 176], shell, 2)
    const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(base.geometry, 30),
        new THREE.LineBasicMaterial({ color: 0x596163 }),
    )
    base.add(outline)
    // Reuse the SVG's exact control artwork instead of imitating physical knobs.
    const response = await fetch(
        new URL('assets/keyboard.svg', document.baseURI),
    )
    if (!response.ok) throw new Error('Cannot load keyboard artwork')
    const svg = await response.text()
    const controls =
        svg.slice(0, svg.indexOf('    <mask id="bodyMask">')) +
        svg.slice(
            svg.indexOf('    <use href="#wheel"'),
            svg.indexOf('    <mask id="keysMask">'),
        ) +
        '</svg>'
    const texture = await new THREE.TextureLoader().loadAsync(
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(controls),
    )
    texture.colorSpace = THREE.SRGBColorSpace
    const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(730, 300),
        new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
        }),
    )
    panel.rotation.x = -Math.PI / 2
    panel.position.set(324, 14, 30)
    housing.add(panel)
    const pitch = 648 / 28
    for (let i = 0; i < 29; i++) {
        box(originalKeys, [pitch - 1, 13, 151], [i * pitch + 5, 13, 91], white)
        if (i < 28 && ![2, 6].includes(i % 7)) {
            box(
                originalKeys,
                [12, 14, 88],
                [i * pitch + pitch / 2 + 5, 25, 59],
                dark,
            )
        }
    }
    originalKeys.traverse((object) => {
        if (object.isMesh) object.castShadow = true
    })
    const top = new THREE.Group()
    for (const child of [...housing.children]) {
        if (child !== originalKeys && child !== base) top.add(child)
    }
    housing.add(top)
    return { housing, originalKeys, bottom: base, top }
}
