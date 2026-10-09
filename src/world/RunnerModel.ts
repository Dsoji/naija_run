// Loads the rigged runner GLB (Quaternius "Animated Base Character", CC-BY —
// see CREDITS.md) and drives its skeletal animations from the player's state.
// Loading is async; the Player shows the procedural humanoid until this resolves,
// then swaps it in. If the load fails, the procedural figure stays.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { blobShadow } from './Shadow'

export type RunnerClip = 'run' | 'jump' | 'slide' | 'dead' | 'idle'

export interface RunnerModel {
  root: THREE.Group
  update(dt: number): void
  play(clip: RunnerClip): void
}

// Our clip names → the GLB's clip names.
const CLIP_MAP: Record<RunnerClip, string> = {
  run: 'Rig|Sprint_Loop',
  jump: 'Rig|Jump_Loop',
  slide: 'Rig|Roll',
  dead: 'Rig|Death01',
  idle: 'Rig|Idle_Loop',
}

export function loadRunnerModel(url: string): Promise<RunnerModel> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const model = gltf.scene
        // Super Eagles green kit: tint the main body material.
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.frustumCulled = false
          const paint = (mat: THREE.Material) => {
            const s = mat as THREE.MeshStandardMaterial
            if (s.name === 'M_Main') s.color.setHex(0x16a34a)
          }
          const mat = mesh.material as THREE.Material | THREE.Material[]
          Array.isArray(mat) ? mat.forEach(paint) : paint(mat)
        })

        const root = new THREE.Group()
        root.add(model)
        root.add(blobShadow(0.5, 0.5))

        const mixer = new THREE.AnimationMixer(model)
        const actions: Partial<Record<RunnerClip, THREE.AnimationAction>> = {}
        for (const key of Object.keys(CLIP_MAP) as RunnerClip[]) {
          const clip = gltf.animations.find((c) => c.name === CLIP_MAP[key])
          if (clip) actions[key] = mixer.clipAction(clip)
        }

        let current: RunnerClip | null = null
        const play = (clip: RunnerClip): void => {
          if (clip === current) return
          const next = actions[clip]
          if (!next) return
          const prev = current ? actions[current] : undefined
          if (clip === 'dead') {
            next.setLoop(THREE.LoopOnce, 1)
            next.clampWhenFinished = true
          }
          next.reset().fadeIn(0.15).play()
          if (prev) prev.fadeOut(0.15)
          current = clip
        }

        resolve({ root, update: (dt) => mixer.update(dt), play })
      },
      undefined,
      reject,
    )
  })
}
