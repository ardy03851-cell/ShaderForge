/* =========================================================
   GRAPHICS.JS
   Scene setup, lighting, custom flashlight, ground, atmosphere,
   and the monster sprite/texture pipeline.

   Everything here is hand-built (no premade light helpers beyond
   THREE's base primitives) so every visual can be tuned freely:
     - flashlight is a real SpotLight PLUS a custom additive cone
       mesh (ShaderMaterial) for a visible volumetric beam, plus a
       soft circular falloff texture generated on a canvas (no
       external image needed) for a realistic lens-glow look.
     - monster textures are loaded with correct alpha handling so
       PNGs never show a black/box background.
========================================================= */

window.Graphics = (function(){

  let scene, camera, renderer, clock;
  let flashlight, flashlightTarget, flashlightCone, flashlightGlow;
  let groundTiles = [];
  let weeds = [];
  let monster = null;

  let texStalk, texWalk1, texWalk2;
  let texturesLoaded = 0;
  const TOTAL_TEXTURES = 3;

  const MONSTER_FILES = {
    stalk: 'Monster/stalk.png',
    walk1: 'Monster/walk1.png',
    walk2: 'Monster/walk2.png'
  };

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  function init(CONFIG, onMonsterReady){
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(
      72, window.innerWidth / window.innerHeight, 0.05, 200
    );

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch(e){
      throw new Error('WebGL could not start on this device/browser (' + e.message + ')');
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;
    else if('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping !== undefined ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.15;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    clock = new THREE.Clock();

    buildLighting(CONFIG);
    buildGroundGrid(CONFIG);
    loadMonsterTextures(CONFIG, onMonsterReady);

    window.addEventListener('resize', () => onResize());

    return { scene, camera, renderer, clock };
  }

  function onResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------------------------------------------------
     LIGHTING — ambient + moonlight + custom flashlight rig
  --------------------------------------------------------- */
  function buildLighting(CONFIG){
    const ambient = new THREE.AmbientLight(0x0a0a12, 0.5);
    scene.add(ambient);

    const moon = new THREE.DirectionalLight(0x1a1a2a, 0.14);
    moon.position.set(10, 30, -10);
    scene.add(moon);

    // Real SpotLight for actual scene illumination (cheap, fast, affects materials)
    flashlight = new THREE.SpotLight(
      0xfff2cf,
      CONFIG.flashlightIntensity,
      CONFIG.flashlightDistance,
      CONFIG.flashlightAngle,
      0.45,   // penumbra — soft falloff at the rim, feels more like a real lamp
      1.6     // decay — physically-ish falloff over distance
    );
    flashlight.position.set(0.12, -0.08, 0.05); // slight handheld offset from eye center
    flashlightTarget = new THREE.Object3D();
    flashlightTarget.position.set(0, -0.05, -1);
    camera.add(flashlightTarget);
    flashlight.target = flashlightTarget;
    camera.add(flashlight);

    // Custom volumetric beam cone — a hand-built ShaderMaterial cone that
    // fakes a dusty, visible light shaft without needing postprocessing.
    flashlightCone = buildVolumetricCone(CONFIG);
    camera.add(flashlightCone);

    // Soft circular glow sprite at the lamp head — a tiny hand-drawn canvas
    // texture (no external asset) for a warm bloom right at the source.
    flashlightGlow = buildLensGlow();
    camera.add(flashlightGlow);

    scene.add(camera);
  }

  // A canvas-generated radial gradient used both for the lens glow sprite
  // and as the falloff alpha map for the volumetric cone — fully custom,
  // no premade asset, and editable by tweaking the stops below.
  function makeRadialGradientTexture(innerColor, outerColor, size = 128){
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0.0, innerColor);
    g.addColorStop(0.35, innerColor);
    g.addColorStop(1.0, outerColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function buildLensGlow(){
    const tex = makeRadialGradientTexture('rgba(255,244,214,0.9)', 'rgba(255,244,214,0)');
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: 0xfff4d6,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.85
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.16, 0.16, 1);
    sprite.position.set(0.12, -0.08, -0.12);
    sprite.renderOrder = 5;
    return sprite;
  }

  // Builds a real cone mesh that sits inside the flashlight's beam and
  // fakes volumetric "dust in the light" scattering using a custom GLSL
  // shader: it fades along its length, fades toward its rim, and gently
  // flickers so it reads as a live light shaft instead of a flat cone.
  function buildVolumetricCone(CONFIG){
    const length = CONFIG.flashlightDistance * 0.92;
    const radius = Math.tan(CONFIG.flashlightAngle) * length;

    const geo = new THREE.ConeGeometry(radius, length, 28, 1, true);
    // ConeGeometry points up +Y by default with its apex at the top;
    // we want the apex at the camera (origin) pointing down -Z.
    geo.translate(0, -length/2, 0);
    geo.rotateX(-Math.PI/2);

    const uniforms = {
      uColor: { value: new THREE.Color(0xfff2cf) },
      uTime: { value: 0 },
      uOpacity: { value: 0.10 }
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vPos;
        void main(){
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uOpacity;
        varying vec3 vPos;
        void main(){
          // vPos.z runs from 0 (apex/eye) to -length (far end) after our transform
          float t = clamp(-vPos.z / ${length.toFixed(2)}, 0.0, 1.0);

          // fade in slightly from the very tip (avoids a hard bright point at the eye),
          // then fade out gently toward the far end of the beam
          float lengthFade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.55, 1.0, t));

          // radial fade toward the cone's outer rim, using local xy distance
          // relative to the cone radius at this point along its length
          float radial = length(vPos.xy);
          float maxRadiusHere = mix(0.001, ${radius.toFixed(3)}, t);
          float rim = 1.0 - smoothstep(0.0, maxRadiusHere, radial);

          // subtle dust-shimmer flicker so the beam doesn't look static
          float flicker = 0.92 + 0.08 * sin(uTime * 3.1 + vPos.x * 6.0 + vPos.y * 4.0);

          float alpha = lengthFade * rim * uOpacity * flicker;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0.12, -0.08, 0.05);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    return mesh;
  }

  function updateFlashlightAnimation(t){
    if(flashlightCone) flashlightCone.material.uniforms.uTime.value = t;
  }

  function setFlashlightOn(on, CONFIG){
    flashlight.intensity = on ? CONFIG.flashlightIntensity : 0;
    flashlightCone.visible = on;
    flashlightGlow.visible = on;
  }

  /* ---------------------------------------------------------
     GROUND — infinite tiled plane + scattered weed sprites
  --------------------------------------------------------- */
  function buildGroundGrid(CONFIG){
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d0d,
      roughness: 1,
      metalness: 0
    });

    const geo = new THREE.PlaneGeometry(CONFIG.tileSize, CONFIG.tileSize, 1, 1);
    geo.rotateX(-Math.PI/2);

    for(let x = -1; x <= 1; x++){
      for(let z = -1; z <= 1; z++){
        const tile = new THREE.Mesh(geo, groundMat);
        tile.position.set(x * CONFIG.tileSize, 0, z * CONFIG.tileSize);
        tile.userData.gx = x;
        tile.userData.gz = z;
        tile.receiveShadow = false;
        scene.add(tile);
        groundTiles.push(tile);
      }
    }

    addAtmosphereDetail();
  }

  function addAtmosphereDetail(){
    const weedMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const weedGeo = new THREE.PlaneGeometry(0.4, 0.9);
    for(let i = 0; i < 140; i++){
      const w = new THREE.Mesh(weedGeo, weedMat);
      const ang = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 40;
      w.position.set(Math.cos(ang) * dist, 0.45, Math.sin(ang) * dist);
      w.rotation.y = Math.random() * Math.PI;
      scene.add(w);
      weeds.push(w);
    }
  }

  function recycleGround(playerPos, CONFIG){
    const cx = Math.round(playerPos.x / CONFIG.tileSize);
    const cz = Math.round(playerPos.z / CONFIG.tileSize);

    let idx = 0;
    for(let x = -1; x <= 1; x++){
      for(let z = -1; z <= 1; z++){
        const tile = groundTiles[idx++];
        tile.position.x = cx * CONFIG.tileSize + x * CONFIG.tileSize;
        tile.position.z = cz * CONFIG.tileSize + z * CONFIG.tileSize;
      }
    }

    weeds.forEach(w => {
      const dx = w.position.x - playerPos.x;
      const dz = w.position.z - playerPos.z;
      if(dx*dx + dz*dz > 45*45){
        const ang = Math.random() * Math.PI * 2;
        const dist = 25 + Math.random() * 20;
        w.position.x = playerPos.x + Math.cos(ang) * dist;
        w.position.z = playerPos.z + Math.sin(ang) * dist;
      }
    });
  }

  /* ---------------------------------------------------------
     MONSTER TEXTURES — fixed transparency handling.

     THE BUG: the original code never set alphaTest and left
     depthWrite:true on a transparent sprite. PNGs with soft /
     anti-aliased alpha edges (or texture filtering on a sprite
     billboard) then write a faint halo into the depth buffer
     and read as a dark/black box behind the character, because
     partially-transparent edge pixels are still treated as
     opaque enough to occlude. The fix: depthWrite:false (sprites
     don't need to write depth, they're billboards) and an
     alphaTest cutoff so near-fully-transparent pixels are
     discarded outright instead of blended.
  --------------------------------------------------------- */
  function loadMonsterTextures(CONFIG, onReady){
    const loader = new THREE.TextureLoader();
    const statusEl = document.getElementById('loadStatus');
    if(statusEl) statusEl.textContent = 'loading entity...';

    const onErr = (file) => {
      if(statusEl) statusEl.textContent = 'MISSING: ' + file + ' — place it in the Monster/ folder next to this HTML file.';
    };

    const configureTex = (tex) => {
      // Correct color space so the PNG isn't washed out / darkened.
      if('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      else tex.encoding = THREE.sRGBEncoding;
      // Premultiplied alpha off (default) + correct filtering avoids
      // a faint dark fringe along soft PNG edges.
      tex.premultiplyAlpha = false;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    };

    loader.load(MONSTER_FILES.stalk, (tex) => { texStalk = configureTex(tex); textureReady(CONFIG, onReady); }, undefined, () => onErr(MONSTER_FILES.stalk));
    loader.load(MONSTER_FILES.walk1, (tex) => { texWalk1 = configureTex(tex); textureReady(CONFIG, onReady); }, undefined, () => onErr(MONSTER_FILES.walk1));
    loader.load(MONSTER_FILES.walk2, (tex) => { texWalk2 = configureTex(tex); textureReady(CONFIG, onReady); }, undefined, () => onErr(MONSTER_FILES.walk2));
  }

  function textureReady(CONFIG, onReady){
    texturesLoaded++;
    if(texturesLoaded >= TOTAL_TEXTURES){
      const statusEl = document.getElementById('loadStatus');
      if(statusEl) statusEl.textContent = '';
      createMonster(CONFIG);
      if(onReady) onReady(monster);
    }
  }

  function createMonster(CONFIG){
    const mat = new THREE.SpriteMaterial({
      map: texStalk,
      transparent: true,
      depthWrite: false,   // FIX: sprites are billboards, never write depth
      depthTest: true,
      alphaTest: 0.35,     // FIX: discard near-transparent edge pixels instead of blending a box
      color: 0xffffff
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(CONFIG.monsterSpriteWidth, CONFIG.monsterSpriteHeight, 1);
    sprite.position.set(0, CONFIG.monsterSpriteHeight/2, -1000);
    scene.add(sprite);

    monster = {
      sprite,
      mat,
      texStalk, texWalk1, texWalk2,
      state: 'hidden',
      nextAppearAt: performance.now() + (2000 + Math.random()*3000),
      visibleUntil: 0,
      walkFrameTimer: 0,
      walkFrameToggle: false
    };
  }

  function getMonster(){ return monster; }
  function getMonsterFiles(){ return MONSTER_FILES; }

  return {
    init,
    onResize,
    recycleGround,
    setFlashlightOn,
    updateFlashlightAnimation,
    getMonster,
    getMonsterFiles
  };

})();
