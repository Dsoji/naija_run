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

// Kit colours (sRGB). Skin: a warm dark brown; Super Eagles green jersey with
// white cuffs, white shorts, green socks, black boots with white soles.
const KIT = {
  skin: 0x6b4226,
  hair: 0x16110d,
  jersey: 0x118a3e,
  trim: 0xf4f4f0,
  shorts: 0xf4f4f0,
  socks: 0x118a3e,
  boots: 0x161616,
  sole: 0xe8e8e8,
}

/** One material for the whole runner that picks a colour per body region from
 *  the BIND-POSE position (the `position` attribute before skinning), so the
 *  kit stays put as the rig animates. The mesh is a T-pose, Z-up: height runs
 *  along z, the arms stretch out along x. */
function kitMaterial(bind: THREE.Box3): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 })
  const c = (h: number) => new THREE.Color(h) // → linear working space
  const u = {
    uZ0: { value: bind.min.z },
    uZH: { value: bind.max.z - bind.min.z },
    uXH: { value: Math.max(Math.abs(bind.min.x), Math.abs(bind.max.x)) },
    uSkin: { value: c(KIT.skin) },
    uHair: { value: c(KIT.hair) },
    uJersey: { value: c(KIT.jersey) },
    uTrim: { value: c(KIT.trim) },
    uShorts: { value: c(KIT.shorts) },
    uSocks: { value: c(KIT.socks) },
    uBoots: { value: c(KIT.boots) },
    uSole: { value: c(KIT.sole) },
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vBind;
         uniform float uZ0, uZH, uXH;
         uniform vec3 uSkin, uHair, uJersey, uTrim, uShorts, uSocks, uBoots, uSole;`,
      )
      .replace(
        '#include <color_fragment>',
        `{
           float h = (vBind.z - uZ0) / uZH;   // 0 at the soles, 1 at the crown
           float ax = abs(vBind.x) / uXH;     // 0 on the centre line, 1 at the fingertips
           vec3 col;
           if (ax > 0.2 && h > 0.6) {
             // Arms (stretched out in the T-pose): short sleeves, then skin.
             col = ax < 0.315 ? uJersey : ax < 0.34 ? uTrim : uSkin; // white cuffs
           } else if (h < 0.012) col = uSole;
           else if (h < 0.06) col = uBoots;
           else if (h < 0.27) col = uSocks;
           else if (h < 0.33) col = uSkin;     // knees
           else if (h < 0.52) col = uShorts;
           else if (h < 0.81) col = uJersey;
           else if (h < 0.85 && ax > 0.075) col = uJersey; // shoulder tops
           else if (h < 0.935) col = uSkin;    // neck + face
           else col = uHair;
           diffuseColor.rgb = col;
         }`,
      )
  }
  mat.customProgramCacheKey = () => 'naija-runner-kit'
  return mat
}

export function loadRunnerModel(url: string): Promise<RunnerModel> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const model = gltf.scene
        // Dress the mannequin: skin, hair and a Super Eagles-style kit, painted
        // by body region in its bind pose (so the clothes move with the rig).
        let bounds: THREE.Box3 | null = null
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.geometry.computeBoundingBox()
          const bb = mesh.geometry.boundingBox!
          bounds = bounds ? bounds.union(bb) : bb.clone()
        })
        const kit = kitMaterial(bounds ?? new THREE.Box3(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 1.8)))
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.frustumCulled = false
          mesh.material = kit
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
