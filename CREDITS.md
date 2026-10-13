# Credits — third-party assets

## 3D models

- **Runner character** — "Animated Base Character" by **Quaternius**.
  License: **CC BY** (Creative Commons Attribution).
  Source: https://poly.pizza/m/cwYvO5UauX · https://quaternius.com
  Used for the player runner (`public/models/naija-runner.glb`).
  The runner uses the model's bundled skeletal animations (Sprint / Jump / Roll /
  Death) via `THREE.AnimationMixer`.
  **Modified:** unused animation clips were removed to shrink the file
  (45 → 7 clips: Sprint, Jump Start/Loop/Land, Roll, Death, Idle; 2.2 MB → 0.9 MB).
  Mesh, rig and the kept animations are unchanged. In game it is recoloured by
  a shader (skin, hair, green/white football kit); the file's materials are not edited.

### Vehicles (poly.pizza)

- **Police car** by **Quaternius** — **CC0**. Source: https://poly.pizza/m/BwwnUrWGmV
  (`public/models/police.glb`), used for the police-assist escort car.
- **Car** by **Quaternius** — **CC0**. Source: https://poly.pizza/m/unqqkULtRU
  (`public/models/car.glb`), used for parked kerbside cars.
- **Okada / motorbike** by **jeremy** — **CC BY**. Source: https://poly.pizza/m/0lBe-ApqJs4
  (`public/models/okada.glb`), used for parked kerbside okada.

The remaining scenery (buildings, danfo, keke, taxi, NPCs, pedestrians, pickups,
bridge/market assets) is original procedural geometry built in code.

Attribution is also shown in-game on the start screen.
