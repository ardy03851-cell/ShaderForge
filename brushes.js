// brushes.js - Modular Paint Engine and Structural Definitions
const Brushes = {
    // --- INKS & PENS ---
    gelPen: { name: "Gel Pen", type: "smooth", bleed: 0, flow: 1.0, jitter: 0 },
    fountainPen: { name: "Fountain Pen", type: "caligraphy", angle: -45, aspect: 3 },
    sumiInk: { name: "Sumi Ink", type: "velocity-bleed", maxSpread: 4, viscosity: 0.1 },
    marker: { name: "Copic Marker", type: "flat-bristle", opacity: 0.3, overlap: true },
    ballpoint: { name: "Ballpoint Pen", type: "pressure-thin", pressureSens: 0.7, opacity: 0.8 },
    technical: { name: "Technical Pen", type: "fixed-pixel", crisp: true },

    // --- GRAPHITE & CHARCOALS ---
    pencilHB: { name: "HB Pencil", type: "grainy", density: 0.4, particleSize: 1.0 },
    pencil6B: { name: "6B Pencil", type: "grainy", density: 0.7, particleSize: 1.5 },
    charcoalBlock: { name: "Charcoal Block", type: "shredded", widthScale: 2.5, friction: 0.8 },
    vineCharcoal: { name: "Vine Charcoal", type: "soft-dust", falloff: 0.5 },
    chalk: { name: "Chalk", type: "textured-edge", roughness: 0.9 },
    crayon: { name: "Wax Crayon", type: "wax-waxy", slip: 0.4 },

    // --- PAINTS & BRUSHES ---
    oilBrush: { name: "Wet Oil Paint", type: "bristle-track", bristles: 14, smudge: 0.6 },
    dryBrush: { name: "Dry Acrylic", type: "bristle-track", bristles: 25, dryOut: true },
    watercolor: { name: "Watercolor Wash", type: "diluted", edgePooling: 1.2, opacity: 0.15 },
    gouache: { name: "Opaque Gouache", type: "heavy-body", paste: 0.9 },
    airbrush: { name: "Airbrush", type: "splatter-spray", sprayRadius: 2.5, soft: true },
    splatter: { name: "Ink Splatter", type: "flick", speedTrigger: true },

    // --- TRADITIONAL & ASIAN ---
    asianCallig: { name: "Asian Calligraphy", type: "tapered-hair", elastic: 0.8 },
    bambooBrush: { name: "Bamboo Ink", type: "variable-belly", reservoir: 100 },
    scratchPen: { name: "Scratch Quill", type: "scratchy", scratchCount: 2 },
    reedPen: { name: "Reed Split Pen", type: "double-line", separation: 1.5 },

    // --- TEXTURAL & EFFECTS ---
    sponge: { name: "Sea Sponge", type: "stipple-map", cluster: 12 },
    stipple: { name: "Stipple Dot", type: "pointillism", frequency: 8 },
    smoke: { name: "Incense Smoke", type: "perlin-cloud", drift: 1.1 },
    sprayPaint: { name: "Spray Can", type: "splatter-spray", sprayRadius: 5.0, dripChance: 0.02 },
    cloth: { name: "Woven Canvas", type: "crosshatch", spacing: 4 },
    pixel: { name: "8-Bit Shader", type: "aliased-block", size: 4 },
    blurBrush: { name: "Smudge Tool", type: "blend-finger", radius: 8 },
    waterDrip: { name: "Running Drip", type: "gravitational", gravity: 1.4 }
};

// Core Procedural Math Pipeline Engine
function paintProceduralStroke(ctx, p1, p2, cfg, style, globalCanvas) {
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(Math.floor(dist / (style.size / 4)), 1);

    const dt = p2.t - p1.t || 1;
    const velocity = Math.min(dist / dt, 10);

    let targetWidth = style.size;
    if (cfg.type === 'pressure-thin' || cfg.type === 'velocity-bleed' || cfg.type === 'tapered-hair') {
        targetWidth = Math.max(style.size * (1 - velocity * 0.12), style.size * 0.2);
    }

    for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const x = p1.x + dx * t;
        const y = p1.y + dy * t;
        const curWidth = style.lastWidth + (targetWidth - style.lastWidth) * t;

        ctx.save();

        switch (cfg.type) {
            case 'smooth':
                ctx.lineWidth = curWidth;
                ctx.beginPath(); ctx.moveTo(p1.x + dx * (i ? t : 0), p1.y + dy * (i ? t : 0));
                ctx.lineTo(x, y); ctx.stroke();
                break;

            case 'caligraphy':
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let w = -curWidth / 2; w < curWidth / 2; w += 0.5) {
                    const rad = cfg.angle * Math.PI / 180;
                    ctx.fillRect(x + Math.cos(rad) * w, y + Math.sin(rad) * w / cfg.aspect, 1.5, 1.5);
                }
                break;

            case 'velocity-bleed':
                const bleed = (1 + velocity * cfg.viscosity) * (Math.random() * cfg.maxSpread);
                ctx.globalAlpha = 0.85;
                ctx.beginPath(); ctx.arc(x, y, (curWidth + bleed) / 2, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'flat-bristle':
                ctx.globalAlpha = cfg.opacity;
                ctx.lineWidth = curWidth;
                ctx.lineCap = 'square';
                ctx.beginPath(); ctx.moveTo(x - 3, y - curWidth / 2); ctx.lineTo(x + 3, y + curWidth / 2);
                ctx.stroke();
                break;

            case 'grainy':
                ctx.globalAlpha = cfg.density;
                for (let p = 0; p < curWidth * 2; p++) {
                    const radius = (Math.random() * curWidth) / 2;
                    const theta = Math.random() * Math.PI * 2;
                    ctx.fillRect(x + Math.cos(theta) * radius, y + Math.sin(theta) * radius, cfg.particleSize, cfg.particleSize);
                }
                break;

            case 'shredded':
                ctx.globalAlpha = 0.4;
                for (let b = 0; b < 8; b++) {
                    ctx.fillRect(x + (Math.random() - 0.5) * curWidth * cfg.widthScale, y + (Math.random() - 0.5) * curWidth, 2, 2);
                }
                break;

            case 'bristle-track':
                ctx.globalAlpha = cfg.opacity || 0.9;
                for (let j = 0; j < cfg.bristles; j++) {
                    const offset = (j / cfg.bristles - 0.5) * curWidth;
                    ctx.fillRect(x + offset + (Math.random() - 0.5) * (cfg.dryOut ? 4 : 0.5), y + (Math.random() - 0.5) * 2, 1.2, 1.2);
                }
                break;

            case 'diluted':
                let grad = ctx.createRadialGradient(x, y, curWidth * 0.1, x, y, curWidth * cfg.edgePooling);
                ctx.globalAlpha = cfg.opacity;
                grad.addColorStop(0, style.color); grad.addColorStop(0.8, style.color); grad.addColorStop(1, '#ffffff00');
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, curWidth * cfg.edgePooling, 0, Math.PI * 2); ctx.fill();
                break;

            case 'splatter-spray':
                for (let s = 0; s < 15; s++) {
                    const r = Math.random() * curWidth * cfg.sprayRadius;
                    const a = Math.random() * Math.PI * 2;
                    ctx.globalAlpha = cfg.soft ? (1 - (r / (curWidth * cfg.sprayRadius))) * 0.3 : 0.6;
                    ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1);
                }
                break;

            case 'tapered-hair':
                ctx.lineWidth = curWidth;
                ctx.beginPath(); ctx.arc(x, y, curWidth / 2, 0, Math.PI * 2); ctx.fill();
                break;

            case 'scratchy':
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + curWidth, y + (Math.random() - 0.5) * 5); ctx.stroke();
                break;

            case 'double-line':
                ctx.lineWidth = 1;
                ctx.fillRect(x - cfg.separation, y, 1.5, 1.5); ctx.fillRect(x + cfg.separation, y, 1.5, 1.5);
                break;

            case 'stipple-map':
                ctx.globalAlpha = 0.3;
                for (let k = 0; k < cfg.cluster; k++) {
                    ctx.fillRect(x + (Math.random() - 0.5) * curWidth * 2, y + (Math.random() - 0.5) * curWidth * 2, 2 + Math.random() * 2, 2 + Math.random() * 2);
                }
                break;

            case 'pointillism':
                if (Math.random() < 0.3) {
                    ctx.beginPath(); ctx.arc(x + (Math.random() - 0.5) * curWidth, y + (Math.random() - 0.5) * curWidth, 1 + Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
                }
                break;

            case 'perlin-cloud':
                ctx.globalAlpha = 0.04;
                let sGrad = ctx.createRadialGradient(x, y, 1, x + (Math.random() - 0.5) * 10, y, curWidth * 3);
                sGrad.addColorStop(0, style.color); sGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = sGrad; ctx.beginPath(); ctx.arc(x, y, curWidth * 3, 0, Math.PI * 2); ctx.fill();
                break;

            case 'crosshatch':
                ctx.lineWidth = 0.5; ctx.globalAlpha = 0.4;
                ctx.beginPath(); ctx.moveTo(x - curWidth / 2, y); ctx.lineTo(x + curWidth / 2, y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x, y - curWidth / 2); ctx.lineTo(x, y + curWidth / 2); ctx.stroke();
                break;

            case 'aliased-block':
                ctx.fillRect(Math.floor(x / cfg.size) * cfg.size, Math.floor(y / cfg.size) * cfg.size, curWidth, curWidth);
                break;

            case 'blend-finger':
                if (globalCanvas) {
                    ctx.globalAlpha = 0.1;
                    ctx.drawImage(globalCanvas, x - cfg.radius, y - cfg.radius, cfg.radius * 2, cfg.radius * 2, x - cfg.radius + (dx * 0.1), y - cfg.radius + (dy * 0.1), cfg.radius * 2, cfg.radius * 2);
                }
                break;

            case 'gravitational':
                ctx.lineWidth = curWidth;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + (Math.random() * cfg.gravity * 4)); ctx.stroke();
                break;
        }
        ctx.restore();
    }
    return targetWidth;
}
