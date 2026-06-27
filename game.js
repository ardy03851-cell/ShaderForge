/* =========================================================
   GAME.JS
   The "index" layer: config, game state, monster AI/behavior,
   start/death flow, and the main loop. Wires together
   Graphics (graphics.js) and PlayerCamera (camera.js).
========================================================= */

(function(){

  const CONFIG = {
    fogColor: 0x000000,
    fogDensity: 0.045,
    groundSize: 4000,
    tileSize: 60,

    moveSpeed: 4.2,
    runSpeed: 7.5,
    accel: 18,          // units/sec^2 — how fast we ramp up to target speed
    decel: 26,          // units/sec^2 — how fast we settle back down

    lookSensitivity: 0.0022,
    touchLookSensitivity: 0.0042,

    headBobAmount: 0.045,
    headBobFrequency: 1.9,

    flashlightDistance: 26,
    flashlightAngle: 0.42,
    flashlightIntensity: 4.5,

    monsterMinDist: 9,
    monsterAttackDist: 2.4,
    monsterStalkSpeed: 1.15,
    monsterChaseSpeed: 5.4,
    monsterSpawnMinRadius: 16,
    monsterSpawnMaxRadius: 26,
    monsterDespawnRadius: 42,
    monsterAppearChanceMs: [9000, 22000],
    monsterVisibleDuration: [3500, 7000],
    monsterSpriteWidth: 3.2,
    monsterSpriteHeight: 5.2
  };

  let scene, camera, renderer, clock;
  let gameStarted = false;
  let isDead = false;
  let flashlightOn = true;
  let startTime = 0;

  window.__gameIsDead = false; // read by camera.js to gate mouse-look

  function showFatalError(msg){
    const statusEl = document.getElementById('loadStatus');
    if(statusEl){
      statusEl.style.color = '#d33';
      statusEl.textContent = msg;
    }
    console.error(msg);
  }

  function randRange(a, b){ return a + Math.random() * (b - a); }

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  function init(){
    const gfx = Graphics.init(CONFIG, onMonsterReady);
    scene = gfx.scene;
    camera = gfx.camera;
    renderer = gfx.renderer;
    clock = gfx.clock;

    PlayerCamera.init(camera, CONFIG, toggleFlashlight);
    PlayerCamera.bindClickToLock(renderer.domElement, () => gameStarted && !isDead);

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('restartBtn').addEventListener('click', () => location.reload());

    animate();
  }

  function onMonsterReady(monster){
    // Graphics module owns texture/sprite creation; nothing extra needed
    // here right now, but the hook exists for future monster-specific
    // setup (sounds, extra animation states, etc.) without touching
    // graphics.js again.
  }

  /* ---------------------------------------------------------
     MONSTER AI
  --------------------------------------------------------- */
  function updateMonster(dt, now){
    const monster = Graphics.getMonster();
    if(!monster) return;
    const playerPos = PlayerCamera.getPlayerPos();

    if(monster.state === 'hidden'){
      if(now >= monster.nextAppearAt){
        spawnStalker(monster, playerPos);
      }
      return;
    }

    if(monster.state === 'stalking'){
      const toPlayer = new THREE.Vector3().subVectors(playerPos, monster.sprite.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();

      if(dist > CONFIG.monsterDespawnRadius || now >= monster.visibleUntil){
        hideMonster(monster, playerPos);
        return;
      }

      toPlayer.normalize();
      monster.sprite.position.x += toPlayer.x * CONFIG.monsterStalkSpeed * dt;
      monster.sprite.position.z += toPlayer.z * CONFIG.monsterStalkSpeed * dt;

      if(dist < CONFIG.monsterMinDist){
        beginChase(monster);
      }
      return;
    }

    if(monster.state === 'chasing' || monster.state === 'attacking'){
      const toPlayer = new THREE.Vector3().subVectors(playerPos, monster.sprite.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      toPlayer.normalize();

      const speed = CONFIG.monsterChaseSpeed;
      monster.sprite.position.x += toPlayer.x * speed * dt;
      monster.sprite.position.z += toPlayer.z * speed * dt;

      monster.walkFrameTimer += dt;
      if(monster.walkFrameTimer > 0.18){
        monster.walkFrameTimer = 0;
        monster.walkFrameToggle = !monster.walkFrameToggle;
        monster.mat.map = monster.walkFrameToggle ? monster.texWalk1 : monster.texWalk2;
        monster.mat.needsUpdate = true;
      }

      if(dist < CONFIG.monsterAttackDist){
        triggerJumpscareDeath(monster);
      }
      return;
    }
  }

  function spawnStalker(monster, playerPos){
    const ang = Math.random() * Math.PI * 2;
    const dist = randRange(CONFIG.monsterSpawnMinRadius, CONFIG.monsterSpawnMaxRadius);
    monster.sprite.position.set(
      playerPos.x + Math.cos(ang) * dist,
      CONFIG.monsterSpriteHeight / 2,
      playerPos.z + Math.sin(ang) * dist
    );
    monster.mat.map = monster.texStalk;
    monster.mat.needsUpdate = true;
    monster.state = 'stalking';
    monster.visibleUntil = performance.now() + randRange(CONFIG.monsterVisibleDuration[0], CONFIG.monsterVisibleDuration[1]);
  }

  function hideMonster(monster, playerPos){
    monster.sprite.position.set(playerPos.x + 9999, CONFIG.monsterSpriteHeight / 2, playerPos.z + 9999);
    monster.state = 'hidden';
    monster.nextAppearAt = performance.now() + randRange(CONFIG.monsterAppearChanceMs[0], CONFIG.monsterAppearChanceMs[1]);
  }

  function beginChase(monster){
    monster.state = 'chasing';
    monster.mat.map = monster.texWalk1;
    monster.mat.needsUpdate = true;
  }

  function triggerJumpscareDeath(monster){
    if(isDead) return;
    isDead = true;
    window.__gameIsDead = true;
    monster.state = 'attacking';

    const img = document.getElementById('jumpscareImg');
    img.src = Graphics.getMonsterFiles().walk1;
    img.classList.add('show');

    document.exitPointerLock && document.exitPointerLock();

    setTimeout(() => {
      const surviveSec = Math.floor((performance.now() - startTime) / 1000);
      document.getElementById('surviveTime').textContent = surviveSec;
      document.getElementById('deathScreen').classList.add('show');
    }, 650);
  }

  /* ---------------------------------------------------------
     FLASHLIGHT TOGGLE
  --------------------------------------------------------- */
  function toggleFlashlight(){
    flashlightOn = !flashlightOn;
    Graphics.setFlashlightOn(flashlightOn, CONFIG);
  }

  /* ---------------------------------------------------------
     MAIN LOOP
  --------------------------------------------------------- */
  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();

    if(gameStarted && !isDead){
      PlayerCamera.update(dt);
      Graphics.recycleGround(PlayerCamera.getPlayerPos(), CONFIG);
      Graphics.updateFlashlightAnimation(clock.elapsedTime);
      updateMonster(dt, now);
    }

    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------
     START
  --------------------------------------------------------- */
  function startGame(){
    gameStarted = true;
    startTime = performance.now();
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('hud').classList.add('active');
    PlayerCamera.requestLock(document.querySelector('canvas'));
  }

  try {
    init();
  } catch(err){
    showFatalError('Setup failed: ' + (err && err.message ? err.message : err));
    throw err;
  }

})();
