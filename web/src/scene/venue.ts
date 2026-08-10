/**
 * The building around the ring: lighting rig, truss, crowd and haze.
 *
 * Wrestling light comes from directly overhead — a hard key on the truss, with
 * everything else filling in from the sides. That single fact does most of the
 * work in making a render read as a wrestling arena rather than a gym, so the
 * key sits high and near-vertical and is the only light casting a real shadow.
 *
 * The crowd is a textured cylinder, not geometry. At the distance the camera
 * keeps it survives as a dark speckled mass that flashes occasionally, and
 * spending polygons on it would buy nothing the player can see.
 */

import * as THREE from "three";

import type { ArenaLook } from "./arena";
import type { QualitySettings } from "./quality";
import { crowdTexture } from "./ringTextures";

export interface Venue {
  group: THREE.Group;
  /** Camera-mounted lamp — the caller parents this to the camera. */
  lamp: THREE.DirectionalLight;
  key: THREE.DirectionalLight;
  /** Drives crowd flash and truss shimmer. */
  update(elapsed: number, intensity: number): void;
  dispose(): void;
}

const TRUSS_RADIUS = 9.5;
const TRUSS_HEIGHT = 12.5;

export function buildVenue(look: ArenaLook, settings: QualitySettings): Venue {
  const group = new THREE.Group();
  group.name = "venue";
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // ------------------------------------------------------------- ambient
  const hemi = new THREE.HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity);
  hemi.name = "venue_hemi";
  group.add(hemi);

  // ------------------------------------------------------------- key light
  // Near-vertical and hard. This is the one that says "wrestling".
  const key = new THREE.DirectionalLight(look.keyLight.color, look.keyLight.intensity);
  key.position.set(...look.keyLight.position);
  key.castShadow = settings.shadows;
  if (settings.shadows) {
    key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 46;
    const extent = 9;
    key.shadow.camera.left = -extent;
    key.shadow.camera.right = extent;
    key.shadow.camera.top = extent;
    key.shadow.camera.bottom = -extent;
    // Overhead light on a near-flat canvas is the classic acne case.
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.022;
  }
  key.name = "venue_key";
  group.add(key);
  group.add(key.target);

  const fill = new THREE.DirectionalLight(look.fill.color, look.fill.intensity);
  fill.position.set(...look.fill.position);
  fill.name = "venue_fill";
  group.add(fill);

  // Parented to the camera by the caller so the near wrestler never falls into
  // full silhouette during a spotlight-lit finish.
  const lamp = new THREE.DirectionalLight(look.lamp.color, look.lamp.intensity);
  lamp.name = "venue_lamp";

  // ----------------------------------------------------------------- truss
  const trussMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6, metalness: 0.7 }),
  );
  const trussGeo = track(new THREE.TorusGeometry(TRUSS_RADIUS, 0.13, 8, 48));
  const trussRing = new THREE.Mesh(trussGeo, trussMat);
  trussRing.rotation.x = Math.PI / 2;
  trussRing.position.y = TRUSS_HEIGHT;
  trussRing.name = "truss";
  group.add(trussRing);

  const lampBodyGeo = track(new THREE.CylinderGeometry(0.16, 0.26, 0.42, 10));

  /**
   * Beam cone, authored to point along +Z with its apex at the origin.
   *
   * A default cone stands on its base with its apex at +Y, which is no use for
   * a light beam: it has to hang from the lamp and widen toward the ring. So
   * the geometry is moved apex-to-origin and swung onto +Z, which is the axis
   * `Object3D.lookAt` aligns for a non-camera. Orienting the mesh instead of
   * the geometry is what turned these into flat grey wedges.
   */
  const beamLength = Math.hypot(TRUSS_RADIUS, TRUSS_HEIGHT - 1);
  const beamGeo = track(new THREE.ConeGeometry(2.4, beamLength, 24, 1, true));
  beamGeo.translate(0, -beamLength / 2, 0);
  beamGeo.rotateX(-Math.PI / 2);

  const spots: THREE.SpotLight[] = [];
  const beams: THREE.Mesh[] = [];
  for (const [i, lampSpec] of look.truss.entries()) {
    const x = Math.cos(lampSpec.angle) * TRUSS_RADIUS;
    const z = Math.sin(lampSpec.angle) * TRUSS_RADIUS;

    const body = new THREE.Mesh(lampBodyGeo, trussMat);
    body.position.set(x, TRUSS_HEIGHT - 0.3, z);
    body.lookAt(0, 1, 0);
    body.rotateX(Math.PI / 2);
    body.name = `truss_lamp_${i}`;
    group.add(body);

    const spot = new THREE.SpotLight(
      lampSpec.color,
      lampSpec.intensity,
      34,
      Math.PI / 7,
      0.45,
      1.4,
    );
    spot.position.set(x, TRUSS_HEIGHT - 0.5, z);
    spot.target.position.set(0, 1, 0);
    spot.castShadow = false;
    spot.name = `truss_spot_${i}`;
    group.add(spot);
    group.add(spot.target);
    spots.push(spot);

    // Beam volume caught in the haze. Additive, depth-write off, and always
    // cheap — it is the difference between "lit" and "an arena".
    if (look.shaft.opacity > 0.02 && settings.lightShafts) {
      const beamMat = track(
        new THREE.MeshBasicMaterial({
          color: lampSpec.color,
          transparent: true,
          opacity: look.shaft.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(x, TRUSS_HEIGHT - 0.6, z);
      beam.lookAt(0, 1, 0);
      beam.renderOrder = 2;
      beam.name = `truss_beam_${i}`;
      group.add(beam);
      beams.push(beam);
    }
  }

  // ----------------------------------------------------------------- crowd
  const crowdMap = track(crowdTexture(look.crowd.base, look.crowd.accent, look.crowd.density));
  crowdMap.repeat.set(6, 1);
  const crowdMat = track(
    new THREE.MeshBasicMaterial({
      map: crowdMap,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      toneMapped: true,
    }),
  );
  const crowdGeo = track(new THREE.CylinderGeometry(19, 15, 11, 48, 1, true));
  const crowd = new THREE.Mesh(crowdGeo, crowdMat);
  crowd.position.y = 4.4;
  crowd.name = "crowd";
  group.add(crowd);

  // Dark ceiling so the camera never sees out of the building.
  const ceilingMat = track(new THREE.MeshBasicMaterial({ color: look.background, side: THREE.BackSide }));
  const ceiling = new THREE.Mesh(track(new THREE.SphereGeometry(24, 24, 12)), ceilingMat);
  ceiling.name = "arena_shell";
  group.add(ceiling);

  const baseIntensities = spots.map((s) => s.intensity);
  const baseBeamOpacity = beams.map((b) => (b.material as THREE.MeshBasicMaterial).opacity);

  return {
    group,
    lamp,
    key,
    update(elapsed: number, intensity: number) {
      // Crowd flash: sparse camera pops, scaled by how hot the match is.
      const flash = look.crowd.flash * intensity;
      if (flash > 0.01) {
        const pulse = Math.max(0, Math.sin(elapsed * 3.1) * Math.sin(elapsed * 7.7));
        crowdMat.opacity = 0.9 + pulse * flash * 0.1;
      }
      // Truss shimmer so the rig never looks like a still frame.
      for (const [i, spot] of spots.entries()) {
        spot.intensity = baseIntensities[i] * (0.97 + Math.sin(elapsed * 1.7 + i) * 0.03);
      }
      for (const [i, beam] of beams.entries()) {
        const mat = beam.material as THREE.MeshBasicMaterial;
        mat.opacity = baseBeamOpacity[i] * (0.86 + Math.sin(elapsed * 2.3 + i * 1.7) * 0.14);
      }
    },
    dispose() {
      for (const item of disposables) item.dispose();
      group.removeFromParent();
    },
  };
}
