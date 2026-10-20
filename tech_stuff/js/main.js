import * as THREE from '../vendor/three.module.js';
import { createGameTextures } from './textures.js';
import { HeroFrog } from './frog.js';
import { GameWorld } from './world.js';
import { SoundEngine } from './audio.js';

class OneMoreFeatureGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Retro crunchy pixel scale (true = authentic 260p PS1/DS pixelation like the video!)
    this.retroPixelMode = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bd4ff);
    this.scene.fog = new THREE.FogExp2(0xbfe4ff, 0.0042);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 320);

    this.setupLights();

    this.textures = createGameTextures();
    this.world = new GameWorld(this.scene, this.textures);
    this.frog = new HeroFrog(this.textures);
    this.scene.add(this.frog.group);

    // Circular drop-shadow right under the frog for crisp depth reading
    const shadowGeo = new THREE.CircleGeometry(0.95, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    this.frogBlobShadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ color: 0x051802, transparent: true, opacity: 0.48 })
    );
    this.scene.add(this.frogBlobShadow);

    this.sound = new SoundEngine();

    // Player Physics & State
    this.pos = new THREE.Vector3(0, 0, 2.5);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.facingYaw = 0; // 0 = facing -Z (across highway/river), Math.PI/2 = facing -X (down highway)
    this.cameraYaw = 0;
    this.cameraPitch = 0.28;
    this.cameraDist = 7.6;

    this.isGrounded = true;
    this.currentLog = null;
    this.stamina = 100;
    this.score = 0;
    this.carsKicked = 0;
    this.crossings = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.screenShake = 0;
    this.slowMoFactor = 1.0;
    this.slowMoTimer = 0;

    // Input State
    this.keys = {};
    this.pointerDragging = false;
    this.lastPointer = { x: 0, y: 0 };

    // Director / Video Choreography Replay State
    this.directorActive = false;
    this.directorTime = 0;
    this.directorEventsFired = new Set();
    this.directorTargetCar = null;

    this.setupInputs();
    this.setupUI();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());

    this.resetToPlayableStart();

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0xdff2ff, 1.35);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfffbe8, 1.9);
    sun.position.set(35, 58, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    const d = 85;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Crunchy low-res internal framebuffer when retroPixelMode is active
    const scale = this.retroPixelMode ? 0.36 : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(Math.max(240, Math.floor(w * scale)), Math.max(160, Math.floor(h * scale)), false);
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const code = e.code;
      this.keys[code] = true;

      // Any manual action key exits Director replay and gives instant live control!
      if (
        this.directorActive &&
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyR', 'KeyV', 'KeyG'].includes(code)
      ) {
        this.stopDirectorMode('🕹️ Live Control Taken Over!');
      }

      if (code === 'Space') {
        e.preventDefault();
        this.handleJumpOrGlider();
      } else if (code === 'KeyR' || code === 'ShiftLeft' || code === 'ShiftRight') {
        this.triggerDodgeRoll();
      } else if (code === 'KeyF' || code === 'KeyK') {
        this.triggerSpinKick();
      } else if (code === 'KeyV' || code === 'KeyX') {
        this.triggerAcroFlip();
      } else if (code === 'KeyG') {
        this.toggleParaglider();
      } else if (code === 'KeyC') {
        this.toggleCameraPreset();
      } else if (code === 'Digit1') {
        this.toggleStanceMode();
      } else if (code === 'KeyP') {
        this.startDirectorChoreography();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mouse / Touch Camera Orbit + Click Actions
    this.canvas.addEventListener('pointerdown', (e) => {
      this.sound.ensureContext();
      if (e.button === 2) {
        this.triggerDodgeRoll();
        return;
      }
      this.pointerDragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.pointerDragging || this.directorActive) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.cameraYaw -= dx * 0.0065;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.005, 0.08, 0.95);
    });

    window.addEventListener('pointerup', () => {
      this.pointerDragging = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setupUI() {
    // On-screen action buttons
    const bindBtn = (id, fn) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sound.ensureContext();
          fn();
        });
      }
    };

    bindBtn('btnPlayFree', () => {
      this.stopDirectorMode();
      this.resetToPlayableStart();
      this.pushCommitToast('git checkout main', 'All "Just One More Feature" mechanics unlocked & active!');
    });

    bindBtn('btnWatchVideo', () => {
      this.startDirectorChoreography();
    });

    bindBtn('btnActionHop', () => {
      if (this.directorActive) this.stopDirectorMode();
      this.triggerClassicHop();
    });

    bindBtn('btnActionRoll', () => {
      if (this.directorActive) this.stopDirectorMode();
      this.triggerDodgeRoll();
    });

    bindBtn('btnActionKick', () => {
      if (this.directorActive) this.stopDirectorMode();
      this.triggerSpinKick();
    });

    bindBtn('btnActionFlip', () => {
      if (this.directorActive) this.stopDirectorMode();
      this.triggerAcroFlip();
    });

    bindBtn('btnActionGlider', () => {
      if (this.directorActive) this.stopDirectorMode();
      this.toggleParaglider(true);
    });

    bindBtn('btnCameraToggle', () => {
      if (this.directorActive) this.stopDirectorMode();
      this.toggleCameraPreset();
    });

    bindBtn('btnPixelToggle', () => {
      this.retroPixelMode = !this.retroPixelMode;
      this.canvas.classList.toggle('crisp-hd', !this.retroPixelMode);
      const btn = document.getElementById('btnPixelToggle');
      if (btn) btn.textContent = this.retroPixelMode ? '📺 240p Retro' : '✨ Crisp HD';
      this.onResize();
    });

    bindBtn('btnSoundToggle', () => {
      this.sound.muted = !this.sound.muted;
      if (this.sound.muted) this.sound.stopAllClips();
      const btn = document.getElementById('btnSoundToggle');
      if (btn) btn.textContent = this.sound.muted ? '🔇 Muted' : '🔊 Sound ON';
    });

    // Dialog modal setup following modern-web-guidance `light-dismiss-a-dialog`
    const dialog = document.getElementById('featuresDialog');
    const openDialogBtn = document.getElementById('btnOpenFeatures');
    if (openDialogBtn && dialog) {
      openDialogBtn.addEventListener('click', () => {
        dialog.showModal();
      });

      // Mandatory Fallback for browsers without <dialog closedby> support
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.addEventListener('click', (event) => {
          if (event.target !== dialog) return;
          const rect = dialog.getBoundingClientRect();
          const isDialogContent =
            rect.top <= event.clientY &&
            event.clientY <= rect.top + rect.height &&
            rect.left <= event.clientX &&
            event.clientX <= rect.left + rect.width;
          if (isDialogContent) return;
          dialog.close();
        });
      }
    }
  }

  pushCommitToast(commitTitle, detail) {
    const feed = document.getElementById('commitFeed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'commit-toast';
    item.innerHTML = `<span class="commit-hash">${commitTitle}</span> <span class="commit-msg">${detail}</span>`;
    feed.prepend(item);
    while (feed.children.length > 3) {
      feed.lastElementChild.remove();
    }
    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 400);
    }, 4500);
  }

  addStyleCombo(points, label) {
    this.score += points;
    this.comboCount++;
    this.comboTimer = 3.2;

    const banner = document.getElementById('styleBanner');
    if (banner) {
      banner.textContent = `${label} +${points} (${this.comboCount}x)`;
      banner.classList.remove('pop');
      void banner.offsetWidth;
      banner.classList.add('pop');
    }
    this.updateHUD();
  }

  updateHUD() {
    const scoreEl = document.getElementById('hudScore');
    const carsEl = document.getElementById('hudCars');
    const zoneEl = document.getElementById('hudZone');
    if (scoreEl) scoreEl.textContent = this.score.toLocaleString();
    if (carsEl) carsEl.textContent = this.carsKicked;
    if (zoneEl) {
      if (this.pos.z > -4) zoneEl.textContent = '🌱 Start Bank (1981 Frogger)';
      else if (this.pos.z > -52) zoneEl.textContent = '🛣️ 8-Lane Highway (Souls + Yakuza Mode)';
      else if (this.pos.z > -67) zoneEl.textContent = '🌿 River Overlook (Launch Point)';
      else if (this.pos.z > -138) zoneEl.textContent = '🌊 Rushing River (BOTW Glider + Log Surf)';
      else zoneEl.textContent = '🌲 Far Forest Shore (Victory Zone!)';
    }

    // Update BOTW-style circular stamina gauge when gliding or rolling
    const staminaWidget = document.getElementById('staminaWheel');
    const staminaArc = document.getElementById('staminaArc');
    if (staminaWidget && staminaArc) {
      const showWheel = this.frog.state === 'GLIDE' || this.stamina < 99;
      staminaWidget.classList.toggle('visible', showWheel);
      const circumference = 113.1;
      const offset = circumference * (1 - Math.max(0, this.stamina) / 100);
      staminaArc.style.strokeDashoffset = `${offset}`;
      staminaArc.style.stroke = this.stamina < 25 ? '#ff4444' : '#38ff4c';
    }
  }

  resetToPlayableStart() {
    this.pos.set(0, 0, 2.5);
    this.vel.set(0, 0, 0);
    this.facingYaw = 0;
    this.cameraYaw = 0;
    this.cameraPitch = 0.28;
    this.isGrounded = true;
    this.frog.state = 'CROUCH';
    this.frog.stanceMode = 'ACTION';
    this.stamina = 100;
    this.updateHUD();
  }

  // --- PLAYER ABILITIES (Every single move from the YouTube Short!) ---

  triggerClassicHop() {
    if (!this.isGrounded && this.frog.state !== 'GLIDE') return;
    this.frog.stanceMode = 'CLASSIC';
    this.frog.state = 'HOP';
    this.frog.actionTimer = 0;
    this.frog.actionDuration = 0.34;
    this.isGrounded = false;

    const forward = new THREE.Vector3(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));
    this.vel.x = forward.x * 16;
    this.vel.z = forward.z * 16;
    this.vel.y = 8.8;

    this.sound.playHop();
    this.addStyleCombo(50, '🐸 CLASSIC 1981 HOP');
  }

  handleJumpOrGlider() {
    if (this.isGrounded) {
      // Ground jump (or Classic Hop if in Classic stance)
      if (this.frog.stanceMode === 'CLASSIC') {
        this.triggerClassicHop();
      } else {
        this.isGrounded = false;
        this.vel.y = 11.8;
        this.frog.state = 'HOP';
        this.frog.actionTimer = 0;
        this.frog.actionDuration = 0.42;
        this.sound.playHop();
      }
    } else if (this.frog.state !== 'GLIDE') {
      // Mid-air Spacebar deploys the BOTW Paraglider!
      this.toggleParaglider(false);
    } else {
      // Stow glider
      this.frog.state = 'HOP';
    }
  }

  triggerDodgeRoll() {
    if (this.frog.state === 'ROLL') return;
    this.frog.stanceMode = 'ACTION';
    this.frog.state = 'ROLL';
    this.frog.actionTimer = 0;
    this.frog.actionDuration = 0.46;
    this.frog.invincibleTimer = 0.55; // Dark Souls i-frames!
    this.stamina = Math.max(0, this.stamina - 18);

    const forward = new THREE.Vector3(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));
    this.vel.x = forward.x * 23;
    this.vel.z = forward.z * 23;
    if (this.isGrounded) {
      this.vel.y = 4.2;
      this.isGrounded = false;
    }

    this.world.spawnImpactBurst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xdddddd, 10);
    this.sound.playDodgeRoll();
    this.addStyleCombo(150, '🛡️ DARK SOULS I-FRAME ROLL');
    this.pushCommitToast('feat(souls): i-frame dodge roll', 'Added 14 invincibility frames + stamina consumption');
  }

  triggerSpinKick() {
    this.frog.stanceMode = 'ACTION';
    this.frog.state = 'KICK';
    this.frog.actionTimer = 0;
    this.frog.actionDuration = 0.52;
    this.frog.invincibleTimer = 0.55;

    if (this.isGrounded) {
      this.vel.y = 9.5;
      this.isGrounded = false;
    } else {
      this.vel.y = Math.max(this.vel.y, 6.5);
    }

    const forward = new THREE.Vector3(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));
    this.vel.x = forward.x * 16;
    this.vel.z = forward.z * 16;

    // Check if any car is within roundhouse kick radius (or ahead of frog) and launch it into orbit!
    let kickedAnyCar = false;
    for (const car of this.world.cars) {
      if (!car.flying && car.mesh.position.distanceTo(this.pos) < 8.2) {
        this.world.launchCar(car, this.pos);
        kickedAnyCar = true;
        this.carsKicked++;
      }
    }

    if (kickedAnyCar) {
      this.screenShake = 0.45;
      this.slowMoFactor = 0.35;
      this.slowMoTimer = 0.22;
      this.sound.playSpinKick(true, false);
      this.addStyleCombo(1000, '💥 ORYAA!! CAR KICKED INTO ORBIT');
      this.pushCommitToast('feat(combat): roundhouse kick physics', 'Frog leg now transfers 450,000 Newtons to oncoming sedans');
    } else {
      const onLog = this.pos.z < -67 && this.pos.z > -138;
      this.sound.playSpinKick(false, onLog);
      this.world.spawnImpactBurst(this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xaaff44, 12);
      this.addStyleCombo(onLog ? 350 : 200, onLog ? '🪵 LOG SPIN-KICK COMBO!' : '🥋 TORNADO SPIN KICK');
      if (onLog) {
        this.pushCommitToast('feat(river): log martial arts', 'Added spinning roundhouse combo while surfing floating logs');
      }
    }
  }

  triggerAcroFlip() {
    this.frog.stanceMode = 'ACTION';
    this.frog.state = 'FLIP';
    this.frog.actionTimer = 0;
    this.frog.actionDuration = 0.58;
    this.frog.invincibleTimer = 0.6;
    this.isGrounded = false;

    const forward = new THREE.Vector3(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));
    this.vel.x = forward.x * 20;
    this.vel.z = forward.z * 20;
    this.vel.y = 14.5;

    const nearShore = this.pos.z < -115;
    this.sound.playAcroFlip(nearShore);
    this.addStyleCombo(400, nearShore ? '🤸 SHORE DIVE-FLIP DISMOUNT!' : '🤸 360° HIGHWAY BACKFLIP');
    this.pushCommitToast('feat(parkour): 360° acrobatic flip', 'Why walk across lanes when you can backflip over sedans?');
  }

  toggleParaglider(forceLaunchIfGrounded = false) {
    this.frog.stanceMode = 'ACTION';
    if (this.frog.state === 'GLIDE') {
      this.frog.state = 'HOP';
      return;
    }
    if (this.isGrounded) {
      if (!forceLaunchIfGrounded) return;
      // Updraft launch into paraglider!
      this.isGrounded = false;
      this.vel.y = 14.5;
    }
    this.frog.state = 'GLIDE';
    this.sound.playGliderDeploy();
    this.addStyleCombo(500, '🪂 BOTW PARAGLIDER DEPLOYED');
    this.pushCommitToast('feat(zelda): BOTW Paraglider', 'Imported triangular glider rig + updraft aerodynamics');
  }

  toggleCameraPreset() {
    // Toggle between Cross-Highway View (0 rad, looking -Z) and Down-the-Highway Action View (PI/2 rad, looking -X like 00:04!)
    if (Math.abs(this.cameraYaw) < 0.6) {
      this.cameraYaw = Math.PI / 2;
      this.facingYaw = Math.PI / 2;
      this.frog.stanceMode = 'ACTION';
      this.pushCommitToast('feat(camera): highway action angle', 'Switched camera 90° down the highway lanes (00:04 view)');
    } else {
      this.cameraYaw = 0;
      this.facingYaw = 0;
      this.pushCommitToast('feat(camera): river/crossing angle', 'Switched camera to look toward the river & far forest');
    }
  }

  toggleStanceMode() {
    this.frog.stanceMode = this.frog.stanceMode === 'CLASSIC' ? 'ACTION' : 'CLASSIC';
    this.pushCommitToast(
      `mode: ${this.frog.stanceMode}`,
      this.frog.stanceMode === 'CLASSIC' ? '1981 Crouched Frogger Stance' : 'Bipedal Action Hero Stance'
    );
  }

  // --- DIRECTOR MODE: EXACT 28.8-SECOND YOUTUBE SHORT CHOREOGRAPHY RECREATION ---

  startDirectorChoreography() {
    this.directorActive = true;
    this.directorTime = 0;
    this.directorEventsFired.clear();

    // Reset frog to exact starting grass position in frame_01.jpg
    this.pos.set(18, 0, 2.5);
    this.vel.set(0, 0, 0);
    this.facingYaw = 0;
    this.cameraYaw = 0;
    this.cameraPitch = 0.25;
    this.cameraDist = 6.8;
    this.frog.stanceMode = 'CLASSIC';
    this.frog.state = 'CROUCH';
    this.isGrounded = true;

    // Stage key cars & logs so the choreography hits every single beat from the video!
    // Pink car in lane 2 (frame_02)
    if (this.world.cars[6]) {
      this.world.cars[6].flying = false;
      this.world.cars[6].mesh.position.set(16, 0, -13);
    }
    // Maroon target car to kick into the sky at 00:08.5 (frame_09!)
    this.directorTargetCar = this.world.cars[11];
    if (this.directorTargetCar) {
      this.directorTargetCar.flying = false;
      this.directorTargetCar.mesh.position.set(-48, 0, -19);
      this.directorTargetCar.mesh.rotation.set(0, 0, 0);
    }

    // Play the authentic full video audio track in sync!
    this.sound.stopAllClips();
    this.sound.playClip('fullVideo');

    const pill = document.getElementById('directorStatusPill');
    if (pill) pill.classList.add('active');

    this.pushCommitToast('🎬 Playing Video Choreography', 'Press WASD / Space / F anytime to take over live control!');
  }

  stopDirectorMode(reason = '') {
    if (!this.directorActive) return;
    this.directorActive = false;
    this.sound.stopAllClips();
    const pill = document.getElementById('directorStatusPill');
    if (pill) pill.classList.remove('active');
    if (reason) {
      this.pushCommitToast('🕹️ Live Gameplay Active', reason);
    }
  }

  fireDirectorEventOnce(key, fn) {
    if (!this.directorEventsFired.has(key)) {
      this.directorEventsFired.add(key);
      fn();
    }
  }

  updateDirectorChoreography(dt) {
    this.directorTime += dt;
    const t = this.directorTime;

    // 00:00 - 00:03.6: Classic Frogger Hops on the starting grass & first lane (frame_01 - frame_03)
    if (t < 3.6) {
      this.frog.stanceMode = 'CLASSIC';
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, 0.1);
      this.cameraPitch = 0.28;
      this.facingYaw = 0;

      if (t >= 0.45 && t < 1.15) {
        this.fireDirectorEventOnce('hop1', () => {
          this.pushCommitToast('git commit -m "initial frogger"', 'Simple frog hopping across the road. Ship it!');
        });
        const p = (t - 0.45) / 0.7;
        this.frog.state = 'HOP';
        this.frog.actionTimer = p;
        this.frog.actionDuration = 1;
        this.pos.z = THREE.MathUtils.lerp(2.5, -7.5, p);
        this.pos.y = Math.sin(p * Math.PI) * 2.6;
      } else if (t >= 1.15 && t < 2.25) {
        this.frog.state = 'CROUCH';
        this.pos.set(18, 0, -7.5);
      } else if (t >= 2.25 && t < 3.1) {
        const p = (t - 2.25) / 0.85;
        this.frog.state = 'HOP';
        this.frog.actionTimer = p;
        this.frog.actionDuration = 1;
        this.pos.z = THREE.MathUtils.lerp(-7.5, -18.5, p);
        this.pos.y = Math.sin(p * Math.PI) * 2.8;
      } else {
        this.frog.state = 'CROUCH';
        this.pos.y = 0;
      }
      return;
    }

    // 00:03.6 - 00:07.0: Camera swings 90° down the highway (-X) + Dark Souls Dodge Rolls ("Hup! Hup!", frame_04 - frame_06)
    if (t >= 3.6 && t < 7.0) {
      this.frog.stanceMode = 'ACTION';
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, Math.PI / 2, 0.14);
      this.facingYaw = Math.PI / 2; // Facing -X down the highway with green trees on the left!
      this.cameraPitch = 0.18;

      this.fireDirectorEventOnce('souls_mode', () => {
        this.pushCommitToast('feat: "Just one more feature"', 'Added 3rd-person Souls camera + Dodge Roll i-frames');
      });

      if (t >= 4.65 && t < 5.45) {
        // Dodge Roll 1 ("Hup!")
        const p = (t - 4.65) / 0.8;
        this.frog.state = 'ROLL';
        this.frog.actionTimer = p;
        this.frog.actionDuration = 1;
        this.pos.x -= 22 * dt;
        this.pos.z = THREE.MathUtils.lerp(-18.5, -16.0, p);
        this.pos.y = Math.sin(p * Math.PI) * 0.9;
      } else if (t >= 5.75 && t < 6.55) {
        // Dodge Roll 2 ("Hup!")
        const p = (t - 5.75) / 0.8;
        this.frog.state = 'ROLL';
        this.frog.actionTimer = p;
        this.frog.actionDuration = 1;
        this.pos.x -= 22 * dt;
        this.pos.z = THREE.MathUtils.lerp(-16.0, -19.0, p);
        this.pos.y = Math.sin(p * Math.PI) * 0.9;
      } else {
        this.frog.state = 'RUN';
        this.pos.x -= 14 * dt;
        this.pos.y = 0;
      }
      return;
    }

    // 00:07.0 - 00:10.3: Sprint down highway + Jumping Spin-Kick Car Launch ("ORYAA! / UWAHH!", frame_08 - frame_10)
    if (t >= 7.0 && t < 10.3) {
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, Math.PI / 2, 0.15);
      this.facingYaw = Math.PI / 2;
      this.pos.x -= 16 * dt;

      if (t >= 7.85 && t < 9.85) {
        const p = (t - 7.85) / 2.0;
        this.frog.state = 'KICK';
        this.frog.actionTimer = (p * 2.5) % 1;
        this.frog.actionDuration = 1;
        this.pos.y = Math.sin(Math.min(1, p * 1.3) * Math.PI) * 3.2;

        // At 00:08.35, launch the oncoming car tumbling into the sky just like frame_09.jpg!
        if (t >= 8.3 && this.directorTargetCar) {
          this.fireDirectorEventOnce('kick_car', () => {
            this.directorTargetCar.mesh.position.set(this.pos.x - 3.5, 0.5, this.pos.z - 1.2);
            this.world.launchCar(this.directorTargetCar, this.pos);
            this.screenShake = 0.5;
            this.carsKicked++;
            this.addStyleCombo(1000, '💥 ORYAA!! SEDAN KICKED INTO ORBIT');
            this.pushCommitToast('feat(combat): car dropkick', 'Added spinning roundhouse kick that launches cars across the sky');
          });
        }
      } else {
        this.frog.state = 'RUN';
        this.pos.y = 0;
      }
      return;
    }

    // 00:10.3 - 00:14.7: Weaving through dense traffic + Acrobatic Side/Backflip onto Middle Grass Bank (frame_11 - frame_15)
    if (t >= 10.3 && t < 14.7) {
      if (t < 12.1) {
        this.frog.state = 'RUN';
        this.pos.x -= 15 * dt;
        this.pos.z = THREE.MathUtils.lerp(this.pos.z, -35, dt * 2.5);
        this.pos.y = 0;
      } else if (t >= 12.1 && t < 13.75) {
        this.fireDirectorEventOnce('highway_flip', () => {
          this.addStyleCombo(400, '🤸 ACROBATIC HIGHWAY FLIP');
          this.pushCommitToast('feat(parkour): 360° lane flip', 'Added mid-air gymnastic flip to clear remaining lanes');
        });
        const p = (t - 12.1) / 1.65;
        this.frog.state = 'FLIP';
        this.frog.actionTimer = p;
        this.frog.actionDuration = 1;
        this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0.25, 0.08);
        this.facingYaw = 0;
        this.pos.z = THREE.MathUtils.lerp(-35, -56, p);
        this.pos.y = Math.sin(p * Math.PI) * 5.2;
      } else {
        this.frog.state = 'RUN';
        this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, 0.15);
        this.facingYaw = 0;
        this.pos.z = THREE.MathUtils.lerp(-56, -65, (t - 13.75) / 0.95);
        this.pos.y = 0;
      }
      return;
    }

    // 00:14.7 - 00:19.6: Leap off Riverbank & Deploy BOTW Paraglider over River to First Floating Log (frame_16 - frame_19)
    if (t >= 14.7 && t < 19.6) {
      this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, 0, 0.12);
      this.facingYaw = 0;
      this.cameraPitch = 0.22;

      this.fireDirectorEventOnce('glider_1', () => {
        this.addStyleCombo(500, '🪂 BOTW PARAGLIDER DEPLOYED');
        this.pushCommitToast('feat(glider): Breath of the Wild Paraglider', 'Wait why swim when the frog can paraglide across the river?');
      });

      const p = (t - 14.7) / 4.9;
      this.frog.state = 'GLIDE';
      this.stamina = 100 - p * 35;

      // Snap a river log under the landing spot at z = -98 so the frog lands cleanly on it at 00:19.5!
      const targetLog1 = this.world.logs[8];
      if (targetLog1) {
        targetLog1.mesh.position.set(this.pos.x + (1 - p) * 6, 0, -98);
      }

      this.pos.z = THREE.MathUtils.lerp(-65, -98, p);
      this.pos.y = THREE.MathUtils.lerp(5.8, 1.55, p) + Math.sin(p * Math.PI) * 1.8;
      return;
    }

    // 00:19.6 - 00:22.0: Double Spinning Martial Arts Kick on the Floating Log ("UWAHH! UWAHH!", frame_20 - frame_21)
    if (t >= 19.6 && t < 22.0) {
      this.fireDirectorEventOnce('log_kicks', () => {
        this.addStyleCombo(700, '🪵 DOUBLE LOG SPIN-KICK ("UWAHH!")');
        this.pushCommitToast('feat(log-combat): log spin-kicks', 'Added double roundhouse kick animation while riding river logs');
      });

      const targetLog1 = this.world.logs[8];
      if (targetLog1) {
        targetLog1.mesh.position.z = -98;
        this.pos.x = targetLog1.mesh.position.x;
      }
      this.pos.z = -98;
      this.pos.y = 1.55 + Math.abs(Math.sin((t - 19.6) * 5)) * 0.8;

      const kickProgress = ((t - 19.6) / 1.2) % 1;
      this.frog.state = 'KICK';
      this.frog.actionTimer = kickProgress;
      this.frog.actionDuration = 1;
      return;
    }

    // 00:22.0 - 00:25.3: Second BOTW Paraglider Flight to Far Log (frame_22 - frame_25)
    if (t >= 22.0 && t < 25.3) {
      this.fireDirectorEventOnce('glider_2', () => {
        this.addStyleCombo(500, '🪂 RIVER UPDRAFT GLIDE');
      });

      const p = (t - 22.0) / 3.3;
      this.frog.state = 'GLIDE';
      this.stamina = 75 - p * 30;

      const targetLog2 = this.world.logs[20];
      if (targetLog2) {
        targetLog2.mesh.position.set(this.pos.x, 0, -131);
      }

      this.pos.z = THREE.MathUtils.lerp(-98, -131, p);
      this.pos.y = THREE.MathUtils.lerp(4.6, 1.55, p) + Math.sin(p * Math.PI) * 1.4;
      return;
    }

    // 00:25.3 - 00:28.8: Front Dive-Flip off Log onto Far Grass Shore + Heroic Walk (frame_26 - frame_29)
    if (t >= 25.3 && t < 28.8) {
      if (t < 27.1) {
        this.fireDirectorEventOnce('shore_flip', () => {
          this.addStyleCombo(1000, '🏆 FRONT-FLIP SHORE TOUCHDOWN!');
          this.pushCommitToast('git push origin prod', 'Road + River crossed with 47 unnecessary AAA mechanics!');
        });
        const p = (t - 25.3) / 1.8;
        this.frog.state = 'FLIP';
        this.frog.actionTimer = p;
        this.frog.actionDuration = 1;
        this.pos.z = THREE.MathUtils.lerp(-131, -143, p);
        this.pos.y = 1.55 * (1 - p) + Math.sin(p * Math.PI) * 4.8;
      } else {
        // Heroic walk on the far grass shore as camera orbits around (frame_28 - frame_29!)
        this.frog.state = 'RUN';
        this.pos.y = 0;
        this.pos.z -= 4.5 * dt;
        this.cameraYaw = THREE.MathUtils.lerp(this.cameraYaw, -0.55, 0.06);
      }
      return;
    }

    // Loop or return to live control at the end of the 28.8s clip
    this.stopDirectorMode('🎬 Scene Complete! You are now in live control!');
  }

  // --- MAIN GAMEPLAY UPDATE LOOP ---

  updatePlayerPhysics(dt) {
    // Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    // Gather movement input relative to camera yaw
    let moveForward = 0;
    let moveRight = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveForward += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveForward -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveRight += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveRight -= 1;

    // Camera orbit via Q / E keys as well
    if (this.keys['KeyQ']) this.cameraYaw += 2.1 * dt;
    if (this.keys['KeyE']) this.cameraYaw -= 2.1 * dt;

    const inputLen = Math.hypot(moveForward, moveRight);
    let bankAngle = 0;

    // Advance timed action animations (ROLL, KICK, FLIP, HOP)
    if (['ROLL', 'KICK', 'FLIP', 'HOP'].includes(this.frog.state)) {
      this.frog.actionTimer += dt;

      // While spin-kicking in mid-air, check car impacts every frame!
      if (this.frog.state === 'KICK') {
        for (const car of this.world.cars) {
          if (!car.flying && car.mesh.position.distanceTo(this.pos) < 6.8) {
            this.world.launchCar(car, this.pos);
            this.carsKicked++;
            this.screenShake = 0.4;
            this.sound.playSpinKick(true, false);
            this.addStyleCombo(1000, '💥 ORYAA!! CAR KICKED INTO ORBIT');
          }
        }
      }

      if (this.frog.actionTimer >= this.frog.actionDuration) {
        this.frog.state = this.isGrounded ? 'RUN' : 'HOP';
      }
    }

    if (inputLen > 0.01 && this.frog.state !== 'ROLL') {
      const normF = moveForward / inputLen;
      const normR = moveRight / inputLen;

      const camForward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
      const camRight = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

      const moveDir = new THREE.Vector3()
        .addScaledVector(camForward, normF)
        .addScaledVector(camRight, normR)
        .normalize();

      const targetYaw = Math.atan2(-moveDir.x, -moveDir.z);
      // Smooth angular interpolation
      let diff = targetYaw - this.facingYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facingYaw += diff * Math.min(1, dt * 14);
      bankAngle = THREE.MathUtils.clamp(diff, -0.8, 0.8);

      const topSpeed = this.frog.state === 'GLIDE' ? 17.5 : 16.5;
      this.vel.x = THREE.MathUtils.lerp(this.vel.x, moveDir.x * topSpeed, dt * 9);
      this.vel.z = THREE.MathUtils.lerp(this.vel.z, moveDir.z * topSpeed, dt * 9);

      if (this.isGrounded && !['ROLL', 'KICK', 'FLIP'].includes(this.frog.state)) {
        this.frog.stanceMode = 'ACTION';
        this.frog.state = 'RUN';
      }
    } else if (this.isGrounded && this.frog.state !== 'ROLL') {
      this.vel.x *= Math.pow(0.001, dt);
      this.vel.z *= Math.pow(0.001, dt);
      if (Math.hypot(this.vel.x, this.vel.z) < 0.3 && !['KICK', 'FLIP', 'HOP'].includes(this.frog.state)) {
        this.frog.state = this.frog.stanceMode === 'CLASSIC' ? 'CROUCH' : 'RUN';
      }
    }

    // Vertical Physics: Paraglider vs Standard Gravity
    if (this.frog.state === 'GLIDE') {
      // Gentle BOTW Paraglider descent + forward glide momentum
      this.vel.y = Math.max(this.vel.y - 8.5 * dt, -2.35);
      const forward = new THREE.Vector3(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw));
      if (inputLen < 0.1) {
        this.vel.x = THREE.MathUtils.lerp(this.vel.x, forward.x * 13.5, dt * 4);
        this.vel.z = THREE.MathUtils.lerp(this.vel.z, forward.z * 13.5, dt * 4);
      }
      this.stamina = Math.max(0, this.stamina - 11 * dt);
      if (this.stamina <= 0) {
        this.frog.state = 'HOP';
      }
    } else {
      this.vel.y -= 28.5 * dt;
      if (this.isGrounded) {
        this.stamina = Math.min(100, this.stamina + 38 * dt);
      }
    }

    // Integrate position
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -72, 72);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -162, 12);

    // Check River vs Ground vs Floating Logs (River spans z = -67 to -138)
    this.currentLog = null;
    const inRiverZone = this.pos.z < -67.5 && this.pos.z > -137.5;

    if (inRiverZone) {
      // Check if landing on / riding any floating brown log!
      for (const log of this.world.logs) {
        const dx = Math.abs(this.pos.x - log.mesh.position.x);
        const dz = Math.abs(this.pos.z - log.z);
        if (dx < log.length * 0.5 + 0.65 && dz < log.radius + 0.75) {
          if (this.pos.y <= 1.65 && this.vel.y <= 2.0) {
            this.currentLog = log;
            break;
          }
        }
      }

      if (this.currentLog) {
        this.pos.y = 1.52 + this.currentLog.mesh.position.y;
        this.vel.y = 0;
        this.isGrounded = true;
        // Carry frog along with the floating log!
        this.pos.x += this.currentLog.dir * this.currentLog.speed * dt;
        if (this.frog.state === 'GLIDE') {
          this.frog.state = 'RUN';
        }
      } else if (this.pos.y < -0.35) {
        // Splashed into the river water -> Emergency frog spring-jump / updraft boost so gameplay never gets frustrating!
        this.vel.y = 14.2;
        this.isGrounded = false;
        this.frog.state = 'GLIDE';
        this.stamina = Math.max(this.stamina, 60);
        this.world.spawnImpactBurst(this.pos.clone(), 0x4cdbff, 16);
        this.sound.playGliderDeploy();
        this.pushCommitToast('fix(water): emergency hydro-updraft', 'Auto-deployed paraglider on water contact');
      } else {
        this.isGrounded = false;
      }
    } else {
      // Solid Ground (Start Grass, 8-Lane Highway, Middle Median, or Far Forest Shore)
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vel.y = 0;
        if (!this.isGrounded && this.frog.state === 'GLIDE') {
          this.frog.state = 'RUN';
        }
        this.isGrounded = true;
      }
    }

    // Highway Car Collisions (when on the highway z = -4 to -52)
    if (this.pos.z < -4 && this.pos.z > -52) {
      for (const car of this.world.cars) {
        if (car.flying) continue;
        const dx = Math.abs(this.pos.x - car.mesh.position.x);
        const dz = Math.abs(this.pos.z - car.mesh.position.z);
        const dy = this.pos.y;

        if (dx < 2.75 && dz < 1.55 && dy < 1.65) {
          if (this.frog.invincibleTimer > 0 || this.frog.state === 'KICK' || this.frog.state === 'ROLL') {
            // If rolling or kicking, either phase through with i-frames or send the car flying!
            if (this.frog.state === 'KICK') {
              this.world.launchCar(car, this.pos);
              this.carsKicked++;
              this.screenShake = 0.4;
              this.sound.playSpinKick(true, false);
              this.addStyleCombo(1000, '💥 ORYAA!! CAR KICKED INTO ORBIT');
            } else {
              this.addStyleCombo(250, '⚡ PERFECT I-FRAME DODGE!');
            }
          } else {
            // Bumped by car -> Dramatic anime knockback backflip instead of boring instant game-over!
            this.vel.y = 11.5;
            this.vel.z += 9.5;
            this.isGrounded = false;
            this.frog.state = 'FLIP';
            this.frog.actionTimer = 0;
            this.frog.actionDuration = 0.55;
            this.frog.invincibleTimer = 1.1;
            this.screenShake = 0.35;
            this.world.spawnImpactBurst(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff5533, 16);
            this.sound.playAcroFlip(false);
            this.pushCommitToast('fix(damage): auto-tech recovery flip', 'Replaced frog death with anime knockback flip');
          }
        }
      }
    }

    // Check Far Shore Victory Zone (z <= -139)
    if (this.pos.z <= -139 && !this.reachedShoreFlag) {
      this.reachedShoreFlag = true;
      this.crossings++;
      this.addStyleCombo(2500, `🏆 SHORE REACHED! (RUN #${this.crossings})`);
      this.pushCommitToast('🎉 Stage Clear!', 'You crossed the highway & river! Keep exploring or press "Play Free" to go again.');
    } else if (this.pos.z > -60) {
      this.reachedShoreFlag = false;
    }

    // Update Adaptive Soundtrack based on current zone/mode
    let desiredTheme = 'BOSS';
    if (this.frog.state === 'GLIDE' || this.pos.z < -66) {
      desiredTheme = 'GLIDER';
    } else if (this.frog.stanceMode === 'CLASSIC' && this.pos.z > -20) {
      desiredTheme = 'CHIPTUNE';
    }
    this.sound.updateMusic(dt, desiredTheme);

    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.frog.update(dt, horizontalSpeed, this.isGrounded, bankAngle);
  }

  updateCamera(dt) {
    // Sync frog mesh transform
    this.frog.group.position.copy(this.pos);
    this.frog.group.rotation.y = this.facingYaw;

    // Update blob shadow right on ground/log beneath frog
    const shadowY = this.currentLog ? 1.54 + this.currentLog.mesh.position.y : 0.03;
    this.frogBlobShadow.position.set(this.pos.x, shadowY, this.pos.z);
    const heightAboveGround = Math.max(0, this.pos.y - shadowY);
    const shadowScale = Math.max(0.35, 1.0 - heightAboveGround * 0.06);
    this.frogBlobShadow.scale.setScalar(shadowScale);

    // 3rd-person camera follow with subtle screen shake on car kicks
    const lookTarget = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
    const horizDist = this.cameraDist * Math.cos(this.cameraPitch);
    const vertDist = this.cameraDist * Math.sin(this.cameraPitch);

    const desiredCamPos = new THREE.Vector3(
      lookTarget.x + Math.sin(this.cameraYaw) * horizDist,
      lookTarget.y + vertDist,
      lookTarget.z + Math.cos(this.cameraYaw) * horizDist
    );

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 1.8);
      desiredCamPos.x += (Math.random() - 0.5) * this.screenShake * 1.6;
      desiredCamPos.y += (Math.random() - 0.5) * this.screenShake * 1.6;
    }

    this.camera.position.lerp(desiredCamPos, Math.min(1, dt * 12));
    this.camera.lookAt(lookTarget);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));

    let rawDt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // Brief hit-stop / bullet-time slow-mo when kicking a car into orbit!
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= rawDt;
      if (this.slowMoTimer <= 0) this.slowMoFactor = 1.0;
    }
    const dt = rawDt * this.slowMoFactor;

    this.world.update(dt);

    if (this.directorActive) {
      this.updateDirectorChoreography(rawDt);
      const speed = this.frog.state === 'RUN' ? 12 : 0;
      this.frog.update(rawDt, speed, this.pos.y <= 0.05, 0);
    } else {
      this.updatePlayerPhysics(dt);
    }

    this.updateCamera(rawDt);
    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new OneMoreFeatureGame();
});
