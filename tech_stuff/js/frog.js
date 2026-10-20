import * as THREE from '../vendor/three.module.js';

// Helper to add a crisp black inverted-hull cel-shaded outline to any mesh (matches the video's thick black outline!)
export function addCelOutline(mesh, thickness = 0.055) {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x090b08,
    side: THREE.BackSide
  });
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  outlineMesh.scale.setScalar(1 + thickness);
  mesh.add(outlineMesh);
  return outlineMesh;
}

export class HeroFrog {
  constructor(textures) {
    this.group = new THREE.Group();

    // Pivot inside group for full-body flips, rolls, and spin kicks
    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.y = 1.05;
    this.group.add(this.bodyPivot);

    const skinMat = new THREE.MeshToonMaterial({
      map: textures.frogSkin
    });
    const bellyMat = new THREE.MeshToonMaterial({
      color: 0xd9ff66
    });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // --- TORSO (Sculpted muscular amphibian torso) ---
    const torsoGeo = new THREE.SphereGeometry(0.62, 12, 10);
    torsoGeo.scale(1.05, 1.18, 0.82);
    this.torso = new THREE.Mesh(torsoGeo, skinMat);
    this.torso.castShadow = true;
    addCelOutline(this.torso, 0.07);
    this.bodyPivot.add(this.torso);

    // Lighter belly patch
    const bellyGeo = new THREE.SphereGeometry(0.52, 10, 8);
    bellyGeo.scale(0.95, 1.05, 0.65);
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(0, -0.03, -0.22);
    this.torso.add(belly);

    // --- HEAD (Bulging frog head + eyes seamlessly integrated at top of torso) ---
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.62, -0.08);
    this.torso.add(this.headGroup);

    const headGeo = new THREE.SphereGeometry(0.46, 10, 8);
    headGeo.scale(1.22, 0.72, 1.08);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.castShadow = true;
    addCelOutline(headMesh, 0.07);
    this.headGroup.add(headMesh);

    // Bulging frog eye domes
    for (const side of [-1, 1]) {
      const eyeBumpGeo = new THREE.SphereGeometry(0.18, 8, 8);
      const eyeBump = new THREE.Mesh(eyeBumpGeo, skinMat);
      eyeBump.position.set(side * 0.32, 0.22, -0.1);
      addCelOutline(eyeBump, 0.08);
      this.headGroup.add(eyeBump);

      const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eyeWhiteMat);
      eyeball.position.set(0, 0.03, -0.09);
      eyeBump.add(eyeball);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), pupilMat);
      pupil.position.set(0, 0.01, -0.08);
      eyeball.add(pupil);
    }

    // --- ARTICULATED ARMS (Shoulders -> Upper Arm -> Forearm -> Webbed Hand) ---
    this.leftArm = this.createLimb(skinMat, 0.16, 0.56, 0.14, 0.52, true);
    this.leftArm.root.position.set(-0.62, 0.36, 0);
    this.torso.add(this.leftArm.root);

    this.rightArm = this.createLimb(skinMat, 0.16, 0.56, 0.14, 0.52, true);
    this.rightArm.root.position.set(0.62, 0.36, 0);
    this.torso.add(this.rightArm.root);

    // --- ARTICULATED LEGS (Hips -> Muscular Thigh -> Calf -> Webbed Frog Foot) ---
    this.leftLeg = this.createLimb(skinMat, 0.21, 0.62, 0.16, 0.58, false);
    this.leftLeg.root.position.set(-0.36, -0.55, 0);
    this.torso.add(this.leftLeg.root);

    this.rightLeg = this.createLimb(skinMat, 0.21, 0.62, 0.16, 0.58, false);
    this.rightLeg.root.position.set(0.36, -0.55, 0);
    this.torso.add(this.rightLeg.root);

    // --- SPIN-KICK SHOCKWAVE RING (Visible during "ORYAA! / UWAHH!" kick) ---
    const ringGeo = new THREE.RingGeometry(0.9, 2.35, 20);
    ringGeo.rotateX(-Math.PI / 2);
    this.kickShockwave = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffaa,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0
      })
    );
    this.kickShockwave.position.y = 1.0;
    this.group.add(this.kickShockwave);

    // --- BOTW PARAGLIDER RIG (Matches frame_23.jpg & thumb.jpg!) ---
    this.gliderGroup = new THREE.Group();
    this.gliderGroup.position.set(0, 2.25, 0);
    this.gliderGroup.visible = false;
    this.group.add(this.gliderGroup);

    this.buildParaglider(textures.gliderCanopy);

    // Animation state
    this.state = 'CROUCH'; // 'CROUCH' | 'HOP' | 'RUN' | 'ROLL' | 'KICK' | 'FLIP' | 'GLIDE' | 'VICTORY'
    this.animTime = 0;
    this.actionTimer = 0;
    this.actionDuration = 0;
    this.stanceMode = 'CLASSIC'; // 'CLASSIC' or 'ACTION'
    this.invincibleTimer = 0;
  }

  createLimb(material, upperRadius, upperLen, lowerRadius, lowerLen, isArm) {
    const root = new THREE.Group();

    const upperGeo = new THREE.CapsuleGeometry(upperRadius, upperLen, 6, 8);
    upperGeo.translate(0, -upperLen * 0.5, 0);
    const upperMesh = new THREE.Mesh(upperGeo, material);
    upperMesh.castShadow = true;
    addCelOutline(upperMesh, 0.08);
    root.add(upperMesh);

    const elbow = new THREE.Group();
    elbow.position.set(0, -upperLen - upperRadius * 0.4, 0);
    root.add(elbow);

    const lowerGeo = new THREE.CapsuleGeometry(lowerRadius, lowerLen, 6, 8);
    lowerGeo.translate(0, -lowerLen * 0.5, 0);
    const lowerMesh = new THREE.Mesh(lowerGeo, material);
    lowerMesh.castShadow = true;
    addCelOutline(lowerMesh, 0.08);
    elbow.add(lowerMesh);

    // Hand or Webbed Foot
    const extremityGeo = isArm
      ? new THREE.SphereGeometry(lowerRadius * 1.25, 6, 6)
      : new THREE.BoxGeometry(0.32, 0.14, 0.52);
    if (!isArm) {
      extremityGeo.translate(0, -0.05, -0.14);
    }
    const extremity = new THREE.Mesh(extremityGeo, material);
    extremity.position.set(0, -lowerLen - lowerRadius * 0.3, 0);
    extremity.castShadow = true;
    addCelOutline(extremity, 0.08);
    elbow.add(extremity);

    return { root, elbow, extremity };
  }

  buildParaglider(canopyTex) {
    const barMat = new THREE.MeshToonMaterial({ color: 0x5c6975 });

    // Triangular trapeze handlebar frame (matches the exact triangle bar in frame_23.jpg!)
    const barRadius = 0.065;
    // Horizontal grip bar
    const gripGeo = new THREE.CylinderGeometry(barRadius, barRadius, 1.32, 8);
    gripGeo.rotateZ(Math.PI / 2);
    const gripBar = new THREE.Mesh(gripGeo, barMat);
    addCelOutline(gripBar, 0.18);
    this.gliderGroup.add(gripBar);

    // Left & right angled struts meeting at apex
    for (const side of [-1, 1]) {
      const strutGeo = new THREE.CylinderGeometry(barRadius, barRadius, 1.28, 8);
      const strut = new THREE.Mesh(strutGeo, barMat);
      strut.position.set(side * 0.33, 0.52, 0);
      strut.rotation.z = side * 0.54;
      addCelOutline(strut, 0.18);
      this.gliderGroup.add(strut);
    }

    // Swept aerodynamic BOTW Canopy above the apex
    const canopyGroup = new THREE.Group();
    canopyGroup.position.set(0, 1.12, 0.05);
    this.gliderGroup.add(canopyGroup);

    // Curved wing geometry (wide swept trapezoid with camber)
    const canopyGeo = new THREE.BoxGeometry(4.2, 0.14, 2.25, 8, 1, 4);
    const pos = canopyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      // Taper trailing edge slightly like the trapezoid in frame_23.jpg
      const zNorm = (vz + 1.125) / 2.25; // 0 front, 1 back
      const taper = 1.0 - zNorm * 0.25;
      // Slight upward dihedral curve
      const arch = Math.cos((vx / 2.1) * 1.1) * 0.22;
      pos.setXYZ(i, vx * taper, vy + arch, vz);
    }
    canopyGeo.computeVertexNormals();

    const canopyMat = new THREE.MeshToonMaterial({
      map: canopyTex
    });
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
    canopyMesh.castShadow = true;
    addCelOutline(canopyMesh, 0.045);
    canopyGroup.add(canopyMesh);
  }

  resetLimbs() {
    this.bodyPivot.rotation.set(0, 0, 0);
    this.bodyPivot.position.set(0, 1.05, 0);
    this.torso.rotation.set(0, 0, 0);
    this.torso.scale.set(1, 1, 1);

    this.leftArm.root.rotation.set(0, 0, 0);
    this.leftArm.elbow.rotation.set(0, 0, 0);
    this.rightArm.root.rotation.set(0, 0, 0);
    this.rightArm.elbow.rotation.set(0, 0, 0);

    this.leftLeg.root.rotation.set(0, 0, 0);
    this.leftLeg.elbow.rotation.set(0, 0, 0);
    this.rightLeg.root.rotation.set(0, 0, 0);
    this.rightLeg.elbow.rotation.set(0, 0, 0);

    this.gliderGroup.visible = false;
    this.kickShockwave.material.opacity = 0;
  }

  update(dt, moveSpeed, isGrounded, bankAngle = 0) {
    this.animTime += dt;
    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    }

    this.resetLimbs();

    if (this.state === 'GLIDE') {
      // --- BOTW PARAGLIDER HANG POSE (Exact match to frame_23.jpg & thumb.jpg!) ---
      this.gliderGroup.visible = true;
      this.gliderGroup.rotation.z = THREE.MathUtils.lerp(this.gliderGroup.rotation.z, -bankAngle * 0.45, 0.15);
      this.gliderGroup.rotation.x = 0.08;

      // Position torso hanging beneath the triangle bar
      this.bodyPivot.position.y = 1.02 + Math.sin(this.animTime * 4.5) * 0.04;
      this.bodyPivot.rotation.z = -bankAngle * 0.35;
      this.torso.rotation.x = 0.08;

      // Both arms raised straight up holding the horizontal triangle bar ends
      this.leftArm.root.rotation.set(Math.PI * 0.96, 0, 0.08);
      this.leftArm.elbow.rotation.set(0.12, 0, 0);
      this.rightArm.root.rotation.set(Math.PI * 0.96, 0, -0.08);
      this.rightArm.elbow.rotation.set(0.12, 0, 0);

      // Legs dangling with knees slightly bent outward (frog hang silhouette!)
      const sway = Math.sin(this.animTime * 5.0) * 0.08;
      this.leftLeg.root.rotation.set(-0.25 + sway, 0, 0.22);
      this.leftLeg.elbow.rotation.set(0.55, 0, -0.15);
      this.rightLeg.root.rotation.set(-0.25 - sway, 0, -0.22);
      this.rightLeg.elbow.rotation.set(0.55, 0, 0.15);
      return;
    }

    if (this.state === 'ROLL') {
      // --- DARK SOULS DODGE ROLL (Full 360 forward tucked somersault, frame_05 - frame_06) ---
      const progress = Math.min(1, this.actionTimer / Math.max(0.01, this.actionDuration));
      this.bodyPivot.position.y = 0.75 + Math.sin(progress * Math.PI) * 0.35;
      // Forward somersault rotation (-Z is forward in local frog space)
      this.bodyPivot.rotation.x = -progress * Math.PI * 2;

      // Tuck limbs tightly into a ball
      this.torso.rotation.x = -0.5;
      this.leftArm.root.rotation.set(-1.3, 0, 0.3);
      this.leftArm.elbow.rotation.set(-1.4, 0, 0);
      this.rightArm.root.rotation.set(-1.3, 0, -0.3);
      this.rightArm.elbow.rotation.set(-1.4, 0, 0);

      this.leftLeg.root.rotation.set(1.4, 0, 0.25);
      this.leftLeg.elbow.rotation.set(-1.8, 0, 0);
      this.rightLeg.root.rotation.set(1.4, 0, -0.25);
      this.rightLeg.elbow.rotation.set(-1.8, 0, 0);
      return;
    }

    if (this.state === 'KICK') {
      // --- JUMPING / SPINNING ROUNDHOUSE KICK ("ORYAA! / UWAHH!", frame_10 & frame_21) ---
      const progress = Math.min(1, this.actionTimer / Math.max(0.01, this.actionDuration));
      this.bodyPivot.position.y = 1.15;
      // High-speed 360° martial arts spin + dramatic side tilt
      this.bodyPivot.rotation.y = progress * Math.PI * 2.2;
      this.bodyPivot.rotation.z = 0.65;
      this.torso.rotation.x = 0.35;

      // Right leg fully extended horizontally for the devastating side-kick!
      this.rightLeg.root.rotation.set(-0.15, 0, -1.48);
      this.rightLeg.elbow.rotation.set(0.05, 0, 0);

      // Left leg tucked as counter-balance
      this.leftLeg.root.rotation.set(0.65, 0, 0.55);
      this.leftLeg.elbow.rotation.set(-1.35, 0, 0);

      // Dynamic martial-arts guard arms (matches frame_21.jpg!)
      this.leftArm.root.rotation.set(-0.4, 0, 1.25);
      this.leftArm.elbow.rotation.set(-0.9, 0, 0);
      this.rightArm.root.rotation.set(0.3, 0, -1.1);
      this.rightArm.elbow.rotation.set(-0.7, 0, 0);

      // Pulse the shockwave ring
      this.kickShockwave.scale.setScalar(0.6 + progress * 1.35);
      this.kickShockwave.material.opacity = (1.0 - progress) * 0.75;
      return;
    }

    if (this.state === 'FLIP') {
      // --- ACROBATIC MID-AIR BACKFLIP / DIVE-FLIP (frame_14 & frame_27) ---
      const progress = Math.min(1, this.actionTimer / Math.max(0.01, this.actionDuration));
      this.bodyPivot.position.y = 1.15;
      this.bodyPivot.rotation.x = progress * Math.PI * 2;
      this.bodyPivot.rotation.z = Math.sin(progress * Math.PI) * 0.45;

      // Spread-eagle / tucked acrobatic arch
      this.leftArm.root.rotation.set(-0.8, 0, 0.85);
      this.rightArm.root.rotation.set(-0.8, 0, -0.85);
      this.leftLeg.root.rotation.set(0.7, 0, 0.45);
      this.leftLeg.elbow.rotation.set(-1.1, 0, 0);
      this.rightLeg.root.rotation.set(0.7, 0, -0.45);
      this.rightLeg.elbow.rotation.set(-1.1, 0, 0);
      return;
    }

    if (this.state === 'HOP') {
      // --- CLASSIC FROGGER LEAP POSE (00:01 & 00:03 — limbs stretched out mid-hop!) ---
      const progress = Math.min(1, this.actionTimer / Math.max(0.01, this.actionDuration));
      this.bodyPivot.position.y = 0.85;
      this.torso.rotation.x = -0.65;
      // Arms reaching forward/up like 00:01 & 00:03
      this.leftArm.root.rotation.set(2.2, 0, 0.25);
      this.rightArm.root.rotation.set(2.2, 0, -0.25);
      // Hind legs pushing back
      const legExt = Math.sin(progress * Math.PI);
      this.leftLeg.root.rotation.set(-0.9 * legExt, 0, 0.3);
      this.leftLeg.elbow.rotation.set(0.3, 0, 0);
      this.rightLeg.root.rotation.set(-0.9 * legExt, 0, -0.3);
      this.rightLeg.elbow.rotation.set(0.3, 0, 0);
      return;
    }

    if (this.stanceMode === 'CLASSIC' && moveSpeed < 0.5 && isGrounded) {
      // --- CLASSIC CROUCHED FROGGER IDLE (frame_01.jpg) ---
      const breathe = Math.sin(this.animTime * 4) * 0.03;
      this.bodyPivot.position.y = 0.58 + breathe;
      this.torso.rotation.x = -0.85;
      this.torso.scale.set(1.18, 0.92, 1.12);

      this.leftArm.root.rotation.set(0.75, 0, 0.45);
      this.leftArm.elbow.rotation.set(-0.65, 0, 0);
      this.rightArm.root.rotation.set(0.75, 0, -0.45);
      this.rightArm.elbow.rotation.set(-0.65, 0, 0);

      this.leftLeg.root.rotation.set(1.35, 0, 0.55);
      this.leftLeg.elbow.rotation.set(-2.05, 0, 0);
      this.rightLeg.root.rotation.set(1.35, 0, -0.55);
      this.rightLeg.elbow.rotation.set(-2.05, 0, 0);
      return;
    }

    // --- BIPEDAL ACTION HERO STANCE & SPRINT (frame_07, frame_11, frame_15, frame_28) ---
    if (moveSpeed > 0.4) {
      const cycle = this.animTime * 15.5;
      const stride = Math.sin(cycle);
      const oppStride = Math.sin(cycle + Math.PI);

      this.bodyPivot.position.y = 1.05 + Math.abs(Math.cos(cycle)) * 0.14;
      this.torso.rotation.x = -0.28; // Heroic forward sprint lean
      this.torso.rotation.y = stride * 0.18;

      this.leftArm.root.rotation.set(oppStride * 0.95, 0, 0.22);
      this.leftArm.elbow.rotation.set(0.75, 0, 0);
      this.rightArm.root.rotation.set(stride * 0.95, 0, -0.22);
      this.rightArm.elbow.rotation.set(0.75, 0, 0);

      this.leftLeg.root.rotation.set(stride * 0.95, 0, 0.1);
      this.leftLeg.elbow.rotation.set(stride < 0 ? -0.85 : -0.15, 0, 0);
      this.rightLeg.root.rotation.set(oppStride * 0.95, 0, -0.1);
      this.rightLeg.elbow.rotation.set(oppStride < 0 ? -0.85 : -0.15, 0, 0);
    } else {
      // Heroic upright idle (like 00:04 & 00:28)
      const breathe = Math.sin(this.animTime * 3.5) * 0.04;
      this.bodyPivot.position.y = 1.02 + breathe;
      this.torso.rotation.x = -0.1;

      this.leftArm.root.rotation.set(0.15, 0, 0.25);
      this.leftArm.elbow.rotation.set(0.45, 0, 0);
      this.rightArm.root.rotation.set(0.15, 0, -0.25);
      this.rightArm.elbow.rotation.set(0.45, 0, 0);

      this.leftLeg.root.rotation.set(0.15, 0, 0.15);
      this.leftLeg.elbow.rotation.set(-0.3, 0, 0);
      this.rightLeg.root.rotation.set(0.15, 0, -0.15);
      this.rightLeg.elbow.rotation.set(-0.3, 0, 0);
    }
  }
}
