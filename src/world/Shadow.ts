// A soft blob contact-shadow laid flat on the road, so an object reads as
// grounded instead of floating above a flat-lit surface. One shared texture +
// material (never disposed); the plane geometry disposes with its parent tile.

import * as THREE from 'three'

let _tex: THREE.Texture | null = null
let _mat: THREE.MeshBasicMaterial | null = null

export function blobShadow(halfW: number, halfL: number): THREE.Mesh {
  if (!_tex) {
    const s = 64
    const cv = document.createElement('canvas')
    cv.width = cv.height = s
    const ctx = cv.getContext('2d')!
    const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(0,0,0,0.55)')
    grad.addColorStop(0.65, 'rgba(0,0,0,0.25)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, s, s)
    _tex = new THREE.CanvasTexture(cv)
    _mat = new THREE.MeshBasicMaterial({
      map: _tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    })
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfL * 2), _mat!)
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  m.renderOrder = -1
  return m
}
