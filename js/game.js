(() => {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const els = {
    hud: document.getElementById("hud"),
    powerWrap: document.getElementById("power-wrap"),
    powerFill: document.getElementById("power-fill"),
    airWrap: document.getElementById("air-wrap"),
    airFill: document.getElementById("air-fill"),
    mobile: document.getElementById("mobile-controls"),
    btnPause: document.getElementById("btn-pause"),
    btnRestart: document.getElementById("btn-restart"),
    btnThrust: document.getElementById("btn-thrust"),
    overlayStart: document.getElementById("overlay-start"),
    overlayPause: document.getElementById("overlay-pause"),
    overlayEnd: document.getElementById("overlay-end"),
    endTitle: document.getElementById("end-title"),
    endMessage: document.getElementById("end-message"),
    btnStart: document.getElementById("btn-start"),
    btnResume: document.getElementById("btn-resume"),
    btnRestartPause: document.getElementById("btn-restart-pause"),
    btnRetry: document.getElementById("btn-retry"),
  };

  const IMG = {
    fondo: "Images/Fondo.png",
    nave: "Images/Nave.png",
    estrella: "Images/Estrella amarilla.png",
    planeta: "Images/Planeta 1.png",
    planeta2: "Images/Planeta 2.png",
    asteroide: "Images/Asteroide.png",
    estacion: "Images/Estacion espacial.png",
    satelite: "Images/Sate\u0301lite.png",
  };

  const images = {};
  let imagesReady = false;

  const Phase = {
    MENU: "menu",
    AIM: "aim",
    CHARGE: "charge",
    FLY: "fly",
    ORBIT_LOCK: "orbit_lock",
    ORBIT_SLING: "orbit_sling",
    DOCKED: "docked",
    PAUSE: "pause",
    END: "end",
  };

  const state = {
    phase: Phase.MENU,
    prevPhase: Phase.AIM,
    w: 0,
    h: 0,
    dpr: 1,
    minDim: 0,
    ship: null,
    star: null,
    planet: null,
    planet2: null,
    asteroid: null,
    station: null,
    satellite: null,
    starBelt: null,
    safeBelt: null,
    safe: null,
    aimAngle: -Math.PI / 2,
    power: 0,
    chargeStart: 0,
    keys: { up: false, down: false, left: false, right: false, space: false },
    spaceWasDown: false,
    thrustCooldown: 0,
    air: 1,
    airRefillPerSec: 0.85,
    particles: [],
    ventBursts: [],
    lastTime: 0,
    won: false,
    endReason: "",
    isMobile: false,
    isPortraitMobile: false,
    controlsH: 0,
    playH: 0,
    touchAiming: false,
    tip: { key: "", text: "", until: 0 },
    launchFromStation: false,
  };

  function loadImages() {
    const entries = Object.entries(IMG);
    let loaded = 0;
    return new Promise((resolve) => {
      const done = () => {
        loaded += 1;
        if (loaded === entries.length) {
          imagesReady = true;
          resolve();
        }
      };
      entries.forEach(([key, src]) => {
        const img = new Image();
        img.onload = done;
        img.onerror = () => {
          // Fallback NFC/ASCII por nombres con tilde en macOS
          if (key === "estacion" && !img.dataset.retried) {
            img.dataset.retried = "1";
            img.src = "Images/Estaci\u00f3n espacial.png";
            return;
          }
          if (key === "satelite" && !img.dataset.retried) {
            img.dataset.retried = "1";
            img.src = "Images/Sat\u00e9lite.png";
            return;
          }
          console.error("No se pudo cargar:", src);
          done();
        };
        img.src = src;
        images[key] = img;
      });
    });
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + "px";
    canvas.style.height = state.h + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.isMobile = window.matchMedia("(max-width: 899px)").matches || "ontouchstart" in window;
    state.isPortraitMobile = state.isMobile && state.h > state.w * 1.05;
    // Zona de controles en móvil (debe coincidir con CSS)
    state.controlsH = state.isMobile
      ? Math.round(Math.max(188, Math.min(236, state.h * (state.isPortraitMobile ? 0.26 : 0.22))))
      : 0;
    state.playH = state.h - state.controlsH;
    document.documentElement.style.setProperty("--controls-h", state.controlsH + "px");
    state.minDim = state.isPortraitMobile
      ? Math.min(state.w, state.playH * 0.72)
      : Math.min(state.w, state.h);
    if (state.phase !== Phase.MENU && state.phase !== Phase.END) {
      layoutWorld(false);
    }
  }

  function layoutWorld(resetDynamic) {
    const m = state.minDim;
    const cx = state.w * 0.5;
    const playH = state.playH || state.h;
    // En móvil alto: repartir mejor el escenario vertical (arriba del panel de controles)
    const cy = state.isPortraitMobile ? playH * 0.46 : state.h * 0.52;

    // Elementos un poco más grandes en móvil vertical para aprovechar altura
    const sizeBoost = state.isPortraitMobile ? 1.18 : 1;
    const shipR = m * 0.016 * sizeBoost;
    const starR = m * 0.040 * sizeBoost;
    const planetR = m * 0.020 * sizeBoost;
    const asteroidR = m * 0.018 * sizeBoost;
    const safeR = shipR * 2.05;
    const rockR = m * 0.015 * sizeBoost;
    const safeBeltR = safeR + m * 0.055;

    const starRed = starR * 1.12;
    const starOrange = starR * 1.45;
    const starGreen = starR * 1.88;
    const planetRed = planetR * 1.12;
    const planetGreen = planetR * 1.50;
    const planet2R = planetR * 0.92;
    const planet2Red = planet2R * 1.12;
    const planet2Green = planet2R * 1.50;

    // En móvil: bajar el área segura para que su cinturón no se corte arriba (HUD + notch)
    const topPad = state.isMobile ? Math.max(48, state.h * 0.05) : 22;
    const safeY = state.isPortraitMobile
      ? Math.max(safeBeltR + rockR * 1.5 + topPad, playH * 0.105)
      : Math.max(safeR + 18, state.h * 0.055);
    const shipStartX = state.isMobile ? state.w * 0.14 : state.w * 0.16;
    const shipStartY = state.isMobile
      ? playH - shipR - 10
      : Math.min(state.h - shipR - 70, state.h * 0.91);
    const clearance = m * 0.05;

    // Cinturón estelar y corredor superior
    const starBeltThick = rockR * 1.8;
    let starBeltR = starGreen + m * 0.02;
    const starBeltOuter = starBeltR + starBeltThick;

    const safeBeltUnderside = (cy - safeY) - safeBeltR - rockR * 1.6;
    const corridorLo = starBeltOuter + Math.max(planetGreen, planet2Green) + m * 0.02;
    const corridorHi = safeBeltUnderside - Math.max(planetGreen, planet2Green) - m * 0.02;
    const corridorMid = (corridorLo + corridorHi) * 0.5;

    const maxReachDown =
      Math.abs(shipStartY - cy) - shipR - clearance * 0.3 - planetGreen;
    const maxReachSide = state.w * 0.5 - planetGreen - m * 0.02;

    // Planeta 1 (naranja): elipse horizontal — ancha a los lados, baja altura
    const p1ry = Math.min(
      corridorMid,
      Math.max(starBeltOuter + planetGreen + m * 0.025, corridorLo + (corridorHi - corridorLo) * 0.35)
    );
    const p1rx = Math.min(maxReachSide * 0.96, Math.max(p1ry * 1.85, starBeltOuter + m * 0.22));
    const p1oy = 0;

    // Planeta 2 (verde): elipse vertical — un poco menos cerca de la nave;
    // horizontalmente más abierta para alejarse de los agujeros del cinturón
    const p2Top = Math.min(corridorHi - m * 0.005, corridorMid + m * 0.02);
    const p2Bot = Math.min(maxReachDown * 0.72, Math.max(p2Top + m * 0.14, maxReachDown * 0.65));
    const p2oy = (p2Bot - p2Top) * 0.5;
    const p2ry = (p2Bot + p2Top) * 0.5;
    const p2rx = Math.min(
      p1rx * 0.68,
      Math.max(starBeltOuter + planet2Green + m * 0.09, p1rx * 0.58)
    );

    const planetOmega = (sign, wide) => {
      // Elipse ancha un poco más lenta; la vertical un poco más ágil
      const base = state.isMobile ? (wide ? 0.46 : 0.56) : wide ? 0.52 : 0.64;
      return sign * base;
    };

    const assignAxisEllipse = (planet, rx, ry, oy) => {
      planet.orbitRx = rx;
      planet.orbitRy = ry;
      planet.orbitOy = oy;
      planet.orbitA = null;
      planet.orbitE = null;
      planet.orbitPeri = null;
      planet.orbitB = null;
      planet.orbitC = null;
      planet.orbitRMin = Math.min(rx, ry);
      planet.orbitRMax = Math.max(rx, ry);
      planet.orbitR = rx;
    };

    if (!state.star || resetDynamic) {
      state.star = {
        x: cx,
        y: cy,
        r: starR,
        red: starRed,
        orange: starOrange,
        green: starGreen,
      };
    } else {
      Object.assign(state.star, {
        x: cx,
        y: cy,
        r: starR,
        red: starRed,
        orange: starOrange,
        green: starGreen,
      });
    }

    // Planeta 1: elipse naranja (horizontal)
    if (!state.planet || resetDynamic) {
      state.planet = {
        angle: Math.PI, // empieza a la izquierda (como en el boceto)
        orbitR: p1rx,
        orbitRx: p1rx,
        orbitRy: p1ry,
        orbitOy: p1oy,
        r: planetR,
        red: planetRed,
        green: planetGreen,
        omega: planetOmega(1, true),
        x: 0,
        y: 0,
      };
    } else {
      state.planet.r = planetR;
      state.planet.red = planetRed;
      state.planet.green = planetGreen;
      state.planet.omega = planetOmega(Math.sign(state.planet.omega) || 1, true);
    }
    assignAxisEllipse(state.planet, p1rx, p1ry, p1oy);

    // Planeta 2: elipse verde (vertical), sentido contrario
    if (!state.planet2 || resetDynamic) {
      state.planet2 = {
        angle: Math.PI / 2, // empieza abajo (como en el boceto)
        orbitR: p2ry,
        orbitRx: p2rx,
        orbitRy: p2ry,
        orbitOy: p2oy,
        r: planet2R,
        red: planet2Red,
        green: planet2Green,
        omega: planetOmega(-1, false),
        x: 0,
        y: 0,
      };
    } else {
      state.planet2.r = planet2R;
      state.planet2.red = planet2Red;
      state.planet2.green = planet2Green;
      state.planet2.omega = planetOmega(Math.sign(state.planet2.omega) || -1, false);
    }
    assignAxisEllipse(state.planet2, p2rx, p2ry, p2oy);

    state.safe = {
      x: cx,
      y: safeY,
      r: safeR,
    };

    // Estación a la derecha, fuera del arco superior de la elipse naranja
    const stationW = m * 0.11;
    const stationH = stationW * (1024 / 1536);
    const stationBaseX = Math.min(state.w - stationW * 0.55, state.safe.x + m * 0.34);
    const stationBaseY = state.safe.y + m * 0.06;
    if (!state.station || resetDynamic) {
      state.station = {
        x: stationBaseX,
        y: stationBaseY,
        baseX: stationBaseX,
        baseY: stationBaseY,
        w: stationW,
        h: stationH,
        angle: 0,
        bobPhase: 0,
        bobAmp: m * 0.012,
        bobSpeed: 1.35,
        // Tubo amarillo abajo-izquierda en el sprite (coords locales normalizadas)
        dockLocal: { x: -0.20, y: 0.30 },
        bodyR: stationW * 0.28,
        dockR: shipR * 1.35,
      };
    } else {
      state.station.baseX = stationBaseX;
      state.station.baseY = stationBaseY;
      state.station.x = stationBaseX;
      state.station.y = stationBaseY + Math.sin(state.station.bobPhase || 0) * state.station.bobAmp;
      state.station.w = stationW;
      state.station.h = stationH;
      state.station.bobAmp = m * 0.012;
      state.station.bobSpeed = 1.35;
      state.station.angle = 0;
      state.station.bodyR = stationW * 0.28;
      state.station.dockR = shipR * 1.35;
    }

    // Satélite obstáculo (izquierda): balanceo vertical como la estación, sin auras
    const satW = m * 0.085;
    const satH = satW * 0.85;
    const satBaseX = state.w * 0.36;
    const satBaseY = cy + m * 0.15;
    if (!state.satellite || resetDynamic) {
      state.satellite = {
        x: satBaseX,
        y: satBaseY,
        baseX: satBaseX,
        baseY: satBaseY,
        w: satW,
        h: satH,
        bobPhase: 1.1,
        bobAmp: m * 0.014,
        bobSpeed: 1.25,
        bodyR: satW * 0.38,
      };
    } else {
      state.satellite.baseX = satBaseX;
      state.satellite.baseY = satBaseY;
      state.satellite.x = satBaseX;
      state.satellite.y =
        satBaseY + Math.sin(state.satellite.bobPhase || 0) * state.satellite.bobAmp;
      state.satellite.w = satW;
      state.satellite.h = satH;
      state.satellite.bobAmp = m * 0.014;
      state.satellite.bobSpeed = 1.25;
      state.satellite.bodyR = satW * 0.38;
    }

    // Agujeros del cinturón estelar: izquierda, superior-derecha e inferior
    const holePad = ((Math.PI * 2) / 36) * 2;
    const starHoles = [
      { center: Math.PI, width: 0.62 + holePad },
      { center: -Math.PI * 0.28, width: 0.55 + holePad },
      { center: Math.PI / 2, width: 0.68 + holePad },
    ];
    state.starBelt = buildBeltRocks(cx, cy, starBeltR, starHoles, 24, rockR, true);
    state.starBelt.orbitOmega = 0;

    // Cinturón parcial del área segura: hueco hacia la estación; gira despacio
    const toStation = Math.atan2(state.station.y - state.safe.y, state.station.x - state.safe.x);
    const gapHalf = 0.42;
    const safeHoles = [{ center: toStation, width: gapHalf * 2 }];
    state.safeBelt = buildBeltRocks(state.safe.x, state.safe.y, safeBeltR, safeHoles, 22, rockR * 0.9, true);
    state.safeBelt.orbitOmega = 0.18;
    updateAllPlanetPos();

    if (!state.asteroid || resetDynamic) {
      state.asteroid = {
        x: state.w + asteroidR * 3,
        y: Math.min(cy - starBeltR - m * 0.12, state.safe.y + m * 0.28),
        r: asteroidR,
        speed: m * 0.18,
      };
    } else {
      state.asteroid.y = Math.min(cy - starBeltR - m * 0.12, state.safe.y + m * 0.28);
      state.asteroid.r = asteroidR;
      state.asteroid.speed = m * 0.18;
    }

    if (!state.ship || resetDynamic) {
      state.ship = {
        x: shipStartX,
        y: shipStartY,
        r: shipR,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        alive: true,
        orbitHost: null,
        orbitR: 0,
        orbitAngle: 0,
        orbitOmega: 0,
        orbitGrace: 0,
        beltGrace: 0,
        dockGrace: 0,
      };
      state.aimAngle = -Math.PI / 2;
    } else {
      state.ship.r = shipR;
    }
  }

  /** Genera rocas en un anillo, omitiendo agujeros angulares */
  function buildBeltRocks(cx, cy, radius, holes, count, baseR, closed) {
    const rocks = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI;
      if (holes.some((h) => angleInHole(a, h.center, h.width))) continue;
      const jitter = (Math.sin(i * 12.9898) * 0.5 + 0.5) * baseR * 0.55;
      const rr = radius + (Math.cos(i * 7.13) * 0.5) * baseR * 0.7;
      rocks.push({
        angle: a,
        r: rr,
        size: baseR * (0.75 + (i % 5) * 0.08),
        spin: (i % 2 === 0 ? 1 : -1) * (0.3 + (i % 4) * 0.15),
        rot: i * 0.7,
        x: cx + Math.cos(a) * rr,
        y: cy + Math.sin(a) * rr,
      });
    }
    return { cx, cy, radius, rocks, holes, closed: !!closed, orbitOmega: 0 };
  }

  function angleInHole(a, center, width) {
    let d = Math.abs(normalizeAngle(a - center));
    return d < width * 0.5;
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function updateBeltPositions(belt) {
    if (!belt) return;
    for (const rock of belt.rocks) {
      rock.x = belt.cx + Math.cos(rock.angle) * rock.r;
      rock.y = belt.cy + Math.sin(rock.angle) * rock.r;
    }
  }

  function getStationDockWorld() {
    const st = state.station;
    const lx = st.dockLocal.x * st.w;
    const ly = st.dockLocal.y * st.h;
    const c = Math.cos(st.angle);
    const s = Math.sin(st.angle);
    return {
      x: st.x + lx * c - ly * s,
      y: st.y + lx * s + ly * c,
      dir: Math.atan2(ly, lx) + st.angle,
    };
  }

  function planetEllipseRadius(p) {
    if (!p || !state.star) return 0;
    return Math.hypot(p.x - state.star.x, p.y - state.star.y) || p.orbitR || 0;
  }

  function updatePlanetPos(p) {
    if (!p || !state.star) return;
    const s = state.star;
    const rx = p.orbitRx != null ? p.orbitRx : p.orbitRMax || p.orbitR;
    const ry = p.orbitRy != null ? p.orbitRy : p.orbitRMin || p.orbitR;
    const oy = p.orbitOy || 0;
    // Elipse cartesiana suave (horizontal u vertical según rx/ry)
    p.x = s.x + Math.cos(p.angle) * rx;
    p.y = s.y + oy + Math.sin(p.angle) * ry;
    p.orbitR = Math.hypot(p.x - s.x, p.y - s.y);
  }

  function getHostWorldVelocity(host) {
    if (!isPlanetHost(host)) return { vx: 0, vy: 0 };
    const omega = host.omega;
    const ang = host.angle;
    const rx = host.orbitRx != null ? host.orbitRx : host.orbitR;
    const ry = host.orbitRy != null ? host.orbitRy : host.orbitR;
    return {
      vx: -Math.sin(ang) * omega * rx,
      vy: Math.cos(ang) * omega * ry,
    };
  }

  function updateAllPlanetPos() {
    updatePlanetPos(state.planet);
    updatePlanetPos(state.planet2);
  }

  function getPlanets() {
    return [state.planet, state.planet2].filter(Boolean);
  }

  function resetLevel() {
    layoutWorld(true);
    state.phase = Phase.AIM;
    state.power = 0;
    state.chargeStart = 0;
    state.thrustCooldown = 0;
    state.air = 1;
    state.particles = [];
    state.ventBursts = [];
    state.spaceWasDown = false;
    state.keys.space = false;
    state.won = false;
    state.endReason = "";
    state.touchAiming = false;
    state.tip = { key: "", text: "", until: 0 };
    els.powerWrap.classList.add("hidden");
    els.powerFill.style.width = "0%";
    els.airWrap.classList.remove("hidden");
    updateAirBar();
    els.overlayEnd.classList.add("hidden");
    els.overlayPause.classList.add("hidden");
    els.overlayStart.classList.add("hidden");
    els.hud.classList.remove("hidden");
    updateMobileUI();
    setThrustEnabled(true);
  }

  function updateMobileUI() {
    if (state.isMobile && state.phase !== Phase.MENU && state.phase !== Phase.END) {
      els.mobile.classList.remove("hidden");
    } else {
      els.mobile.classList.add("hidden");
    }
  }

  function setThrustEnabled(on) {
    els.btnThrust.disabled = !on;
  }

  function startGame() {
    if (!imagesReady) return;
    resetLevel();
  }

  function pauseGame() {
    if (state.phase === Phase.MENU || state.phase === Phase.END || state.phase === Phase.PAUSE) return;
    state.prevPhase = state.phase;
    state.phase = Phase.PAUSE;
    els.overlayPause.classList.remove("hidden");
    els.mobile.classList.add("hidden");
  }

  function resumeGame() {
    if (state.phase !== Phase.PAUSE) return;
    state.phase = state.prevPhase;
    els.overlayPause.classList.add("hidden");
    updateMobileUI();
    setThrustEnabled(state.phase !== Phase.ORBIT_LOCK);
    state.lastTime = performance.now();
  }

  function endGame(won, reason) {
    state.phase = Phase.END;
    state.won = won;
    state.endReason = reason;
    state.ship.alive = won ? state.ship.alive : false;
    els.overlayEnd.classList.remove("hidden");
    els.endTitle.textContent = won ? "¡Victoria!" : "Nivel fallido";
    els.endTitle.className = won ? "win" : "lose";
    els.endMessage.textContent = reason;
    els.mobile.classList.add("hidden");
    els.powerWrap.classList.add("hidden");
    els.airWrap.classList.add("hidden");
  }

  function updateAirBar() {
    const pct = Math.max(0, Math.min(1, state.air)) * 100;
    els.airFill.style.width = pct.toFixed(1) + "%";
    els.airWrap.classList.toggle("empty", state.air < 0.999);
    els.airWrap.classList.toggle("ready", state.air >= 0.999);
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function shipSpeed() {
    return Math.hypot(state.ship.vx, state.ship.vy);
  }

  function maxLaunchSpeed() {
    return state.minDim * 0.85;
  }

  function airBrakeAmount(axisSpeed) {
    // Frenado moderado por uso (~30% del eje, con tope razonable)
    const soft = Math.abs(axisSpeed) * 0.30;
    const floor = state.minDim * 0.022;
    const cap = state.minDim * 0.055;
    return Math.min(Math.max(soft, floor), cap);
  }

  function safeSpeedLimit() {
    return state.minDim * 0.045;
  }

  /** Velocidad máxima para “asentarse” en un aura (verde/naranja), igual idea que el área segura */
  function orbitCaptureSpeed() {
    return state.minDim * 0.052;
  }

  function isPlanetHost(host) {
    return host === state.planet || host === state.planet2;
  }

  // ——— Input ———
  function beginCharge() {
    if (state.phase !== Phase.AIM && state.phase !== Phase.DOCKED) return;
    state.launchFromStation = state.phase === Phase.DOCKED;
    state.phase = Phase.CHARGE;
    state.chargeStart = performance.now();
    state.power = 0;
    els.powerWrap.classList.remove("hidden");
  }

  function releaseCharge() {
    if (state.phase !== Phase.CHARGE) return;
    const speed = state.power * maxLaunchSpeed();
    const fromStation = state.launchFromStation;
    state.ship.vx = Math.cos(state.aimAngle) * speed;
    state.ship.vy = Math.sin(state.aimAngle) * speed;
    state.ship.angle = state.aimAngle;
    if (fromStation) {
      state.ship.dockGrace = 0.55;
    }
    state.launchFromStation = false;
    state.phase = Phase.FLY;
    els.powerWrap.classList.add("hidden");
    els.airWrap.classList.remove("hidden");
    updateAirBar();
    spawnExhaust(state.ship.x, state.ship.y, state.aimAngle + Math.PI, 12);
  }

  function trySlingshot() {
    if (state.phase !== Phase.ORBIT_SLING) return;
    const ship = state.ship;
    if (!ship.orbitHost) return;

    const host = ship.orbitHost.ref;
    const omega = ship.orbitOmega;
    const r = ship.orbitR;

    let vx;
    let vy;

    if (isPlanetHost(host)) {
      // Dirección planeta → estrella
      const fromStarX = host.x - state.star.x;
      const fromStarY = host.y - state.star.y;
      const fl = Math.hypot(fromStarX, fromStarY) || 1;
      const fx = fromStarX / fl;
      const fy = fromStarY / fl;

      // Salir del borde verde hacia la estrella (recorrido visible)
      const placeR = fl - host.green - ship.r * 0.45;
      ship.x = state.star.x + fx * Math.max(placeR, host.r + ship.r);
      ship.y = state.star.y + fy * Math.max(placeR, host.r + ship.r);

      // Impulso hacia la estrella (visible, no instantáneo)
      const speed = state.isMobile ? state.minDim * 0.034 : state.minDim * 0.045;
      vx = -fx * speed;
      vy = -fy * speed;

      // Hereda un poco la tangente del planeta (sin dominar el impulso)
      const hv = getHostWorldVelocity(host);
      vx += hv.vx * 0.28;
      vy += hv.vy * 0.28;

      // Cruzar el cinturón estelar en el trayecto planeta → estrella
      ship.orbitGrace = 1.1;
      ship.beltGrace = 1.15;
    } else {
      // Propulsión de la estrella: magnitud fija (no sube con la órbita visual más rápida)
      const propBase = 0.10;
      const propOmega = Math.sign(omega || 1) * propBase * (state.minDim / Math.max(r, 1)) * 0.35;
      const exitScale = 0.55;
      vx = -Math.sin(ship.orbitAngle) * propOmega * r * exitScale;
      vy = Math.cos(ship.orbitAngle) * propOmega * r * exitScale;
      const boost = Math.max(orbitCaptureSpeed() * 0.85, Math.hypot(vx, vy) * 0.08);
      vx += Math.cos(ship.orbitAngle) * boost;
      vy += Math.sin(ship.orbitAngle) * boost;
      ship.orbitGrace = 0.45;
    }

    ship.vx = vx;
    ship.vy = vy;
    ship.angle = Math.atan2(ship.vy, ship.vx);
    ship.orbitHost = null;
    state.phase = Phase.FLY;
    setThrustEnabled(true);
    spawnExhaust(ship.x, ship.y, ship.angle + Math.PI, 16);
  }

  function tryDock() {
    if (state.phase !== Phase.FLY) return false;
    const ship = state.ship;
    if (ship.dockGrace > 0) return false;
    const st = state.station;
    const dock = getStationDockWorld();
    const d = dist(ship.x, ship.y, dock.x, dock.y);
    if (d > st.dockR + ship.r) return false;

    // Debe acercarse por el lado del tubo (cono hacia afuera)
    const toShip = Math.atan2(ship.y - dock.y, ship.x - dock.x);
    const align = Math.abs(normalizeAngle(toShip - dock.dir));
    if (align > 0.7) return false;

    // Preferible llegar relativamente lento
    if (shipSpeed() > orbitCaptureSpeed() * 2.2) return false;

    ship.vx = 0;
    ship.vy = 0;
    ship.x = dock.x + Math.cos(dock.dir) * (ship.r * 0.15);
    ship.y = dock.y + Math.sin(dock.dir) * (ship.r * 0.15);
    // Apuntar inicialmente hacia el área segura
    state.aimAngle = Math.atan2(state.safe.y - ship.y, state.safe.x - ship.x);
    ship.angle = state.aimAngle;
    state.launchFromStation = false;
    state.phase = Phase.DOCKED;
    setThrustEnabled(true);
    els.airWrap.classList.add("hidden");
    els.powerWrap.classList.add("hidden");
    return true;
  }

  function applyAirVent(dir) {
    if (state.phase !== Phase.FLY) return false;
    const ship = state.ship;
    if (!ship || !ship.alive) return false;
    // Solo con la barra llena
    if (state.air < 0.999) return false;

    const speed = shipSpeed();
    const still = speed < state.minDim * 0.003;
    // En movimiento: fuerza normal; quieta: mucho menos impacto
    const brakeScale = still ? 0.25 : 1;
    const push = still ? state.minDim * 0.01 : state.minDim * 0.038;
    const axisEps = state.minDim * 0.001;

    const brakeUp = airBrakeAmount(ship.vy) * brakeScale;
    const brakeSide = airBrakeAmount(ship.vx) * brakeScale;
    let used = false;

    // Aire en la dirección pulsada → empuje contrario / frenado en ese eje
    if (dir === "up") {
      if (ship.vy < -axisEps) {
        ship.vy = Math.min(0, ship.vy + brakeUp);
      } else {
        ship.vy += push;
      }
      used = true;
      spawnVent(ship.x, ship.y, -Math.PI / 2);
    } else if (dir === "down") {
      if (ship.vy > axisEps) {
        ship.vy = Math.max(0, ship.vy - brakeUp);
      } else {
        ship.vy -= push;
      }
      used = true;
      spawnVent(ship.x, ship.y, Math.PI / 2);
    } else if (dir === "left") {
      if (ship.vx < -axisEps) {
        ship.vx = Math.min(0, ship.vx + brakeSide);
      } else {
        ship.vx += push;
      }
      used = true;
      spawnVent(ship.x, ship.y, Math.PI);
    } else if (dir === "right") {
      if (ship.vx > axisEps) {
        ship.vx = Math.max(0, ship.vx - brakeSide);
      } else {
        ship.vx -= push;
      }
      used = true;
      spawnVent(ship.x, ship.y, 0);
    }

    if (!used) return false;

    state.air = 0;
    updateAirBar();
    return true;
  }

  function spawnVent(x, y, angle) {
    state.ventBursts.push({
      x,
      y,
      angle,
      life: 0.35,
      max: 0.35,
    });
    for (let i = 0; i < 6; i++) {
      const a = angle + (Math.random() - 0.5) * 0.55;
      const sp = state.minDim * (0.04 + Math.random() * 0.07);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.25,
        color: "rgba(180, 230, 255, 0.9)",
      });
    }
  }

  function spawnExhaust(x, y, angle, n) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 0.8;
      const sp = state.minDim * (0.05 + Math.random() * 0.15);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.3,
        color: Math.random() > 0.5 ? "rgba(255, 200, 80, 0.9)" : "rgba(120, 200, 255, 0.85)",
      });
    }
  }

  function enterOrbit(host, kind) {
    const ship = state.ship;
    const dx = ship.x - host.x;
    const dy = ship.y - host.y;
    let r = Math.hypot(dx, dy);
    if (kind === "orange") {
      r = Math.max(host.red + ship.r * 0.55, Math.min(r, host.orange - ship.r * 0.15));
    } else {
      const inner = host.orange != null ? host.orange : host.red;
      r = Math.max(inner + ship.r * 0.35, Math.min(r, host.green - ship.r * 0.15));
    }
    ship.orbitHost = { ref: host, kind };
    ship.orbitR = r;
    ship.orbitAngle = Math.atan2(dy, dx);

    // Estrella → órbita visual un poco más rápida; planetas más lentos
    // (la propulsión de la estrella usa magnitud fija aparte)
    let base;
    if (isPlanetHost(host)) {
      base = 0.045;
    } else if (kind === "orange") {
      base = 0.13;
    } else {
      base = 0.16;
    }
    const cross = dx * ship.vy - dy * ship.vx;
    const dir = cross >= 0 ? 1 : -1;
    ship.orbitOmega = dir * base * (state.minDim / Math.max(r, 1)) * 0.35;
    ship.vx = 0;
    ship.vy = 0;
    ship.x = host.x + Math.cos(ship.orbitAngle) * r;
    ship.y = host.y + Math.sin(ship.orbitAngle) * r;
    state.phase = kind === "orange" ? Phase.ORBIT_LOCK : Phase.ORBIT_SLING;
    setThrustEnabled(kind === "green");
  }

  // ——— Update ———
  function update(dt) {
    if (state.phase === Phase.MENU || state.phase === Phase.PAUSE || state.phase === Phase.END) return;

    // Carga de fuerza oscilante
    if (state.phase === Phase.CHARGE) {
      const t = (performance.now() - state.chargeStart) / 1000;
      const cycle = t % 2;
      state.power = cycle <= 1 ? cycle : 2 - cycle;
      els.powerFill.style.width = (state.power * 100).toFixed(1) + "%";
    }

    // Apuntado con flechas en AIM, atracado o mientras carga fuerza
    if (
      state.phase === Phase.AIM ||
      state.phase === Phase.DOCKED ||
      state.phase === Phase.CHARGE
    ) {
      const turn = 2.4 * dt;
      if (state.keys.left) state.aimAngle -= turn;
      if (state.keys.right) state.aimAngle += turn;
      if (state.keys.up) state.aimAngle = -Math.PI / 2;
      if (state.keys.down) state.aimAngle = Math.PI / 2;
      state.ship.angle = state.aimAngle;
    }

    // Planetas orbitando (sentidos opuestos)
    for (const p of getPlanets()) {
      p.angle += p.omega * dt;
      updatePlanetPos(p);
    }

    // Estación: leve balanceo vertical (sin rotar)
    if (state.station) {
      const st = state.station;
      st.angle = 0;
      st.bobPhase = (st.bobPhase || 0) + st.bobSpeed * dt;
      st.x = st.baseX;
      st.y = st.baseY + Math.sin(st.bobPhase) * st.bobAmp;
    }

    // Satélite obstáculo: mismo tipo de balanceo
    if (state.satellite) {
      const sat = state.satellite;
      sat.bobPhase = (sat.bobPhase || 0) + sat.bobSpeed * dt;
      sat.x = sat.baseX;
      sat.y = sat.baseY + Math.sin(sat.bobPhase) * sat.bobAmp;
    }

    // Mantener posiciones de cinturones
    if (state.starBelt) {
      state.starBelt.cx = state.star.x;
      state.starBelt.cy = state.star.y;
      for (const rock of state.starBelt.rocks) {
        rock.rot += rock.spin * dt;
        rock.x = state.starBelt.cx + Math.cos(rock.angle) * rock.r;
        rock.y = state.starBelt.cy + Math.sin(rock.angle) * rock.r;
      }
    }
    if (state.safeBelt) {
      state.safeBelt.cx = state.safe.x;
      state.safeBelt.cy = state.safe.y;
      // Giro lento del cinturón (el hueco también se mueve)
      const beltOmega = state.safeBelt.orbitOmega || 0;
      for (const rock of state.safeBelt.rocks) {
        rock.angle += beltOmega * dt;
        rock.rot += rock.spin * dt;
        rock.x = state.safeBelt.cx + Math.cos(rock.angle) * rock.r;
        rock.y = state.safeBelt.cy + Math.sin(rock.angle) * rock.r;
      }
      if (state.safeBelt.holes) {
        for (const h of state.safeBelt.holes) {
          h.center += beltOmega * dt;
        }
      }
    }

    // Asteroide errante
    const a = state.asteroid;
    a.x -= a.speed * dt;
    if (a.x < -a.r * 3) {
      a.x = state.w + a.r * 3;
    }

    if (state.thrustCooldown > 0) state.thrustCooldown -= dt;
    if (state.ship && state.ship.orbitGrace > 0) state.ship.orbitGrace -= dt;
    if (state.ship && state.ship.beltGrace > 0) state.ship.beltGrace -= dt;
    if (state.ship && state.ship.dockGrace > 0) state.ship.dockGrace -= dt;

    // Recarga de aire (solo fuera de menú/pausa/fin)
    if (state.air < 1) {
      state.air = Math.min(1, state.air + state.airRefillPerSec * dt);
      updateAirBar();
    }

    // Órbitas
    if (state.phase === Phase.ORBIT_LOCK || state.phase === Phase.ORBIT_SLING) {
      const ship = state.ship;
      if (!ship.orbitHost) {
        state.phase = Phase.FLY;
      } else {
        const host = ship.orbitHost.ref;
        ship.orbitAngle += ship.orbitOmega * dt;
        ship.x = host.x + Math.cos(ship.orbitAngle) * ship.orbitR;
        ship.y = host.y + Math.sin(ship.orbitAngle) * ship.orbitR;
        const tx = -Math.sin(ship.orbitAngle) * Math.sign(ship.orbitOmega || 1);
        const ty = Math.cos(ship.orbitAngle) * Math.sign(ship.orbitOmega || 1);
        ship.angle = Math.atan2(ty, tx);
      }
    }

    // Atracado en estación: sigue el tubo y permite apuntar / cargar fuerza
    if (state.phase === Phase.DOCKED || (state.phase === Phase.CHARGE && state.launchFromStation)) {
      const ship = state.ship;
      const dock = getStationDockWorld();
      ship.x = dock.x + Math.cos(dock.dir) * (ship.r * 0.15);
      ship.y = dock.y + Math.sin(dock.dir) * (ship.r * 0.15);
      ship.vx = 0;
      ship.vy = 0;
      if (state.phase === Phase.DOCKED) {
        ship.angle = state.aimAngle;
      }
    }

    // Vuelo libre — la orientación se mantiene (no sigue la velocidad → no curva visual)
    if (state.phase === Phase.FLY) {
      const ship = state.ship;
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      checkCollisions();
    }

    // Partículas
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.ventBursts.length - 1; i >= 0; i--) {
      state.ventBursts[i].life -= dt;
      if (state.ventBursts[i].life <= 0) state.ventBursts.splice(i, 1);
    }
  }

  function checkCollisions() {
    const ship = state.ship;
    if (!ship.alive) return;

    // Fuera de pantalla
    const margin = ship.r * 0.5;
    if (
      ship.x < -margin ||
      ship.x > state.w + margin ||
      ship.y < -margin ||
      ship.y > state.h + margin
    ) {
      endGame(false, "Has caído en las profundidades del espacio estelar.");
      return;
    }

    // Asteroide errante
    if (dist(ship.x, ship.y, state.asteroid.x, state.asteroid.y) < ship.r + state.asteroid.r * 0.72) {
      endGame(false, "La nave colisionó con un asteroide. Nivel terminado.");
      return;
    }

    // Cinturones de asteroides (gracia breve al salir de un planeta → estrella)
    if (hitBelt(state.starBelt, ship) && !(ship.beltGrace > 0)) {
      endGame(false, "La nave se estrelló contra el cinturón de asteroides.");
      return;
    }
    if (hitBelt(state.safeBelt, ship)) {
      endGame(false, "La nave se estrelló contra el cinturón de asteroides.");
      return;
    }

    // Estación espacial
    if (state.station && ship.dockGrace <= 0) {
      if (tryDock()) return;

      const st = state.station;
      const dock = getStationDockWorld();
      const dBody = dist(ship.x, ship.y, st.x, st.y);
      const dDock = dist(ship.x, ship.y, dock.x, dock.y);
      // Choque con el cuerpo (no con el tubo de atracaje)
      if (dBody < st.bodyR + ship.r * 0.85 && dDock > st.dockR * 0.85) {
        endGame(false, "La nave chocó contra la estación espacial.");
        return;
      }
    }

    // Satélite obstáculo (sin atracaje)
    if (state.satellite) {
      const sat = state.satellite;
      if (dist(ship.x, ship.y, sat.x, sat.y) < sat.bodyR + ship.r * 0.85) {
        endGame(false, "La nave colisionó con un satélite.");
        return;
      }
    }

    const speed = shipSpeed();
    const canCapture = ship.orbitGrace <= 0 && speed <= orbitCaptureSpeed();

    // Estrella: roja siempre mata; naranja/verde solo capturan si te detienes ahí
    const ds = dist(ship.x, ship.y, state.star.x, state.star.y);
    if (ds < state.star.red + ship.r * 0.35) {
      endGame(false, "La nave se quemó con el calor de la estrella.");
      return;
    }
    if (canCapture && ds < state.star.orange + ship.r * 0.1) {
      enterOrbit(state.star, "orange");
      return;
    }
    if (canCapture && ds < state.star.green + ship.r * 0.05) {
      enterOrbit(state.star, "green");
      return;
    }

    // Planetas
    for (const p of getPlanets()) {
      const dp = dist(ship.x, ship.y, p.x, p.y);
      if (dp < p.red + ship.r * 0.35) {
        endGame(false, "La nave cayó en el planeta y se destruyó.");
        return;
      }
      if (canCapture && dp < p.green + ship.r * 0.05) {
        enterOrbit(p, "green");
        return;
      }
    }

    // Área segura
    const dSafe = dist(ship.x, ship.y, state.safe.x, state.safe.y);
    if (dSafe < state.safe.r - ship.r * 0.15) {
      if (speed <= safeSpeedLimit()) {
        ship.vx = 0;
        ship.vy = 0;
        endGame(true, "¡Llegaste al área segura y te detuviste a tiempo!");
      }
    }
  }

  function hitBelt(belt, ship) {
    if (!belt) return false;
    for (const rock of belt.rocks) {
      if (dist(ship.x, ship.y, rock.x, rock.y) < ship.r + rock.size * 0.7) {
        return true;
      }
    }
    return false;
  }

  // ——— Draw ———
  function draw() {
    ctx.clearRect(0, 0, state.w, state.h);

    // Fondo
    if (images.fondo && images.fondo.complete) {
      drawCover(images.fondo, 0, 0, state.w, state.h);
    } else {
      ctx.fillStyle = "#050814";
      ctx.fillRect(0, 0, state.w, state.h);
    }

    if (state.phase === Phase.MENU && !state.ship) {
      // Solo fondo en menú inicial
      return;
    }

    if (!state.star) return;

    drawSafeZone();
    drawBelt(state.safeBelt);
    drawStarAuras();
    drawImageCentered(images.estrella, state.star.x, state.star.y, state.star.r * 2.05);
    drawBelt(state.starBelt);

    drawPlanetAuras(state.planet);
    drawImageCentered(images.planeta, state.planet.x, state.planet.y, state.planet.r * 2.1);
    if (state.planet2) {
      drawPlanetAuras(state.planet2);
      drawImageCentered(images.planeta2, state.planet2.x, state.planet2.y, state.planet2.r * 2.1);
    }

    drawStation();

    drawImageCentered(images.asteroide, state.asteroid.x, state.asteroid.y, state.asteroid.r * 2.1);

    // Satélite por encima de planetas/asteroide (los planetas pasan detrás)
    drawSatellite();

    // Partículas detrás de la nave
    drawParticles();

    if (state.ship && (state.ship.alive || state.won)) {
      if (
        state.phase === Phase.AIM ||
        state.phase === Phase.DOCKED ||
        state.phase === Phase.CHARGE
      ) {
        drawAimArrow();
      }
      drawShip();
    }

    updateAndDrawTip();

    drawVentBursts();
  }

  function getCurrentTip() {
    if (state.phase === Phase.ORBIT_LOCK) {
      return {
        key: "orbit_lock",
        text: "Órbita atrapada — sin control. Usa pausa para reiniciar.",
      };
    }
    if (state.phase === Phase.ORBIT_SLING) {
      const host = state.ship && state.ship.orbitHost && state.ship.orbitHost.ref;
      if (isPlanetHost(host)) {
        return {
          key: "orbit_sling_planet",
          text: "Órbita verde (planeta) — Propulsión lanza hacia la estrella",
        };
      }
      return {
        key: "orbit_sling_star",
        text: "Órbita verde — Espacio / Propulsión para salir por el agujero",
      };
    }
    if (state.phase === Phase.DOCKED) {
      return {
        key: "docked_aim",
        text: state.isMobile
          ? "Atracado — apunta y mantén Propulsión para cargar fuerza hacia el área segura"
          : "Atracado — apunta y mantén Espacio para cargar fuerza hacia el área segura",
      };
    }
    if (state.phase === Phase.CHARGE && state.launchFromStation) {
      return {
        key: "docked_charge",
        text: "Suelta en el momento deseado para lanzarte al área segura",
      };
    }
    if (state.phase === Phase.FLY) {
      const s = shipSpeed();
      if (s > 1 && s <= orbitCaptureSpeed() * 1.35) {
        return {
          key: "fly_slow",
          text: "Velocidad baja — puedes asentarte en un aura, tubo o área segura",
        };
      }
      return null;
    }
    if (state.phase === Phase.AIM) {
      return {
        key: "aim",
        text: state.isMobile
          ? "Apunta y mantén Propulsión para cargar fuerza"
          : "Apunta con el mouse o ← → · Mantén Espacio para cargar",
      };
    }
    return null;
  }

  function updateAndDrawTip() {
    const tip = getCurrentTip();
    const now = performance.now();

    if (!tip) {
      // Sin tip actual: al expirar, limpiar clave para poder mostrarlo de nuevo después
      if (now >= state.tip.until) {
        state.tip.key = "";
        state.tip.text = "";
      }
      return;
    }

    // Nueva situación de juego → mostrar el tip durante 3 segundos
    if (tip.key !== state.tip.key) {
      state.tip.key = tip.key;
      state.tip.text = tip.text;
      state.tip.until = now + 3000;
    }

    if (now < state.tip.until) {
      drawBanner(state.tip.text);
    }
  }

  function drawBelt(belt) {
    if (!belt || !images.asteroide) return;
    for (const rock of belt.rocks) {
      ctx.save();
      ctx.translate(rock.x, rock.y);
      ctx.rotate(rock.rot);
      const size = rock.size * 2.1;
      if (images.asteroide.complete) {
        ctx.drawImage(images.asteroide, -size / 2, -size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, rock.size, 0, Math.PI * 2);
        ctx.fillStyle = "#6a5a4a";
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStation() {
    const st = state.station;
    if (!st) return;
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.rotate(st.angle);
    if (images.estacion && images.estacion.complete && images.estacion.naturalWidth) {
      ctx.drawImage(images.estacion, -st.w / 2, -st.h / 2, st.w, st.h);
    } else {
      ctx.fillStyle = "#c8d0dc";
      ctx.fillRect(-st.w / 2, -st.h / 2, st.w, st.h);
    }
    ctx.restore();

    // Indicador del tubo de conexión
    const dock = getStationDockWorld();
    ctx.save();
    ctx.strokeStyle = "rgba(255, 210, 70, 0.85)";
    ctx.fillStyle = "rgba(255, 200, 60, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(dock.x, dock.y, st.dockR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSatellite() {
    const sat = state.satellite;
    if (!sat) return;
    ctx.save();
    ctx.translate(sat.x, sat.y);
    if (images.satelite && images.satelite.complete && images.satelite.naturalWidth) {
      ctx.drawImage(images.satelite, -sat.w / 2, -sat.h / 2, sat.w, sat.h);
    } else {
      ctx.fillStyle = "#9aa3b2";
      ctx.beginPath();
      ctx.arc(0, 0, sat.bodyR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBanner(text) {
    const mobile = state.isMobile;
    const maxTextW = mobile
      ? Math.min(state.w * 0.7, 240)
      : Math.min(state.w * 0.72, 420);
    const fontSize = mobile
      ? Math.max(10, Math.min(12, state.minDim * 0.02))
      : Math.max(12, state.minDim * 0.028);
    const padX = mobile ? 10 : 16;
    const padY = mobile ? 7 : 10;
    const lineGap = fontSize * 1.2;
    const yBase = mobile
      ? Math.max(52, (state.playH || state.h) * 0.11)
      : state.h * 0.16;

    ctx.save();
    ctx.font = `600 ${fontSize}px Avenir Next, Segoe UI, sans-serif`;

    // Partir en líneas cortas para un cuadro compacto
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxTextW && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    let contentW = 0;
    for (const line of lines) {
      contentW = Math.max(contentW, ctx.measureText(line).width);
    }
    const bw = contentW + padX * 2;
    const bh = lines.length * lineGap + padY * 2;
    const bx = (state.w - bw) / 2;
    const by = yBase - bh / 2;

    ctx.fillStyle = "rgba(6, 12, 28, 0.78)";
    ctx.strokeStyle = "rgba(94, 200, 255, 0.35)";
    ctx.lineWidth = 1;
    roundRect(bx, by, bw, bh, mobile ? 8 : 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const startY = yBase - ((lines.length - 1) * lineGap) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, state.w / 2, startY + i * lineGap);
    });
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCover(img, x, y, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let dw, dh, dx, dy;
    if (ir > cr) {
      dh = h;
      dw = h * ir;
      dx = x - (dw - w) / 2;
      dy = y;
    } else {
      dw = w;
      dh = w / ir;
      dx = x;
      dy = y - (dh - h) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawImageCentered(img, x, y, size) {
    if (!img || !img.complete || !img.naturalWidth) return;
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }

  function drawAuraRing(x, y, innerR, outerR, color, alpha) {
    const grad = ctx.createRadialGradient(x, y, Math.max(0, innerR), x, y, outerR);
    grad.addColorStop(0, color.replace("ALPHA", "0"));
    grad.addColorStop(0.55, color.replace("ALPHA", String(alpha * 0.35)));
    grad.addColorStop(0.85, color.replace("ALPHA", String(alpha * 0.55)));
    grad.addColorStop(1, color.replace("ALPHA", String(alpha * 0.15)));
    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.arc(x, y, innerR, 0, Math.PI * 2, true);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = color.replace("ALPHA", String(alpha * 0.7));
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawStarAuras() {
    const s = state.star;
    // Verde (exterior)
    drawAuraRing(s.x, s.y, s.orange, s.green, "rgba(70, 220, 120, ALPHA)", 0.55);
    // Naranja
    drawAuraRing(s.x, s.y, s.red, s.orange, "rgba(255, 140, 40, ALPHA)", 0.6);
    // Roja (pegada)
    drawAuraRing(s.x, s.y, s.r * 0.92, s.red, "rgba(255, 50, 50, ALPHA)", 0.7);
  }

  function drawPlanetAuras(p) {
    if (!p) return;
    drawAuraRing(p.x, p.y, p.red, p.green, "rgba(70, 220, 120, ALPHA)", 0.5);
    drawAuraRing(p.x, p.y, p.r * 0.9, p.red, "rgba(255, 50, 50, ALPHA)", 0.65);
  }

  function drawSafeZone() {
    const s = state.safe;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, "rgba(200, 140, 255, 0.55)");
    g.addColorStop(0.55, "rgba(140, 70, 255, 0.28)");
    g.addColorStop(1, "rgba(90, 30, 180, 0.08)");
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(190, 130, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brillo tipo llama de vela
    ctx.save();
    ctx.shadowColor = "rgba(180, 120, 255, 0.8)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(220, 180, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Texto en dos líneas, escalado para caber completo dentro del círculo
    const line1 = "área";
    const line2 = "segura";
    const maxW = s.r * 1.35;
    const maxH = s.r * 1.15;
    let fontSize = Math.max(8, s.r * 0.42);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245, 230, 255, 0.95)";

    for (let i = 0; i < 12; i++) {
      ctx.font = `600 ${fontSize}px Avenir Next, Segoe UI, sans-serif`;
      const w1 = ctx.measureText(line1).width;
      const w2 = ctx.measureText(line2).width;
      const lineH = fontSize * 1.15;
      const totalH = lineH * 2;
      if (Math.max(w1, w2) <= maxW && totalH <= maxH) break;
      fontSize *= 0.9;
      if (fontSize < 7) break;
    }

    const lineH = fontSize * 1.15;
    ctx.font = `600 ${fontSize}px Avenir Next, Segoe UI, sans-serif`;
    ctx.fillText(line1, s.x, s.y - lineH * 0.5);
    ctx.fillText(line2, s.x, s.y + lineH * 0.5);
  }

  function drawAimArrow() {
    const ship = state.ship;
    const len = state.minDim * 0.12;
    const tipX = ship.x + Math.cos(state.aimAngle) * len;
    const tipY = ship.y + Math.sin(state.aimAngle) * len;
    ctx.save();
    ctx.strokeStyle = "rgba(160, 230, 255, 0.95)";
    ctx.fillStyle = "rgba(160, 230, 255, 0.95)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const ah = 10;
    const left = state.aimAngle + Math.PI * 0.82;
    const right = state.aimAngle - Math.PI * 0.82;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + Math.cos(left) * ah, tipY + Math.sin(left) * ah);
    ctx.lineTo(tipX + Math.cos(right) * ah, tipY + Math.sin(right) * ah);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawShip() {
    const ship = state.ship;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle + Math.PI / 2);
    const size = ship.r * 2.35;
    if (images.nave && images.nave.complete) {
      ctx.drawImage(images.nave, -size / 2, -size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, ship.r, 0, Math.PI * 2);
      ctx.fillStyle = "#8fd7ff";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const a = Math.max(0, Math.min(1, p.life * 2));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawVentBursts() {
    for (const v of state.ventBursts) {
      const t = v.life / v.max;
      const len = state.minDim * 0.04 * (1.2 - t);
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.strokeStyle = "#b8ecff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.lineTo(v.x + Math.cos(v.angle) * len, v.y + Math.sin(v.angle) * len);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ——— Loop ———
  function loop(now) {
    const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0.016);
    state.lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ——— Eventos ———
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));

  window.addEventListener("keydown", (e) => {
    const code = e.code;
    const isArrow =
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight";
    const isSpace = code === "Space" || e.key === " " || e.key === "Spacebar";

    if (isArrow || isSpace) e.preventDefault();

    let dir = null;
    if (code === "ArrowUp" || e.key === "ArrowUp") dir = "up";
    else if (code === "ArrowDown" || e.key === "ArrowDown") dir = "down";
    else if (code === "ArrowLeft" || e.key === "ArrowLeft") dir = "left";
    else if (code === "ArrowRight" || e.key === "ArrowRight") dir = "right";

    if (dir) {
      state.keys[dir] = true;
      // Disparo inmediato al pulsar (además del mantenimiento en update)
      if (state.phase === Phase.FLY && !e.repeat) {
        applyAirVent(dir);
      }
    }

    if (isSpace) {
      if (!state.spaceWasDown) {
        state.spaceWasDown = true;
        state.keys.space = true;
        if (state.phase === Phase.AIM || state.phase === Phase.DOCKED) beginCharge();
        else if (state.phase === Phase.ORBIT_SLING) trySlingshot();
      }
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (state.phase === Phase.PAUSE) resumeGame();
      else pauseGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    const code = e.code;
    if (code === "ArrowUp" || e.key === "ArrowUp") state.keys.up = false;
    if (code === "ArrowDown" || e.key === "ArrowDown") state.keys.down = false;
    if (code === "ArrowLeft" || e.key === "ArrowLeft") state.keys.left = false;
    if (code === "ArrowRight" || e.key === "ArrowRight") state.keys.right = false;
    if (code === "Space" || e.key === " " || e.key === "Spacebar") {
      state.spaceWasDown = false;
      state.keys.space = false;
      if (state.phase === Phase.CHARGE) releaseCharge();
    }
  });

  // Si la ventana pierde el foco, soltar teclas para no quedar “pegadas”
  window.addEventListener("blur", () => {
    state.keys.up = false;
    state.keys.down = false;
    state.keys.left = false;
    state.keys.right = false;
    state.keys.space = false;
    state.spaceWasDown = false;
  });

  // Apuntar con mouse / touch en canvas
  function aimFromPointer(clientX, clientY) {
    if (
      state.phase !== Phase.AIM &&
      state.phase !== Phase.CHARGE &&
      state.phase !== Phase.DOCKED
    ) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    state.aimAngle = Math.atan2(y - state.ship.y, x - state.ship.x);
    state.ship.angle = state.aimAngle;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase === Phase.AIM || state.phase === Phase.DOCKED) {
      state.touchAiming = true;
      aimFromPointer(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (state.touchAiming || e.buttons === 1) {
      aimFromPointer(e.clientX, e.clientY);
    } else if ((state.phase === Phase.AIM || state.phase === Phase.DOCKED) && !state.isMobile) {
      aimFromPointer(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener("pointerup", () => {
    state.touchAiming = false;
  });

  // Cruceta móvil
  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    const dir = btn.dataset.dir;
    const press = (e) => {
      e.preventDefault();
      btn.classList.add("active");
      state.keys[dir] = true;
      if (state.phase === Phase.FLY) applyAirVent(dir);
    };
    const release = (e) => {
      e.preventDefault();
      btn.classList.remove("active");
      state.keys[dir] = false;
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("pointercancel", release);
  });

  // Botón propulsión
  const thrustDown = (e) => {
    e.preventDefault();
    els.btnThrust.classList.add("active");
    if (state.phase === Phase.AIM || state.phase === Phase.DOCKED) beginCharge();
    else if (state.phase === Phase.ORBIT_SLING) trySlingshot();
  };
  const thrustUp = (e) => {
    e.preventDefault();
    els.btnThrust.classList.remove("active");
    if (state.phase === Phase.CHARGE) releaseCharge();
  };
  els.btnThrust.addEventListener("pointerdown", thrustDown);
  els.btnThrust.addEventListener("pointerup", thrustUp);
  els.btnThrust.addEventListener("pointerleave", thrustUp);
  els.btnThrust.addEventListener("pointercancel", thrustUp);
  els.btnThrust.addEventListener("contextmenu", (e) => e.preventDefault());
  els.btnThrust.addEventListener("selectstart", (e) => e.preventDefault());

  els.btnStart.addEventListener("click", startGame);
  els.btnPause.addEventListener("click", pauseGame);
  els.btnRestart.addEventListener("click", () => {
    if (state.phase === Phase.MENU || state.phase === Phase.END) return;
    els.overlayPause.classList.add("hidden");
    resetLevel();
  });
  els.btnResume.addEventListener("click", resumeGame);
  els.btnRestartPause.addEventListener("click", () => {
    els.overlayPause.classList.add("hidden");
    resetLevel();
  });
  els.btnRetry.addEventListener("click", resetLevel);

  // Evitar selección de texto en toda la app (móvil)
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  // Evitar scroll / gestos en el canvas durante el juego,
  // pero permitir desplazamiento en overlays (instrucciones, pausa, fin)
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.target.closest(".overlay, .instructions-scroll, .panel")) return;
      if (e.target.closest("#game-root")) e.preventDefault();
    },
    { passive: false }
  );

  // Init
  resize();
  loadImages().then(() => {
    layoutWorld(true);
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
  });
})();
