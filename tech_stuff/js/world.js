import * as THREE from '../vendor/three.module.js';
import { addCelOutline } from './frog.js';

const CAR_COLORS = [
  0xeef2f7, // Crisp White (frame_06)
  0xb4bcc4, // Silver (frame_01, frame_11)
  0xe86488, // Retro Pink (frame_02, frame_10)
  0xf2a477, // Peach / Orange-Gold (frame_01, frame_10)
  0x576fe6, // Retro Blue (frame_02, frame_12)
  0x7a2b2b, // Maroon / Brick Red (the car kicked into the sky in frame_09!)
  0x484d56  // Dark Slate Grey (frame_05)
];

export class GameWorld {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.cars = [];
    this.logs = [];
    this.particles = [];
    this.updrafts = [];

    this.laneZ = [-7, -13, -19, -25, -31, -37, -43, -49];
    this.logLaneZ = [-76, -87, -98, -109, -120, -131];

    this.buildEnvironment();
    this.spawnTraffic();
    this.spawnRiverLogs();
  }

  buildEnvironment() {
    // 1. Starting Grass Bank (z = 16 to -4)
    const startGrassGeo = new THREE.BoxGeometry(240, 2, 22);
    const grassMat = new THREE.MeshLambertMaterial({ map: this.textures.grass });
    const startGrass = new THREE.Mesh(startGrassGeo, grassMat);
    startGrass.position.set(0, -1, 7);
    startGrass.receiveShadow = true;
    this.scene.add(startGrass);

    // 2. 8-Lane Super-Highway (z = -4 to -52)
    const roadGeo = new THREE.PlaneGeometry(240, 48);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshLambertMaterial({ map: this.textures.highway });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0.01, -28);
    road.receiveShadow = true;
    this.scene.add(road);

    // 3. Middle Grass Median before River (z = -52 to -67)
    const midGrassGeo = new THREE.BoxGeometry(240, 2, 15);
    const midGrass = new THREE.Mesh(midGrassGeo, grassMat);
    midGrass.position.set(0, -1, -59.5);
    midGrass.receiveShadow = true;
    this.scene.add(midGrass);

    // 4. Stepped Brown Voxel Riverbanks (matches thumb.jpg & frame_18!)
    const bankMat = new THREE.MeshLambertMaterial({ map: this.textures.dirtBank });
    for (let i = 0; i < 28; i++) {
      const bx = -110 + i * 8 + (i % 2) * 1.5;
      const bw = 6 + (i % 3) * 2;
      const bz = 2.5 + (i % 2) * 1.8;

      const nearStep = new THREE.Mesh(new THREE.BoxGeometry(bw, 2.6, bz), bankMat);
      nearStep.position.set(bx, -1.1, -67.5 - (i % 2) * 0.8);
      this.scene.add(nearStep);

      const farStep = new THREE.Mesh(new THREE.BoxGeometry(bw, 2.6, bz), bankMat);
      farStep.position.set(bx, -1.1, -137.5 + (i % 2) * 0.8);
      this.scene.add(farStep);
    }

    // 5. Wide Animated Blue River (z = -67 to -138)
    const waterGeo = new THREE.PlaneGeometry(240, 72);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshBasicMaterial({ map: this.textures.water });
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh.position.set(0, -0.85, -102.5);
    this.scene.add(this.waterMesh);

    // 6. Far Grass Shore & Forest Goal Zone (z = -138 to -188)
    const farGrassGeo = new THREE.BoxGeometry(240, 2, 50);
    const farGrass = new THREE.Mesh(farGrassGeo, grassMat);
    farGrass.position.set(0, -1, -163);
    farGrass.receiveShadow = true;
    this.scene.add(farGrass);

    // Side Grass Shoulders (left x < -75 for the highway tree line in frame_05!)
    const leftGrassGeo = new THREE.BoxGeometry(60, 2, 210);
    const leftGrass = new THREE.Mesh(leftGrassGeo, grassMat);
    leftGrass.position.set(-102, -0.98, -85);
    this.scene.add(leftGrass);

    // 7. Retro Forest Trees (Left Highway Edge like frame_05 + Far River Shore like frame_27-28)
    this.buildForests();
  }

  buildForests() {
    const trunkMat = new THREE.MeshLambertMaterial({ map: this.textures.bark });
    const leafMat1 = new THREE.MeshLambertMaterial({ color: 0x16850e });
    const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x22a816 });

    const createTree = (x, z, scale = 1) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * scale, 0.65 * scale, 5.2 * scale, 6), trunkMat);
      trunk.position.y = 2.6 * scale;
      tree.add(trunk);

      const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6 * scale, 0), leafMat1);
      crown1.position.y = 5.8 * scale;
      tree.add(crown1);

      const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1 * scale, 0), leafMat2);
      crown2.position.set(0.4 * scale, 7.2 * scale, -0.3 * scale);
      tree.add(crown2);

      this.scene.add(tree);
    };

    // Left Highway Forest Line (visible in frame_05 - frame_10 when camera looks down -X!)
    for (let z = 8; z >= -64; z -= 4.2) {
      createTree(-76 - Math.abs(Math.sin(z)) * 3, z, 1.05 + (Math.abs(z) % 3) * 0.15);
      createTree(-83 - Math.abs(Math.cos(z)) * 4, z - 1.5, 1.25);
    }

    // Far Shore Forest (visible across the river in frame_16 - frame_29!)
    for (let x = -85; x <= 85; x += 4.5) {
      const jitterZ = Math.sin(x * 1.7) * 2.2;
      createTree(x, -150 + jitterZ, 1.1 + (Math.abs(x) % 4) * 0.12);
      createTree(x + 2.1, -157 - jitterZ, 1.3);
      createTree(x - 1.2, -165 + jitterZ, 1.4);
    }
  }

  createRetroCarMesh(colorHex) {
    const carGroup = new THREE.Group();

    const bodyMat = new THREE.MeshToonMaterial({ color: colorHex });
    const cabinMat = new THREE.MeshToonMaterial({
      color: new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.22)
    });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x222c3a });
    const bumperMat = new THREE.MeshBasicMaterial({ color: 0x1a1c20 });
    const lightFrontMat = new THREE.MeshBasicMaterial({ color: 0xfff8b8 });
    const lightRearMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });

    // Lower sedan body (length along X = 4.6, height = 0.88, width along Z = 2.2)
    const lowerGeo = new THREE.BoxGeometry(4.6, 0.88, 2.2);
    const lowerMesh = new THREE.Mesh(lowerGeo, bodyMat);
    lowerMesh.position.y = 0.72;
    lowerMesh.castShadow = true;
    addCelOutline(lowerMesh, 0.045);
    carGroup.add(lowerMesh);

    // Sloped greenhouse cabin
    const cabinGeo = new THREE.BoxGeometry(2.55, 0.72, 1.88);
    const pos = cabinGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        pos.setX(i, pos.getX(i) * 0.78);
        pos.setZ(i, pos.getZ(i) * 0.88);
      }
    }
    cabinGeo.computeVertexNormals();
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.set(-0.15, 1.44, 0);
    cabinMesh.castShadow = true;
    addCelOutline(cabinMesh, 0.045);
    carGroup.add(cabinMesh);

    // Front & rear windshields
    const windshieldGeo = new THREE.BoxGeometry(2.62, 0.52, 1.72);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(-0.15, 1.42, 0);
    carGroup.add(windshield);

    // Bumpers & headlights
    const frontGrill = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 2.05), bumperMat);
    frontGrill.position.set(2.3, 0.62, 0);
    carGroup.add(frontGrill);

    const headlights = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.88), lightFrontMat);
    headlights.position.set(2.31, 0.82, 0);
    carGroup.add(headlights);

    const taillights = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.88), lightRearMat);
    taillights.position.set(-2.31, 0.82, 0);
    carGroup.add(taillights);

    // 4 Retro Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
    wheelGeo.rotateX(Math.PI / 2);
    for (const wx of [-1.42, 1.42]) {
      for (const wz of [-1.05, 1.05]) {
        const wheel = new THREE.Mesh(wheelGeo, bumperMat);
        wheel.position.set(wx, 0.42, wz);
        carGroup.add(wheel);
      }
    }

    return carGroup;
  }

  spawnTraffic() {
    // 8 lanes of lively highway traffic (In video 00:04-00:12, cars drive toward +X while frog runs toward -X!)
    this.laneZ.forEach((z, laneIdx) => {
      // Most lanes flow toward +X (so when looking down -X like frame_05, oncoming traffic rushes straight at you!)
      const dir = laneIdx % 4 === 0 ? -1 : 1;
      const baseSpeed = 13.5 + (laneIdx % 3) * 3.5;
      const carCount = 6;
      const spacing = 150 / carCount;

      for (let i = 0; i < carCount; i++) {
        const color = CAR_COLORS[(laneIdx * 3 + i) % CAR_COLORS.length];
        const mesh = this.createRetroCarMesh(color);
        const startX = -75 + i * spacing + (laneIdx % 2) * 5;
        mesh.position.set(startX, 0, z);
        if (dir < 0) {
          mesh.rotation.y = Math.PI;
        }
        this.scene.add(mesh);

        this.cars.push({
          mesh,
          laneIdx,
          baseZ: z,
          dir,
          speed: baseSpeed + (i % 2) * 1.4,
          flying: false,
          vel: new THREE.Vector3(),
          angVel: new THREE.Vector3(),
          respawnTimer: 0
        });
      }
    });
  }

  spawnRiverLogs() {
    const logSideMat = new THREE.MeshLambertMaterial({ map: this.textures.bark });
    const logEndMat = new THREE.MeshLambertMaterial({ map: this.textures.logEnd });
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0033aa,
      transparent: true,
      opacity: 0.72
    });

    this.logLaneZ.forEach((z, rowIdx) => {
      const dir = rowIdx % 2 === 0 ? 1 : -1;
      const speed = 4.2 + (rowIdx % 3) * 1.4;
      const count = 4;
      const spacing = 140 / count;

      for (let i = 0; i < count; i++) {
        const length = 14 + (i % 2) * 3;
        const radius = 1.65;

        const logGroup = new THREE.Group();
        const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 10);
        cylGeo.rotateZ(Math.PI / 2);

        const logMesh = new THREE.Mesh(cylGeo, [logSideMat, logEndMat, logEndMat]);
        logMesh.position.y = -0.15;
        addCelOutline(logMesh, 0.035);
        logGroup.add(logMesh);

        // Distinct dark-blue directional water shadow under each log (matches frame_21 & frame_23!)
        const shadowGeo = new THREE.PlaneGeometry(length + 1.2, radius * 2.5);
        shadowGeo.rotateX(-Math.PI / 2);
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.position.set(-1.1, -0.81, 1.3);
        logGroup.add(shadowMesh);

        // Small dark knot/stump detail on the right end of logs (like frame_23.jpg!)
        const knotGeo = new THREE.BoxGeometry(0.9, 0.85, 0.85);
        const knot = new THREE.Mesh(knotGeo, new THREE.MeshBasicMaterial({ color: 0x1e1108 }));
        knot.position.set(length * 0.34, radius * 0.75, 0.25);
        logGroup.add(knot);

        const startX = -65 + i * spacing + (rowIdx % 2) * 8;
        logGroup.position.set(startX, 0, z);
        this.scene.add(logGroup);

        this.logs.push({
          mesh: logGroup,
          rowIdx,
          z,
          dir,
          speed,
          length,
          radius
        });
      }
    });
  }

  spawnImpactBurst(position, colorHex = 0xffdd44, count = 18) {
    for (let i = 0; i < count; i++) {
      const size = 0.22 + Math.random() * 0.35;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? colorHex : 0xffffff })
      );
      mesh.position.copy(position);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const spd = 6 + Math.random() * 14;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * spd,
          5 + Math.random() * 12,
          Math.sin(angle) * spd
        ),
        life: 0.55 + Math.random() * 0.35
      });
    }
  }

  // Launch a car flying and tumbling into the air when kicked ("ORYAA! / UWAHH!", frame_09 & frame_10!)
  launchCar(car, kickOrigin) {
    car.flying = true;
    car.respawnTimer = 3.6;

    const pushDir = new THREE.Vector3()
      .subVectors(car.mesh.position, kickOrigin)
      .setY(0)
      .normalize();
    if (pushDir.lengthSq() < 0.01) pushDir.set(-1, 0, -0.3).normalize();

    car.vel.set(
      pushDir.x * 22 + (Math.random() - 0.5) * 8,
      21 + Math.random() * 5,
      pushDir.z * 16 - 6
    );
    car.angVel.set(
      5.5 + Math.random() * 4,
      3.5 + Math.random() * 4,
      6.5 + Math.random() * 4
    );

    this.spawnImpactBurst(car.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xffaa22, 24);
  }

  update(dt) {
    // Scroll river water texture for lively current
    this.textures.water.offset.x = (this.textures.water.offset.x - dt * 0.35) % 1;
    this.textures.water.offset.y = (this.textures.water.offset.y + dt * 0.08) % 1;

    // Update highway traffic & flying kicked cars
    for (const car of this.cars) {
      if (car.flying) {
        car.mesh.position.addScaledVector(car.vel, dt);
        car.vel.y -= 34 * dt; // Gravity
        car.mesh.rotation.x += car.angVel.x * dt;
        car.mesh.rotation.y += car.angVel.y * dt;
        car.mesh.rotation.z += car.angVel.z * dt;

        // Bounce once if hitting the highway asphalt
        if (car.mesh.position.y < 0.5 && car.vel.y < 0) {
          car.mesh.position.y = 0.5;
          car.vel.y *= -0.45;
          this.spawnImpactBurst(car.mesh.position, 0xff8800, 8);
        }

        car.respawnTimer -= dt;
        if (car.respawnTimer <= 0) {
          car.flying = false;
          car.mesh.position.set(car.dir > 0 ? -78 : 78, 0, car.baseZ);
          car.mesh.rotation.set(0, car.dir > 0 ? 0 : Math.PI, 0);
        }
      } else {
        car.mesh.position.x += car.dir * car.speed * dt;
        if (car.dir > 0 && car.mesh.position.x > 78) {
          car.mesh.position.x = -78;
        } else if (car.dir < 0 && car.mesh.position.x < -78) {
          car.mesh.position.x = 78;
        }
      }
    }

    // Update floating river logs
    for (const log of this.logs) {
      log.mesh.position.x += log.dir * log.speed * dt;
      // Gentle buoyancy bob
      log.mesh.position.y = Math.sin(performance.now() * 0.003 + log.rowIdx) * 0.06;
      if (log.dir > 0 && log.mesh.position.x > 75) {
        log.mesh.position.x = -75;
      } else if (log.dir < 0 && log.mesh.position.x < -75) {
        log.mesh.position.x = 75;
      }
    }

    // Update explosion / dust particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.y -= 24 * dt;
        p.mesh.scale.setScalar(Math.max(0.01, p.life * 1.5));
      }
    }
  }
}
