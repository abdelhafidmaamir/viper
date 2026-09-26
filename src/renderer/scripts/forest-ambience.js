// Ambiance Foret sous la pluie (v3) : figuratif hors grille, surface douce dedans, pluie lente en deux plans
(function () {
  'use strict';
  // Le cadre de la surface suit exactement l'anneau du plateau (jauge), sinon la surface claire
  // et son filet decalent par rapport a la jauge. Anneau : X0-14 a X0+COLS*CELL+14 = 150 a 930,
  // Y0-14 a Y0+ROWS*CELL+14 = 264 a 1232. Ces valeurs sont figees car l'ambiance ignore la geometrie
  // de base ; les mettre a jour ici si le plateau change d'echelle.
  let W = 1080,
    H = 1920,
    GX0 = 150,
    GX1 = 930,
    GY0 = 264,
    GY1 = 1232;
  // Le cadre suit le format du jeu (vertical 9:16 ou horizontal 16:9) : relu a chaque image ; s'il change,
  // tous les pre-rendus dependants de la taille sont jetes et refaits.
  function cadre(e) {
    if (!e || !e.W || (e.W === W && e.H === H && e.x0 - 14 === GX0)) return;
    W = e.W;
    H = e.H;
    GX0 = e.x0 - 14;
    GX1 = e.x0 + e.cols * e.cell + 14;
    GY0 = e.y0 - 14;
    GY1 = e.y0 + e.rows * e.cell + 14;
    decor = null;
    congereImg = null;
    for (const k in solsImg) delete solsImg[k];
    raiBlanc = null;
    raiTeint = null;
    raiCle = '';
    canopee = null;
    halo = null;
    gouttePre = null;
    for (const k in teints) delete teints[k];
    ciel = null;
    cielCle = -1;
    vign = null;
    vignCle = -1;
    motifGrain = null;
  }

  function bruitRose(ac, dur) {
    const sr = ac.sampleRate,
      n = Math.ceil(sr * dur),
      buf = ac.createBuffer(1, n, sr),
      d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    return buf;
  }

  // Feuillages et grain pre-rendus une fois
  let decor = null;
  function fronde(g, x, y, ang, long, coul) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.strokeStyle = coul;
    g.fillStyle = coul;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(long * 0.5, -long * 0.12, long, 0);
    g.stroke();
    for (let i = 1; i < 12; i++) {
      const u = i / 12,
        px = long * u,
        py = -long * 0.12 * 4 * u * (1 - u) * 0.5,
        l = long * 0.22 * (1 - u * 0.7);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(px + l * 0.35, py + s * l * 0.45, l * 0.55, l * 0.16, s * 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }
  function construireDecor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, '#17221a');
    lg.addColorStop(1, '#141e17');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    // mousse douce sous la grille, tres basse opacite
    g.fillStyle = 'rgba(34,51,38,0.35)';
    g.fillRect(GX0, GY0, GX1 - GX0, GY1 - GY0);
    // grain fin dans la grille, sans forme
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(180,212,222,0.022)' : 'rgba(8,12,9,0.05)';
      g.fillRect(GX0 + Math.random() * (GX1 - GX0), GY0 + Math.random() * (GY1 - GY0), 2, 2);
    }
    // feuillages flous hors grille : bande basse, bande haute, marges
    g.save();
    try {
      g.filter = 'blur(7px)';
    } catch (e) {}
    const coul = ['#0f1812', '#131e16', '#1a281e'];
    for (let i = 0; i < 16; i++)
      fronde(
        g,
        -40 + i * 75 + Math.random() * 30,
        1400 + Math.random() * 480,
        -Math.PI / 2 + (Math.random() - 0.5) * 1.4,
        180 + Math.random() * 160,
        coul[i % 3],
      );
    for (let i = 0; i < 8; i++)
      fronde(
        g,
        Math.random() * W,
        -20 + Math.random() * 60,
        Math.PI / 2 + (Math.random() - 0.5) * 1.2,
        110 + Math.random() * 60,
        coul[i % 3],
      );
    for (let i = 0; i < 6; i++) {
      fronde(
        g,
        -30,
        200 + i * 200 + Math.random() * 80,
        (Math.random() - 0.5) * 0.8,
        80,
        coul[i % 3],
      );
      fronde(
        g,
        W + 30,
        260 + i * 190 + Math.random() * 80,
        Math.PI + (Math.random() - 0.5) * 0.8,
        80,
        coul[(i + 1) % 3],
      );
    }
    g.restore();
    // bordure de grille a peine visible
    g.strokeStyle = 'rgba(180,212,222,0.06)';
    g.lineWidth = 2;
    g.strokeRect(GX0, GY0, GX1 - GX0, GY1 - GY0);
    return c;
  }

  // ---- Le cycle du jour : quatre ambiances distinctes dans la meme foret ----------------------
  // Meme vert, quatre lumieres. Chaque cle porte son ciel, sa source de lumiere et ses points.
  function mel(a, c, k) {
    return [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];
  }
  function rgb(c) {
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }
  function rgba(c, a) {
    return (
      'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'
    );
  }
  function alea(i, d) {
    const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  const CLES = [
    {
      t: 0.0,
      nom: 'nuit',
      haut: [14, 26, 23],
      mil: [10, 17, 15],
      bas: [6, 10, 9],
      lueur: [64, 104, 96],
      lueurA: 0.12,
      lueurX: 0.5,
      lueurY: 0.4,
      lueurR: 0.64,
      rai: [150, 186, 196],
      raiA: 0.03,
      raiX: 0.52,
      pt: [214, 232, 176],
      ptA: 0.7,
      ptR: 1.0,
      ptHalo: 1.0,
      voile: [30, 52, 64],
      voileA: 0.1,
      vign: 0.6,
    },
    {
      t: 0.22,
      nom: 'lever',
      haut: [56, 54, 52],
      mil: [32, 46, 38],
      bas: [13, 23, 18],
      lueur: [226, 150, 104],
      lueurA: 0.2,
      lueurX: 0.16,
      lueurY: 0.52,
      lueurR: 0.74,
      rai: [248, 196, 142],
      raiA: 0.075,
      raiX: 0.18,
      pt: [248, 224, 182],
      ptA: 0.34,
      ptR: 0.8,
      ptHalo: 0.55,
      voile: [178, 138, 110],
      voileA: 0.055,
      vign: 0.54,
    },
    {
      t: 0.5,
      nom: 'jour',
      haut: [58, 86, 64],
      mil: [36, 58, 42],
      bas: [17, 30, 22],
      lueur: [186, 214, 150],
      lueurA: 0.17,
      lueurX: 0.5,
      lueurY: 0.14,
      lueurR: 0.82,
      rai: [226, 240, 198],
      raiA: 0.05,
      raiX: 0.5,
      pt: [240, 246, 214],
      ptA: 0.2,
      ptR: 0.62,
      ptHalo: 0.3,
      voile: [130, 164, 124],
      voileA: 0.05,
      vign: 0.46,
    },
    {
      t: 0.78,
      nom: 'coucher',
      haut: [70, 50, 40],
      mil: [40, 44, 33],
      bas: [14, 22, 17],
      lueur: [238, 132, 74],
      lueurA: 0.2,
      lueurX: 0.86,
      lueurY: 0.56,
      lueurR: 0.72,
      rai: [250, 176, 110],
      raiA: 0.085,
      raiX: 0.84,
      pt: [250, 206, 150],
      ptA: 0.4,
      ptR: 0.86,
      ptHalo: 0.7,
      voile: [186, 112, 76],
      voileA: 0.065,
      vign: 0.54,
    },
  ];
  const COULEURS = ['haut', 'mil', 'bas', 'lueur', 'rai', 'pt', 'voile'];
  const NOMBRES = [
    'lueurA',
    'lueurX',
    'lueurY',
    'lueurR',
    'raiA',
    'raiX',
    'ptA',
    'ptR',
    'ptHalo',
    'voileA',
    'vign',
  ];

  // Meteos de la foret (prototype, Abdel 2026-09-21 : « weather or seasons, snow, autumn, summer, thunderstorm,
  // etoile filante »). Meme foret, memes serpents, meme UI : seuls la teinte du fond et ce qui tombe changent.
  let meteo = 'pluie',
    meteoPrec = 'pluie',
    meteoT = -99,
    mixM = 1;
  const METEOS = {
    pluie: null,
    neige: { teinte: [132, 160, 190], k: 0.34 },
    automne: { teinte: [104, 60, 30], k: 0.27 },
    ete: { teinte: [112, 128, 44], k: 0.22, pt: 2.2, lueur: 1.6 },
    printemps: { teinte: [132, 150, 120], k: 0.2, lueur: 1.3 },
    orage: { teinte: [16, 20, 38], k: 0.5 },
    etoiles: { teinte: [8, 14, 44], k: 0.42 },
    aurore: { teinte: [6, 20, 40], k: 0.46 },
    lucioles: { teinte: [10, 30, 22], k: 0.4, pt: 1.4 },
    braises: { teinte: [70, 22, 14], k: 0.42 },
    brume: { teinte: [120, 132, 130], k: 0.3 },
  };
  // Le poids d'une meteo a l'image : 1 quand elle est installee, entre 0 et 1 pendant le fondu de 3,5 s qui
  // fait tourner la saison. Tout ce qui se peint se multiplie par ce poids : rien n'apparait d'un coup.
  function poids(m) {
    return (m === meteo ? mixM : 0) + (m === meteoPrec && meteoPrec !== meteo ? 1 - mixM : 0);
  }
  const pluieF = () => poids('pluie') + 1.7 * poids('orage');
  // La congere de l'hiver, peinte UNE fois : trois plans de neige, chacun avec son degrade, son ombre portee
  // sur le plan de derriere, son lisere de lumiere sur la crete et un grain fin. A l'image, un seul drawImage.
  const CGH = 340;
  const CRETES = [
    (x) => 214 + 34 * Math.sin(x * 0.0041 + 0.6) + 14 * Math.sin(x * 0.013 + 2.0),
    (x) => 162 + 30 * Math.sin(x * 0.0052 + 2.4) + 12 * Math.sin(x * 0.017),
    (x) => 112 + 28 * Math.sin(x * 0.0046 + 4.1) + 10 * Math.sin(x * 0.02 + 1.0),
  ];
  let congereImg = null;
  function congere() {
    if (congereImg) return congereImg;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = CGH;
    const g = c.getContext('2d');
    const TONS = [
      ['#8fa3bd', '#5f7593'],
      ['#c2d2e6', '#8197b5'],
      ['#f6faff', '#aec2dc'],
    ];
    CRETES.forEach((cr, k) => {
      const trace = (dy) => {
        g.beginPath();
        g.moveTo(-20, CGH + 20);
        for (let x = -20; x <= W + 20; x += 8) g.lineTo(x, CGH - cr(x) + dy);
        g.lineTo(W + 20, CGH + 20);
        g.closePath();
      };
      // l'ombre que ce plan jette sur celui de derriere
      g.save();
      g.shadowColor = 'rgba(14,30,58,0.55)';
      g.shadowBlur = 30;
      g.shadowOffsetY = -8;
      g.fillStyle = 'rgba(14,30,58,0.35)';
      trace(6);
      g.fill();
      g.restore();
      const lg = g.createLinearGradient(0, CGH - 250, 0, CGH);
      lg.addColorStop(0, TONS[k][0]);
      lg.addColorStop(1, TONS[k][1]);
      g.fillStyle = lg;
      trace(0);
      g.fill();
      // le lisere de lumiere froide sur la crete
      g.save();
      g.shadowColor = 'rgba(255,255,255,0.9)';
      g.shadowBlur = 10;
      g.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.25 * k) + ')';
      g.lineWidth = 2.5;
      g.beginPath();
      for (let x = -20; x <= W + 20; x += 8) {
        const y = CGH - cr(x) + 1.5;
        if (x === -20) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
      // le grain de la neige : des paillettes claires et des creux bleutes, sous la crete seulement
      for (let i = 0; i < 260; i++) {
        const x = alea(i, 601 + k) * W,
          top = CGH - cr(x),
          y = top + 6 + alea(i, 611 + k) * (CGH - top - 6);
        g.fillStyle = i % 3 ? 'rgba(255,255,255,0.22)' : 'rgba(70,100,150,0.14)';
        g.beginPath();
        g.arc(x, y, 0.8 + alea(i, 621 + k) * 1.6, 0, Math.PI * 2);
        g.fill();
      }
    });
    congereImg = c;
    return c;
  }

  // Les sols des saisons, meme recette que la congere : trois plans, chacun peint UNE fois en deux images, ce qui
  // depasse de la crete (herbes, fougeres, sapins, roseaux : « avant ») et le corps de la colline (ombre portee,
  // degrade, lisere, decor pose). A l'image, « avant » est redessine par tranches inclinees : le vent y passe.
  // Abdel, 2026-09-21 : « i want the bottom element to be animated ».
  function feuille(g, T, ton) {
    g.fillStyle = ton;
    g.beginPath();
    g.moveTo(-T, 0);
    g.quadraticCurveTo(-T * 0.1, -T * 0.72, T, 0);
    g.quadraticCurveTo(-T * 0.1, T * 0.72, -T, 0);
    g.fill();
    g.strokeStyle = 'rgba(40,20,8,0.38)';
    g.lineWidth = Math.max(0.8, T * 0.08);
    g.beginPath();
    g.moveTo(-T * 0.85, 0);
    g.lineTo(T * 0.9, 0);
    g.stroke();
  }
  function brins(g, cr, k, pied, pointe, hmax, pas, graine) {
    let i = 0;
    for (let x = -10; x < W + 10; x += pas * (0.5 + alea(i, graine)), i++) {
      const top = CGH - cr(x),
        h = hmax * (0.3 + 0.7 * alea(i, graine + 1)) * (0.6 + 0.2 * k),
        lean = (alea(i, graine + 2) - 0.5) * h * 0.7,
        w = 1.6 + 1.6 * alea(i, graine + 3);
      const lg = g.createLinearGradient(0, top + 6, 0, top - h);
      lg.addColorStop(0, pied);
      lg.addColorStop(1, pointe);
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x - w, top + 8);
      g.quadraticCurveTo(x + lean * 0.25, top - h * 0.6, x + lean, top - h);
      g.quadraticCurveTo(x + lean * 0.45 + w, top - h * 0.5, x + w, top + 8);
      g.closePath();
      g.fill();
    }
  }
  function sapins(g, cr, k, coul) {
    if (k > 1) return;
    let i = 0;
    for (let x = 20; x < W; x += 60 + 90 * alea(i, 701 + k), i++) {
      const hT = (70 + 90 * alea(i, 703 + k)) * (0.6 + 0.3 * k),
        base = CGH - cr(x) + 10;
      g.fillStyle = coul;
      for (let j = 0; j < 3; j++) {
        const y1 = base - hT * j * 0.27,
          l = hT * 0.3 * (1 - j * 0.24),
          y0 = y1 - hT * 0.48;
        g.beginPath();
        g.moveTo(x - l, y1);
        g.lineTo(x, y0);
        g.lineTo(x + l, y1);
        g.closePath();
        g.fill();
      }
    }
  }
  function fleur(g, x, y, rr, ton) {
    g.fillStyle = ton;
    for (let q = 0; q < 5; q++) {
      g.beginPath();
      g.arc(x + Math.cos(q * 1.2566) * rr, y + Math.sin(q * 1.2566) * rr, rr * 0.78, 0, 6.2832);
      g.fill();
    }
    g.fillStyle = '#f2b530';
    g.beginPath();
    g.arc(x, y, rr * 0.6, 0, 6.2832);
    g.fill();
  }
  const TONS_FLEUR = ['#ffffff', '#f7b6c8', '#ffe27a', '#d2c2ff'];
  // Le reseau de craquelures des braises : des veines qui serpentent et se ramifient, en s'affinant. Peint deux fois
  // avec les memes tirages : le sillon sombre dans le corps, la lave vive dans l'image de lueur qui pulse.
  function fissures(g, cr, k, vif) {
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (vif) {
      g.shadowColor = '#ff5a10';
      g.shadowBlur = 16;
    }
    for (let i = 0; i < 7 + 3 * k; i++) {
      let x = alea(i, 761 + k) * W,
        top = CGH - cr(x),
        y = top + 22 + alea(i, 763 + k) * Math.max(10, CGH - top - 40),
        a = (alea(i, 765 + k) - 0.5) * 0.8;
      const n = 6 + Math.floor(alea(i, 767 + k) * 5);
      for (let q = 0; q < n; q++) {
        const l = 14 + 20 * alea(i * 17 + q, 769 + k);
        a += (alea(i * 17 + q, 771 + k) - 0.5) * 1.1;
        a = Math.max(-0.9, Math.min(0.9, a));
        const x1 = x + Math.cos(a) * l,
          y1 = Math.max(CGH - cr(x1) + 10, y + Math.sin(a) * l),
          w = 2.6 - (1.6 * q) / n;
        g.strokeStyle = vif
          ? 'rgba(255,' + Math.round(150 + 60 * alea(q + i, 773)) + ',70,0.95)'
          : '#4a1608';
        g.lineWidth = vif ? w : w + 2.4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x1, y1);
        g.stroke();
        if (alea(i * 17 + q, 775 + k) < 0.4) {
          let bx = x1,
            by = y1,
            ba = a + (alea(i * 17 + q, 777 + k) < 0.5 ? -1 : 1) * (0.7 + 0.5 * alea(q, 779));
          for (let b = 0; b < 2 + Math.floor(alea(q + i, 781) * 2); b++) {
            const bl = 9 + 12 * alea(i * 17 + q * 3 + b, 783 + k),
              nx = bx + Math.cos(ba) * bl,
              ny = Math.max(CGH - cr(nx) + 10, by + Math.sin(ba) * bl);
            g.lineWidth = vif ? 1.1 : 2.6;
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(nx, ny);
            g.stroke();
            bx = nx;
            by = ny;
            ba += (alea(b + q, 785) - 0.5) * 0.9;
          }
        }
        x = x1;
        y = y1;
      }
    }
    if (vif) {
      g.fillStyle = '#ffc070';
      for (let i = 0; i < 40; i++) {
        const x = alea(i, 771 + k) * W,
          top = CGH - cr(x);
        g.beginPath();
        g.arc(
          x,
          top + 8 + alea(i, 773 + k) * (CGH - top - 8),
          0.8 + 1.8 * alea(i, 775 + k),
          0,
          6.2832,
        );
        g.fill();
      }
    }
    g.restore();
  }
  const SOLS = {
    pluie: {
      tons: [
        ['#1c3026', '#0e1a14'],
        ['#264234', '#12221a'],
        ['#34583f', '#182c20'],
      ],
      lisere: '190,230,200',
      lisereA: 0.7,
      vent: 0.07,
      avant(g, cr, k) {
        brins(
          g,
          cr,
          k,
          ['#12221a', '#182c20', '#20382a'][k],
          ['#264234', '#34583f', '#4a7a56'][k],
          20,
          7,
          801 + k * 5,
        );
        if (k === 0) return;
        let i = 0;
        for (let x = 40; x < W; x += 90 + 120 * alea(i, 811 + k), i++) {
          const top = CGH - cr(x),
            coul = ['', '#1e3a2a', '#2c5238'][k],
            ech = 0.42 + 0.14 * k;
          for (let q = 0; q < 4; q++) {
            const cote = q % 2 ? 1 : -1,
              ang = -Math.PI / 2 + cote * (0.35 + 0.55 * alea(i * 4 + q, 813 + k));
            g.save();
            g.translate(x, top + 8);
            g.scale(ech, ech);
            fronde(g, 0, 0, ang, 150 + 110 * alea(i * 4 + q, 815 + k), coul);
            g.restore();
          }
        }
      },
    },
    automne: {
      tons: [
        ['#5a3420', '#2e1a10'],
        ['#8a4a22', '#4a2814'],
        ['#b8702c', '#6a3a18'],
      ],
      lisere: '255,206,130',
      apres(g, cr, k) {
        const PAL = [
          ['#6a3c20', '#4e2a16', '#7a4a24'],
          ['#9a5426', '#7c3e1c', '#b07030'],
          ['#c8822e', '#a04e22', '#d8a446', '#8a3a1c'],
        ][k];
        for (let i = 0; i < 260; i++) {
          const x = alea(i, 711 + k) * W,
            top = CGH - cr(x),
            y = top - 6 + Math.pow(alea(i, 713 + k), 1.6) * (CGH - top);
          g.save();
          g.translate(x, y);
          g.rotate(alea(i, 715 + k) * 6.28);
          g.scale(1, 0.55 + 0.45 * alea(i, 717 + k));
          feuille(g, (7 + 9 * alea(i, 719 + k)) * (0.7 + 0.25 * k), PAL[i % PAL.length]);
          g.restore();
        }
      },
    },
    printemps: {
      tons: [
        ['#3f6a48', '#25432f'],
        ['#5c8f55', '#35603c'],
        ['#86b868', '#4d7c46'],
      ],
      lisere: '235,255,200',
      vent: 0.1,
      avant(g, cr, k) {
        brins(
          g,
          cr,
          k,
          ['#35603c', '#4d7c46', '#6a9c56'][k],
          ['#5c8f55', '#86b868', '#b4dc88'][k],
          34,
          7,
          721 + k * 5,
        );
        for (let i = 0; i < 18 * k; i++) {
          const x = alea(i, 731 + k) * W,
            top = CGH - cr(x),
            y = top - 8 - alea(i, 733 + k) * 24;
          g.strokeStyle = '#4d7c46';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x, top + 6);
          g.lineTo(x, y);
          g.stroke();
          fleur(g, x, y, (2.6 + 1.8 * alea(i, 737 + k)) * (0.8 + 0.2 * k), TONS_FLEUR[i % 4]);
        }
      },
      apres(g, cr, k) {
        for (let i = 0; i < 18 * k; i++) {
          const x = alea(i, 739 + k) * W,
            top = CGH - cr(x);
          fleur(
            g,
            x,
            top + 14 + alea(i, 735 + k) * 110,
            (2.4 + 1.8 * alea(i, 741 + k)) * (0.8 + 0.2 * k),
            TONS_FLEUR[(i + 1) % 4],
          );
        }
      },
    },
    ete: {
      tons: [
        ['#3c5a2a', '#22381a'],
        ['#587a30', '#324a1c'],
        ['#7e9c3a', '#465e22'],
      ],
      lisere: '255,236,150',
      vent: 0.14,
      avant(g, cr, k) {
        brins(
          g,
          cr,
          k,
          ['#324a1c', '#465e22', '#5e7a2a'][k],
          ['#a89a44', '#d2bc58', '#f0dc7a'][k],
          70,
          6,
          741 + k * 5,
        );
      },
    },
    orage: {
      tons: [
        ['#1a2234', '#0e1420'],
        ['#222c42', '#121a2a'],
        ['#2c3852', '#161e30'],
      ],
      lisere: '170,190,255',
      lisereA: 0.6,
      vent: 0.03,
      flaques: [],
      avant(g, cr, k) {
        sapins(g, cr, k, ['#121a2a', '#18213a'][k]);
      },
      apres(g, cr, k) {
        if (k === 0) return;
        for (let i = 0; i < 4 + 3 * k; i++) {
          const x = alea(i, 751 + k) * W,
            top = CGH - cr(x),
            y = top + 34 + alea(i, 753 + k) * Math.max(10, CGH - top - 60),
            rx = 50 + 80 * alea(i, 755 + k),
            ry = 5 + 6 * alea(i, 757 + k);
          const lg = g.createLinearGradient(0, y - ry, 0, y + ry);
          lg.addColorStop(0, 'rgba(150,180,240,0.30)');
          lg.addColorStop(1, 'rgba(60,80,130,0.10)');
          g.fillStyle = lg;
          g.beginPath();
          g.ellipse(x, y, rx, ry, 0, 0, 6.2832);
          g.fill();
          g.strokeStyle = 'rgba(220,235,255,0.5)';
          g.lineWidth = 1.4;
          g.beginPath();
          g.ellipse(x, y, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
          if (k === 2) SOLS.orage.flaques.push({ x, y, rx, ry });
        }
      },
    },
    braises: {
      tons: [
        ['#241614', '#120b0a'],
        ['#30201c', '#18100e'],
        ['#3e2a24', '#1e1412'],
      ],
      lisere: '255,170,110',
      lisereA: 0.7,
      apres(g, cr, k) {
        // cendre : un grain gris chaud, et le lit sombre de chaque braise
        for (let i = 0; i < 220; i++) {
          const x = alea(i, 851 + k) * W,
            top = CGH - cr(x);
          g.fillStyle = i % 2 ? 'rgba(150,120,105,0.16)' : 'rgba(0,0,0,0.22)';
          g.beginPath();
          g.arc(
            x,
            top + 6 + alea(i, 853 + k) * (CGH - top - 6),
            0.8 + 1.8 * alea(i, 855 + k),
            0,
            6.2832,
          );
          g.fill();
        }
      },
    },
    nuit: {
      tons: [
        ['#16243e', '#0a1222'],
        ['#1c2e4c', '#0c1628'],
        ['#26395a', '#101c30'],
      ],
      lisere: '170,200,255',
      lisereA: 0.8,
      vent: 0.022,
      avant(g, cr, k) {
        sapins(g, cr, k, ['#0d1728', '#132036'][k]);
      },
    },
    aurore: {
      tons: [
        ['#3a4f74', '#1c2a46'],
        ['#5a7299', '#2a3c5e'],
        ['#8aa4c8', '#3c5278'],
      ],
      lisere: '150,255,200',
      lisereA: 1.1,
      vent: 0.022,
      avant(g, cr, k) {
        sapins(g, cr, k, ['#0f1c30', '#16263e'][k]);
      },
    },
    lucioles: {
      tons: [
        ['#12261c', '#08140e'],
        ['#183424', '#0c1a12'],
        ['#20442e', '#0e2016'],
      ],
      lisere: '190,255,150',
      lisereA: 0.6,
      vent: 0.12,
      avant(g, cr, k) {
        brins(
          g,
          cr,
          k,
          ['#0c1a12', '#0e2016', '#16301f'][k],
          ['#1c3a28', '#285238', '#3a7048'][k],
          56,
          6,
          781 + k * 5,
        );
      },
    },
    brume: {
      tons: [
        ['#6e7a78', '#4c5654'],
        ['#8a9694', '#5e6a68'],
        ['#a8b4b0', '#727e7a'],
      ],
      lisere: '235,245,240',
      lisereA: 0.7,
      vent: 0.06,
      avant(g, cr, k) {
        if (k === 0) return;
        let i = 0;
        for (let x = 30; x < W; x += 30 + 70 * alea(i, 791 + k), i++) {
          const top = CGH - cr(x),
            h = 60 + 70 * alea(i, 793 + k),
            lean = (alea(i, 795 + k) - 0.5) * 16;
          g.strokeStyle = ['', '#56605e', '#69736f'][k];
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, top + 6);
          g.quadraticCurveTo(x + lean * 0.3, top - h * 0.5, x + lean, top - h);
          g.stroke();
          g.fillStyle = ['', '#4a5250', '#5a6460'][k];
          g.beginPath();
          g.ellipse(x + lean, top - h + 4, 3.6, 13, lean * 0.02, 0, 6.2832);
          g.fill();
        }
      },
    },
  };
  const SOL_DE = {
    pluie: 'pluie',
    automne: 'automne',
    printemps: 'printemps',
    ete: 'ete',
    orage: 'orage',
    braises: 'braises',
    etoiles: 'nuit',
    aurore: 'aurore',
    lucioles: 'lucioles',
    brume: 'brume',
  };
  const solsImg = {};
  function sol(nom) {
    if (solsImg[nom]) return solsImg[nom];
    const D = SOLS[nom],
      toile = () => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = CGH;
        return c;
      };
    const plans = CRETES.map((cr, k) => {
      const pl = { avant: null, corps: toile(), lueur: null },
        g = pl.corps.getContext('2d');
      const trace = (dy) => {
        g.beginPath();
        g.moveTo(-20, CGH + 20);
        for (let x = -20; x <= W + 20; x += 8) g.lineTo(x, CGH - cr(x) + dy);
        g.lineTo(W + 20, CGH + 20);
        g.closePath();
      };
      if (D.avant) {
        pl.avant = toile();
        D.avant(pl.avant.getContext('2d'), cr, k);
      }
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 30;
      g.shadowOffsetY = -8;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      trace(6);
      g.fill();
      g.restore();
      const lg = g.createLinearGradient(0, CGH - 250, 0, CGH);
      lg.addColorStop(0, D.tons[k][0]);
      lg.addColorStop(1, D.tons[k][1]);
      g.fillStyle = lg;
      trace(0);
      g.fill();
      g.save();
      g.shadowColor = 'rgba(' + D.lisere + ',0.9)';
      g.shadowBlur = 10;
      g.strokeStyle =
        'rgba(' +
        D.lisere +
        ',' +
        Math.min(1, (0.16 + 0.17 * k) * (D.lisereA || 1)).toFixed(3) +
        ')';
      g.lineWidth = 2.2;
      g.beginPath();
      for (let x = -20; x <= W + 20; x += 8) {
        const y = CGH - cr(x) + 1.5;
        if (x === -20) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
      if (D.apres) D.apres(g, cr, k);
      if (D.lueur) {
        pl.lueur = toile();
        D.lueur(pl.lueur.getContext('2d'), cr, k);
      }
      return pl;
    });
    solsImg[nom] = { plans };
    return solsImg[nom];
  }
  // Le sol a l'image : les trois plans, le vent dans ce qui depasse, puis la vie propre a la saison.
  function peindreSol(g, e, m, P) {
    const nom = SOL_DE[m],
      D = SOLS[nom],
      S = sol(nom),
      av = Math.min(1, Math.max(0, e.avance || 0));
    const mont = (1 - (0.5 + 0.5 * av)) * 100 + (1 - P) * 160,
      y0 = H - CGH + mont,
      t = e.t,
      calme = e.reduit ? 0 : 1;
    if (!halo) halo = modeleHalo();
    g.save();
    if (m === 'brume') {
      const br = teindre('brume', halo, [196, 210, 208], 64, 64);
      for (let i = 0; i < 2; i++) {
        g.globalAlpha = 0.2 * P;
        g.drawImage(
          br,
          ((t * (14 + 9 * i) + i * 700) % (W + 1400)) - 1000,
          H - 540 + mont + i * 60,
          1400,
          380,
        );
      }
    }
    g.globalAlpha = Math.min(1, P * 1.6);
    const A = g.globalAlpha;
    S.plans.forEach((pl, k) => {
      if (pl.avant) {
        if (D.vent && calme) {
          const cw = 30;
          for (let x = 0; x < W; x += cw) {
            const xc = x + cw / 2,
              yb = y0 + CGH - CRETES[k](xc) + 8;
            const sh =
              D.vent *
              (0.6 * Math.sin(t * 1.4 + xc * 0.011 + k * 1.7) +
                0.4 * Math.sin(t * 0.55 + xc * 0.0035) +
                vent / 80);
            g.save();
            g.transform(1, 0, -sh, 1, sh * yb, 0);
            g.drawImage(pl.avant, x, 0, cw + 1, CGH, x, y0, cw + 1, CGH);
            g.restore();
          }
        } else g.drawImage(pl.avant, 0, y0);
      }
      g.drawImage(pl.corps, 0, y0);
      if (pl.lueur) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha =
          Math.max(
            0.15,
            Math.min(1, 0.55 + 0.3 * Math.sin(t * 1.1 + k * 1.9) + 0.15 * Math.sin(t * 3.7 + k)),
          ) * P;
        g.drawImage(pl.lueur, 0, y0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = A;
      }
    });
    const crete = (x) => y0 + CGH - CRETES[2](x);
    if (m === 'automne' && calme) {
      // des feuilles que le vent fait courir et sauter sur le tapis
      const PAL = ['#c8822e', '#a04e22', '#d8a446', '#8a3a1c'];
      for (let i = 0; i < 12; i++) {
        const x = ((alea(i, 801) * W + t * (50 + 90 * alea(i, 803))) % (W + 80)) - 40,
          saut =
            Math.abs(Math.sin(t * (1.6 + 1.8 * alea(i, 805)) + i * 2.3)) * (8 + 22 * alea(i, 807));
        g.save();
        g.translate(x, crete(x) - 3 - saut);
        g.rotate(t * (2.5 + 2 * alea(i, 809)) + i);
        g.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(t * 2.1 + i)));
        g.globalAlpha = 0.95 * P;
        feuille(g, 8 + 6 * alea(i, 811), PAL[i % 4]);
        g.restore();
      }
    }
    if ((m === 'pluie' || m === 'orage') && calme) {
      // la pluie frappe le sol : une couronne qui s'ouvre, deux gouttelettes qui sautent
      g.strokeStyle = 'rgba(200,225,240,1)';
      g.fillStyle = 'rgba(200,225,240,1)';
      g.lineWidth = 1.5;
      const n = m === 'orage' ? 22 : 13;
      for (let i = 0; i < n; i++) {
        const cad = 1.1 + 0.9 * alea(i, 821),
          ph = t * cad + alea(i, 823) * 9,
          u = ph % 1,
          tour = Math.floor(ph);
        const x = alea(i * 53 + tour, 825) * W,
          y = crete(x) + 6 + alea(i * 53 + tour, 827) * 90;
        if (y > H) continue;
        g.globalAlpha = 0.5 * (1 - u) * P;
        g.beginPath();
        g.ellipse(x, y, 4 + 24 * u, (4 + 24 * u) * 0.3, 0, 0, 6.2832);
        g.stroke();
        if (u < 0.4) {
          const v = u / 0.4,
            hy = Math.sin(v * Math.PI) * 14;
          g.globalAlpha = 0.7 * (1 - v) * P;
          g.beginPath();
          g.arc(x - 7 * v - 2, y - hy, 1.6, 0, 6.2832);
          g.arc(x + 9 * v + 2, y - hy * 0.8, 1.3, 0, 6.2832);
          g.fill();
        }
      }
    }
    g.globalCompositeOperation = 'lighter';
    if (m === 'orage') {
      // des ronds dans les flaques, et tout le sol qui s'eclaire a l'eclair
      g.strokeStyle = 'rgba(210,228,255,1)';
      g.lineWidth = 1.3;
      D.flaques.forEach((f, i) => {
        const u = (t * (0.7 + 0.4 * alea(i, 831)) + alea(i, 833) * 5) % 1;
        g.globalAlpha = 0.45 * (1 - u) * P;
        g.beginPath();
        g.ellipse(
          f.x + (alea(i, 835) - 0.5) * f.rx,
          y0 + f.y,
          f.rx * 0.5 * u + 3,
          (((f.rx * 0.5 * u + 3) * f.ry) / f.rx) * 1.6,
          0,
          0,
          6.2832,
        );
        g.stroke();
      });
      const I = eclair(t);
      if (I > 0.02) {
        g.globalAlpha = 0.8 * I * P;
        S.plans.forEach((pl) => {
          if (pl.avant) g.drawImage(pl.avant, 0, y0);
          g.drawImage(pl.corps, 0, y0);
        });
      }
    }
    if (m === 'braises') {
      // des braises eparses dans la cendre : chacune respire a son rythme, un coeur clair dans un petit halo
      const hb = teindre('braiseSol', halo, [255, 120, 40], 64, 64),
        hc = teindre('braiseCoeur', halo, [255, 214, 150], 64, 64);
      for (let i = 0; i < 34; i++) {
        const k = i % 3,
          x = alea(i, 861) * W,
          top = y0 + CGH - CRETES[k](x),
          y = top + 10 + alea(i, 863) * 120;
        if (y > H + 10 || (k < 2 && y > y0 + CGH - CRETES[k + 1](x) - 4)) continue;
        const v =
            0.35 +
            0.65 *
              Math.pow(
                0.5 + 0.5 * Math.sin(t * (0.5 + 0.9 * alea(i, 865)) + alea(i, 867) * 6.28),
                2,
              ),
          R = (7 + 9 * alea(i, 869)) * (0.7 + 0.2 * k);
        g.globalAlpha = 0.55 * v * P;
        g.drawImage(hb, x - R * 2.2, y - R * 1.3, R * 4.4, R * 2.6);
        g.globalAlpha = 0.9 * v * P;
        g.drawImage(hc, x - R * 0.7, y - R * 0.45, R * 1.4, R * 0.9);
      }
    }
    if (m === 'aurore') {
      // la neige renvoie l'aurore : un reflet vert qui respire sur les cretes
      g.globalAlpha = (0.13 + 0.06 * Math.sin(t * 0.4)) * P;
      g.drawImage(
        teindre('reflet', halo, [110, 255, 190], 64, 64),
        -200 + Math.sin(t * 0.13) * 160,
        y0 - 40,
        W + 400,
        320,
      );
    }
    g.restore();
  }

  // l'eclair : 0 la plupart du temps, un double eclat doux toutes les 8 a 14 secondes
  function eclair(t) {
    const k = Math.floor(t / 11),
      tf = t - k * 11 - 1 - alea(k, 5) * 6;
    if (tf < 0 || tf > 0.7) return 0;
    return Math.max(Math.exp(-tf * 9), tf > 0.2 ? 0.75 * Math.exp(-(tf - 0.2) * 11) : 0);
  }

  function ambiance(h) {
    h = ((h % 1) + 1) % 1;
    let i = 0;
    for (let k = 0; k < CLES.length; k++) if (h >= CLES[k].t) i = k;
    const A = CLES[i],
      B = CLES[(i + 1) % CLES.length];
    const t0 = A.t,
      t1 = B.t <= A.t ? B.t + 1 : B.t;
    let u = (h - t0) / (t1 - t0);
    u = u * u * (3 - 2 * u); // fondu doux, jamais de cassure
    const o = { nom: u < 0.5 ? A.nom : B.nom };
    COULEURS.forEach(function (c) {
      o[c] = mel(A[c], B[c], u);
    });
    NOMBRES.forEach(function (c) {
      o[c] = A[c] + (B[c] - A[c]) * u;
    });
    const paires = [
      [METEOS[meteoPrec], 1 - mixM],
      [METEOS[meteo], mixM],
    ];
    ['haut', 'mil', 'bas', 'voile', 'lueur'].forEach(function (c) {
      const base = o[c],
        kk = c === 'lueur' ? 0.5 : 1;
      let res = [0, 0, 0];
      paires.forEach(function (q) {
        const v = q[0] ? mel(base, q[0].teinte, q[0].k * kk) : base;
        res = [res[0] + v[0] * q[1], res[1] + v[1] * q[1], res[2] + v[2] * q[1]];
      });
      o[c] = res;
    });
    let fpt = 0,
      flu = 0;
    paires.forEach(function (q) {
      fpt += ((q[0] && q[0].pt) || 1) * q[1];
      flu += ((q[0] && q[0].lueur) || 1) * q[1];
    });
    o.ptA = Math.min(1, o.ptA * fpt);
    o.lueurA = o.lueurA * flu;
    return o;
  }

  // Le rai de lumiere, pre-rendu une seule fois en blanc dans un petit canvas.
  // Chaque image se contente de le poser, tourne et etire : un drawImage au lieu de neuf degrades.
  const RW = 96,
    RH = 512;
  let raiBlanc = null,
    raiTeint = null,
    raiCle = '';
  function modeleRai() {
    const c = document.createElement('canvas');
    c.width = RW;
    c.height = RH;
    const g = c.getContext('2d');
    const d = g.createImageData(RW, RH),
      p = d.data;
    for (let y = 0; y < RH; y++) {
      const v = y / (RH - 1);
      // le long du rai : il s'allume sous la canopee, culmine, puis se dilue dans l'air
      const lg = v < 0.14 ? (v / 0.14) * (v / 0.14) : Math.pow(1 - (v - 0.14) / 0.86, 1.7);
      for (let x = 0; x < RW; x++) {
        const u = ((x + 0.5) / RW) * 2 - 1;
        // en travers : retombee en cosinus, des bords doux sans aucun flou a calculer
        const bord = Math.cos((u * Math.PI) / 2);
        // et le rai s'elargit en descendant, donc les bords se resserrent en haut
        const large = 0.35 + 0.65 * v;
        const dedans = Math.max(0, 1 - Math.abs(u) / large);
        const a = lg * bord * bord * dedans;
        const i = (y * RW + x) * 4;
        p[i] = p[i + 1] = p[i + 2] = 255;
        p[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
      }
    }
    g.putImageData(d, 0, 0);
    return c;
  }
  // le modele blanc prend la couleur de l'heure : une seule teinture par image, pas une par rai
  function teindreRai(coul) {
    if (!raiBlanc) raiBlanc = modeleRai();
    const cle = Math.round(coul[0]) + ',' + Math.round(coul[1]) + ',' + Math.round(coul[2]);
    if (raiTeint && raiCle === cle) return raiTeint;
    if (!raiTeint) {
      raiTeint = document.createElement('canvas');
      raiTeint.width = RW;
      raiTeint.height = RH;
    }
    const g = raiTeint.getContext('2d');
    g.clearRect(0, 0, RW, RH);
    g.drawImage(raiBlanc, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = rgb(coul);
    g.fillRect(0, 0, RW, RH);
    g.globalCompositeOperation = 'source-over';
    raiCle = cle;
    return raiTeint;
  }

  // L'ombre de la canopee. Elle remplace les rais de lumiere, qui etaient des objets clairs et
  // mobiles : ils captaient l'oeil et concurrencaient le serpent. Une masse sombre dit la meme chose,
  // des feuilles au dessus et une lumiere derriere, mais elle augmente le contraste au lieu de le
  // reduire. Pre-rendue une fois, posee en un seul drawImage.
  const KW = 512,
    KH = 256;
  let canopee = null;
  function modeleCanopee() {
    const c = document.createElement('canvas');
    c.width = KW;
    c.height = KH;
    const g = c.getContext('2d');
    // des masses molles accrochees au bord haut, de plus en plus rares en descendant
    for (let i = 0; i < 26; i++) {
      const x = alea(i, 3) * KW;
      const y = -KH * 0.12 + Math.pow(alea(i, 5), 1.9) * KH * 0.95;
      const r = KH * (0.16 + alea(i, 9) * 0.34);
      const a = 0.3 * (1 - y / (KH * 1.05));
      if (a <= 0) continue;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
      rg.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.45).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // une lisiere continue tout en haut, pour que le bord du cadre ne se voie pas
    const lg = g.createLinearGradient(0, 0, 0, KH * 0.5);
    lg.addColorStop(0, 'rgba(0,0,0,0.42)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, KW, KH * 0.5);
    return c;
  }

  // Un halo pre-rendu remplace shadowBlur, qui est l'appel le plus cher du canvas 2D.
  let halo = null;
  function modeleHalo() {
    const n = 64,
      c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    rg.addColorStop(0.0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    rg.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, n, n);
    return c;
  }
  // Une goutte pre-rendue : tete renflee en bas, trainee qui s'affine vers le haut.
  let gouttePre = null;
  function modeleGoutte() {
    const w = 24,
      h = 128,
      c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.65, 'rgba(255,255,255,0.55)');
    lg.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = lg;
    const x = w / 2,
      la = w * 0.34,
      y = h - la * 0.8;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + la * 0.9, y * 0.58, x + la, y - la * 0.6);
    g.quadraticCurveTo(x + la * 0.85, y + la * 0.55, x, y + la * 0.75);
    g.quadraticCurveTo(x - la * 0.85, y + la * 0.55, x - la, y - la * 0.6);
    g.quadraticCurveTo(x - la * 0.9, y * 0.58, x, 0);
    g.fill();
    return c;
  }
  // Teinture generique : un modele blanc prend une couleur, une fois, et se garde.
  const teints = {};
  function teindre(nom, modele, coul, w, h) {
    const cle = Math.round(coul[0]) + ',' + Math.round(coul[1]) + ',' + Math.round(coul[2]);
    let e = teints[nom];
    if (!e) {
      e = teints[nom] = { c: document.createElement('canvas'), cle: '' };
      e.c.width = w;
      e.c.height = h;
    }
    if (e.cle === cle) return e.c;
    const g = e.c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(modele, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = rgb(coul);
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    e.cle = cle;
    return e.c;
  }

  // Le ciel : degrade, lueur et voile sont trois passes plein ecran qui ne changent qu'avec l'heure.
  // On les peint une fois dans un canvas demi-resolution, et l'image s'y contente d'un drawImage.
  const CW = 270,
    CH = 480;
  let ciel = null,
    cielCle = -1;
  function peindreCiel(A, prog) {
    // on ne recalcule que quand l'heure ou la tension ont bouge d'un cran perceptible
    const cle =
      meteo +
      meteoPrec +
      Math.round(mixM * 40) +
      Math.round((A.lueurX + A.lueurA * 7 + A.voileA * 11 + A.haut[1] / 255) * 400) * 8 +
      Math.round(prog * 20);
    if (ciel && cielCle === cle) return ciel;
    if (!ciel) {
      ciel = document.createElement('canvas');
      ciel.width = CW;
      ciel.height = CH;
    }
    const g = ciel.getContext('2d');
    const d = 0.18 * prog;
    const haut = mel(A.haut, [24, 30, 28], d),
      mil = mel(A.mil, [18, 23, 21], d),
      bas = mel(A.bas, [10, 13, 12], d);
    const lg = g.createLinearGradient(0, 0, 0, CH);
    lg.addColorStop(0, rgb(haut));
    lg.addColorStop(0.45, rgb(mil));
    lg.addColorStop(1, rgb(bas));
    g.fillStyle = lg;
    g.fillRect(0, 0, CW, CH);
    const R = CH * A.lueurR,
      lx0 = CW * A.lueurX,
      ly0 = CH * A.lueurY;
    const rg = g.createRadialGradient(lx0, ly0, 0, lx0, ly0, R);
    rg.addColorStop(0, rgba(A.lueur, A.lueurA));
    rg.addColorStop(0.55, rgba(A.lueur, A.lueurA * 0.32));
    rg.addColorStop(1, rgba(A.lueur, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, CW, CH);
    g.globalAlpha = A.voileA;
    g.fillStyle = rgb(A.voile);
    g.fillRect(0, 0, CW, CH);
    g.globalAlpha = 1;
    cielCle = cle;
    return ciel;
  }

  // La vignette suit la tension du jeu, pas l'avancement de la manche : elle se ferme quand
  // l'espace manque et elle se rouvre des que le serpent respire.
  let vign = null,
    vignCle = -1;
  function peindreVignette(A, ten) {
    const prog = ten;
    const f = A.vign + 0.34 * ten;
    const cle = Math.round(f * 200) * 40 + Math.round(ten * 20);
    if (vign && vignCle === cle) return vign;
    if (!vign) {
      vign = document.createElement('canvas');
      vign.width = CW;
      vign.height = CH;
    }
    const g = vign.getContext('2d');
    g.clearRect(0, 0, CW, CH);
    const vg = g.createRadialGradient(
      CW / 2,
      CH * 0.4,
      CH * (0.21 - 0.1 * ten),
      CW / 2,
      CH * 0.44,
      CH * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,' + f.toFixed(3) + ')');
    g.fillStyle = vg;
    g.fillRect(0, 0, CW, CH);
    vignCle = cle;
    return vign;
  }

  // Le grain : une tuile calculee une fois, repetee ensuite. C'est elle qui tue le banding.
  let motifGrain = null;
  function tuileGrain() {
    const n = 128,
      c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d'),
      d = x.createImageData(n, n),
      p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      p[i] = p[i + 1] = p[i + 2] = v;
      p[i + 3] = 26;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  // Pluie : tableaux pre-alloues, aucune allocation par image.
  // Les gouttes sont reparties par bandes verticales, une bande chacune, sinon le hachage les
  // regroupe au milieu de l'ecran. Une goutte qui retombe revient dans sa bande, decalee d'un tour.
  const NL = 48,
    NP = 18,
    N = NL + NP;
  const gx = new Float32Array(N),
    gy = new Float32Array(N),
    gv = new Float32Array(N),
    ga = new Float32Array(N);
  const tours = new Int16Array(N);
  // chaque goutte frappe a sa propre profondeur sur le sol, pas toutes sur la meme ligne
  const gsol = new Float32Array(N);
  function colonne(i, n, d) {
    return ((i + 0.15 + 0.7 * alea(i, d)) / n) * W;
  }
  function semer(i, haut) {
    const proche = i >= NL,
      ix = proche ? i - NL : i,
      n = proche ? NP : NL;
    gx[i] = colonne(ix, n, 101 + tours[i] * 13);
    gy[i] = haut ? -40 - Math.random() * 200 : ((ix + 0.5) / n) * H;
    gv[i] = proche ? 450 + alea(i, 75) * 250 : 320 + alea(i, 77) * 80;
    ga[i] = 0.7 + alea(i, 79) * 0.3;
    // le sol a de la profondeur : l'impact se fait quelque part entre le milieu et le bas du plateau
    gsol[i] = GY0 + (0.34 + 0.64 * alea(i, 131 + tours[i] * 7)) * (GY1 - GY0);
  }
  for (let i = 0; i < N; i++) semer(i, false);
  // les ondes tombent sur le plateau, pas dessous : GY1 est le bas de la zone que le spectateur voit
  const RMAX = 14,
    rx = new Float32Array(RMAX),
    ry = new Float32Array(RMAX),
    rt = new Float32Array(RMAX).fill(1);
  const rp = new Float32Array(RMAX).fill(1); // profondeur de l'impact : une onde lointaine est petite
  const EMAX = 26,
    ex = new Float32Array(EMAX),
    ey = new Float32Array(EMAX);
  const evx = new Float32Array(EMAX),
    evy = new Float32Array(EMAX),
    et = new Float32Array(EMAX).fill(9);
  let vent = 0;
  // les gouttes collees a l'objectif : elles glissent sur l'image, pas sur la scene
  const LMAX = 5,
    lx = [],
    ly = [],
    lr = [],
    lv = [],
    lph = [];
  for (let i = 0; i < LMAX; i++) {
    lx.push(alea(i, 81) * W);
    ly.push(alea(i, 83) * H);
    lr.push(6 + alea(i, 85) * 14);
    lv.push(8 + alea(i, 87) * 28);
    lph.push(alea(i, 89) * 6.2832);
  }

  function actives(e) {
    const dens = e.mondeSorte === 'averse' ? 1 + 1.2 * e.monde : 1;
    return { nl: Math.min(NL, Math.round(NL * dens)), np: Math.min(NP, Math.round(NP * dens)) };
  }

  // une goutte : tete renflee en bas, trainee qui s'affine vers le haut
  function goutte(g, x, y, lon, larg, al, c) {
    const lg = g.createLinearGradient(x, y - lon, x, y);
    lg.addColorStop(0, rgba(c, 0));
    lg.addColorStop(0.65, rgba(c, al * 0.55));
    lg.addColorStop(1, rgba(c, al));
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x, y - lon);
    g.quadraticCurveTo(x + larg * 0.9, y - lon * 0.42, x + larg, y - larg * 0.6);
    g.quadraticCurveTo(x + larg * 0.85, y + larg * 0.55, x, y + larg * 0.75);
    g.quadraticCurveTo(x - larg * 0.85, y + larg * 0.55, x - larg, y - larg * 0.6);
    g.quadraticCurveTo(x - larg * 0.9, y - lon * 0.42, x, y - lon);
    g.fill();
  }

  (window.AMBIANCES = window.AMBIANCES || []).push({
    id: 'foret',
    nom: 'Forêt sous la pluie',
    intention: 'Pluie lente sur la mousse, feuillages flous hors du jeu',
    accent: '#b4d4de',
    gammeNom: 'Sol pentatonique majeur',
    gamme: [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77, 1174.66, 1318.51],
    cadeaux: {
      aide: { nom: 'Fruit', effet: 'fruit' },
      gene: { nom: 'Pierre', effet: 'pierre' },
      monde: { nom: 'Averse' },
    },

    peindreFond(g, e) {
      cadre(e);
      const mv = METEOS.hasOwnProperty(e.meteo) ? e.meteo : 'pluie';
      if (mv !== meteo) {
        meteoPrec = meteo;
        meteo = mv;
        meteoT = e.t;
      }
      if (e.t < meteoT || e.meteoNet) meteoT = -99; // une manche s'ouvre sur SA meteo, deja installee : jamais deux saisons a l'image
      {
        const u = Math.min(1, Math.max(0, (e.t - meteoT) / 3.5));
        mixM = u * u * (3 - 2 * u);
      }
      const A = ambiance(e.heure || 0),
        prog = Math.min(1, Math.max(0, e.progression || 0));
      // le ciel entier, degrade, lueur et voile, tient dans une seule image mise en cache
      g.drawImage(peindreCiel(A, prog), 0, 0, W, H);

      // L'ombre de la canopee, en haut, qui derive tres lentement. Elle est d'autant plus marquee
      // que la lumiere est forte derriere elle : a midi les feuilles decoupent, la nuit elles se
      // fondent dans le noir. Une seule image posee, aucun objet clair qui bouge.
      {
        if (!canopee) canopee = modeleCanopee();
        const dense = 0.55 + 6.5 * A.raiA; // raiA sert maintenant de force de contre-jour
        const lh = H * 0.46,
          marge = W * 0.16;
        // elle glisse dans sa marge, et penche du cote oppose a la lumiere
        // bornee : l'image fait W + marge de large, elle doit toujours couvrir de 0 a W. Sans la borne, au coucher
        // (lueurX 0.86) elle glissait de 37 px vers la droite et laissait une bande claire sur le bord gauche.
        const dx = Math.max(
          -marge,
          Math.min(
            0,
            -marge / 2 + Math.sin(e.t * 0.017) * marge * 0.42 + (A.lueurX - 0.5) * marge * 0.8,
          ),
        );
        g.save();
        g.globalAlpha = Math.min(1, dense);
        g.drawImage(canopee, dx, -H * 0.03, W + marge, lh);
        g.restore();
      }

      // les points en suspension : lucioles la nuit, spores dans la lumiere le jour.
      // Le halo est une image pre-rendue : shadowBlur coute dix fois plus cher pour le meme resultat.
      if (!halo) halo = modeleHalo();
      const ptImg = teindre('pt', halo, A.pt, 64, 64);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const ph = alea(i, 31) * 6.2832,
          vit = 0.18 + alea(i, 33) * 0.25;
        const x = W * (0.1 + 0.8 * alea(i, 35)) + Math.sin(e.t * vit + ph) * W * 0.13;
        const y = H * (0.06 + alea(i, 37) * 0.88) + Math.cos(e.t * vit * 0.7 + ph) * 80;
        const pulse = Math.max(0, Math.sin(e.t * (0.5 + alea(i, 39) * 0.6) + ph));
        const r = (3.2 + alea(i, 41) * 4.8) * A.ptR;
        g.globalAlpha = A.ptA * (0.22 + 0.78 * pulse * pulse * A.ptHalo + 0.3 * (1 - A.ptHalo));
        const R = r * (1.25 + 1.35 * A.ptHalo);
        g.drawImage(ptImg, x - R, y - R, R * 2, R * 2);
      }
      g.restore();

      if (!halo) halo = modeleHalo();
      // ciel de nuit : des etoiles qui respirent (etoiles, aurore, un peu pour les lucioles)
      const Pciel = Math.min(
        1,
        poids('etoiles') + 0.8 * poids('aurore') + 0.35 * poids('lucioles'),
      );
      if (Pciel > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const et0 = teindre('etoile', halo, [226, 234, 255], 64, 64);
        for (let i = 0; i < 70; i++) {
          const x = alea(i, 201) * W,
            y = alea(i, 203) * H,
            tw = 0.5 + 0.5 * Math.sin(e.t * (0.6 + alea(i, 205) * 1.4) + alea(i, 207) * 6.28);
          const R = 3 + alea(i, 209) * 6;
          g.globalAlpha = (0.16 + 0.5 * alea(i, 211)) * (0.45 + 0.55 * tw) * Pciel;
          g.drawImage(et0, x - R, y - R, R * 2, R * 2);
        }
        const Pf = poids('etoiles');
        for (let q = 0; q < 2 && Pf > 0.01; q++) {
          const per = 5.5 + q * 3.1,
            k = Math.floor(e.t / per),
            tf = (e.t - k * per - alea(k, 221 + q) * (per - 1.2)) / 1.0;
          if (tf < 0 || tf > 1) continue;
          const x0 = W * (0.08 + 0.7 * alea(k, 223 + q)),
            y0 = H * (0.04 + 0.5 * alea(k, 225 + q)),
            an = 0.42 + 0.35 * alea(k, 227 + q);
          const d = 140 + tf * 620,
            L = 250,
            cx = Math.cos(an),
            sy = Math.sin(an);
          const x1 = x0 + cx * d,
            y1 = y0 + sy * d,
            lg = g.createLinearGradient(x1 - cx * L, y1 - sy * L, x1, y1);
          lg.addColorStop(0, 'rgba(226,234,255,0)');
          lg.addColorStop(
            1,
            'rgba(240,244,255,' + (0.85 * Math.sin(tf * Math.PI) * Pf).toFixed(3) + ')',
          );
          g.globalAlpha = 1;
          g.strokeStyle = lg;
          g.lineWidth = 3.2;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x1 - cx * L, y1 - sy * L);
          g.lineTo(x1, y1);
          g.stroke();
          g.globalAlpha = 0.9 * Math.sin(tf * Math.PI) * Pf;
          g.drawImage(et0, x1 - 11, y1 - 11, 22, 22);
        }
        g.restore();
      }
      // l'aurore : trois voiles lents, verts puis violets, qui ondulent dans le haut de l'image
      const Pau = poids('aurore');
      if (Pau > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const VOILES = [
          [96, 240, 170],
          [110, 200, 255],
          [190, 120, 255],
        ];
        for (let v = 0; v < 3; v++) {
          const im = teindre('aurore' + v, halo, VOILES[v], 64, 64);
          for (let x = -80; x < W + 80; x += 16) {
            const o1 = Math.sin(x * 0.0052 + e.t * 0.16 + v * 2.1),
              o2 = Math.sin(x * 0.013 - e.t * 0.23 + v);
            const y = H * (0.1 + 0.13 * v) + o1 * 90 + o2 * 30,
              hh = 330 + 120 * o2;
            g.globalAlpha =
              (0.026 + 0.02 * (0.5 + 0.5 * Math.sin(x * 0.006 + e.t * 0.5 + v * 1.7))) * Pau;
            g.drawImage(im, x - 110, y - hh * 0.3, 220, hh);
          }
        }
        g.restore();
      }
      // l'ete : de grands rais de soleil qui traversent la foret en biais
      const Pete = poids('ete') + 0.6 * poids('printemps');
      if (Pete > 0.01) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        // Des rais DOUX : le modele pre-rendu (bords en cosinus, naissance sous la canopee, dilution vers le bas),
        // jamais un polygone. Largeurs et longueurs inegales, un souffle lent et dephase, une derive a peine sensible.
        const rai = teindreRai([255, 238, 176]);
        for (let i = 0; i < 6; i++) {
          const x0 =
            W * (0.22 + 0.17 * i + 0.05 * alea(i, 371)) + Math.sin(e.t * 0.04 + i * 1.3) * 50;
          const larg = 190 + 260 * alea(i, 373),
            lon = H * (0.62 + 0.3 * alea(i, 375));
          const souffle = 0.55 + 0.45 * Math.sin(e.t * (0.16 + 0.1 * alea(i, 377)) + i * 2.1);
          g.save();
          g.translate(x0, -90);
          g.rotate(0.4 + 0.05 * Math.sin(e.t * 0.03 + i) + 0.04 * (alea(i, 379) - 0.5));
          g.globalAlpha = (0.1 + 0.13 * alea(i, 381)) * (0.6 + 0.4 * souffle) * Pete;
          g.drawImage(rai, -larg / 2, 0, larg, lon);
          g.restore();
        }
        g.restore();
      }
      // l'automne : des feuilles deja posees au sol, derriere les serpents
      const Pau2 = poids('automne');
      if (Pau2 > 0.01) {
        const TONS = ['#b8702c', '#9a4a26', '#c89a44', '#7e5a2a'];
        for (let i = 0; i < 46; i++) {
          g.save();
          g.translate(alea(i, 381) * W, H * (0.12 + 0.86 * alea(i, 383)));
          g.rotate(alea(i, 385) * 6.28);
          g.globalAlpha = (0.1 + 0.1 * alea(i, 387)) * Pau2;
          g.fillStyle = TONS[i % 4];
          const T = 10 + alea(i, 389) * 10;
          g.beginPath();
          g.ellipse(0, 0, T, T * 0.5, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
      const Por = poids('orage');
      if (Por > 0.01) {
        const I = eclair(e.t) * Por;
        if (I > 0.02) {
          // l'eclair lui-meme, loin derriere le plateau, puis la lueur qu'il jette sur toute la foret
          const k = Math.floor(e.t / 11);
          let x = W * (0.15 + 0.7 * alea(k, 231)),
            y = -10;
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = 'rgba(214,226,255,' + (0.55 * I).toFixed(3) + ')';
          g.lineWidth = 3;
          g.lineJoin = 'round';
          g.beginPath();
          g.moveTo(x, y);
          for (let j = 0; j < 9; j++) {
            x += (alea(k * 9 + j, 233) - 0.5) * 150;
            y += 60 + alea(k * 9 + j, 235) * 70;
            g.lineTo(x, y);
          }
          g.stroke();
          g.fillStyle = 'rgba(190,206,255,' + (0.17 * I).toFixed(3) + ')';
          g.fillRect(0, 0, W, H);
          g.restore();
        }
      }

      // le plateau : une surface a peine plus claire, et son filet
      g.save();
      g.globalAlpha = 0.05;
      g.fillStyle = rgba(mel(A.lueur, [255, 255, 255], 0.2), 0.22);
      g.fillRect(GX0, GY0, GX1 - GX0, GY1 - GY0);
      g.restore();
      g.strokeStyle = rgba(A.rai, 0.035);
      g.lineWidth = 2;
      g.strokeRect(GX0, GY0, GX1 - GX0, GY1 - GY0);

      if (e.mondeSorte === 'averse' && e.monde > 0) {
        g.fillStyle = 'rgba(6,10,8,' + 0.18 * e.monde + ')';
        g.fillRect(0, 0, W, H);
      }
    },

    peindreFruit(g, x, y, c, e, f) {
      const px = e.x0 + x * c + c / 2,
        py = e.y0 + y * c + c / 2,
        r = f && f.pseudo ? 19 : 16;
      g.save();
      g.shadowColor = 'rgba(159,199,164,0.55)';
      g.shadowBlur = 18;
      g.fillStyle = '#9FC7A4';
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.fillStyle = 'rgba(232,241,220,0.45)';
      g.beginPath();
      g.arc(px - r * 0.35, py - r * 0.35, r * 0.28, 0, Math.PI * 2);
      g.fill();
    },

    peindreObstacle(g, x, y, c, e, o) {
      const px = e.x0 + x * c + c / 2,
        py = e.y0 + y * c + c / 2;
      g.fillStyle = '#D9A27A';
      if (o && o.sorte === 'branche') {
        g.save();
        g.translate(px, py);
        g.rotate((((x * 7 + y * 3) % 5) - 2) * 0.09);
        g.beginPath();
        g.moveTo(-30, -9);
        g.lineTo(30, -6);
        g.lineTo(28, 8);
        g.lineTo(-29, 10);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(80,50,30,0.35)';
        g.fillRect(-26, 2, 50, 3);
        g.restore();
      } else {
        const j = ((x * 13 + y * 7) % 7) - 3;
        g.beginPath();
        g.moveTo(px + j * 2, py - 24);
        g.lineTo(px + 25, py + 18 + j);
        g.lineTo(px - 23, py + 20 - j);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(80,50,30,0.28)';
        g.beginPath();
        g.moveTo(px + j * 2, py - 24);
        g.lineTo(px + 25, py + 18 + j);
        g.lineTo(px + 4, py + 19);
        g.closePath();
        g.fill();
      }
    },

    peindreSerpent(g, pts, c, e) {
      if (!pts || pts.length < 2) return;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // Le contour sombre sous le corps a ete retire sur demande d'Abdel : invisible sur l'ancien
      // fond tres sombre, il ressortait comme une ombre portee des que le fond s'est eclairci.
      // 34 et non 38 : la case est passee de 52 a 47, le serpent garde le meme taux de remplissage
      if (e && e.teinte) {
        // helper local : parse un hex '#rrggbb' en tableau [r,g,b]
        const hex2rgb = (h) => [
          parseInt(h.slice(1, 3), 16),
          parseInt(h.slice(3, 5), 16),
          parseInt(h.slice(5, 7), 16),
        ];
        // mel existant : interpolation lineaire entre deux tableaux RGB
        const baseRgb = hex2rgb('#d9e7cc');
        const teintRgb = hex2rgb(e.teinte);
        const corpsRgb = mel(baseRgb, teintRgb, 0.85);
        g.strokeStyle = rgb(corpsRgb);
        g.lineWidth = 34;
        g.beginPath();
        for (let i = 0; i < pts.length; i++)
          i ? g.lineTo(pts[i].x, pts[i].y) : g.moveTo(pts[i].x, pts[i].y);
        g.stroke();
        const h = pts[0],
          n = pts[Math.min(2, pts.length - 1)];
        let dx = h.x - n.x,
          dy = h.y - n.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        g.fillStyle = e.teinte;
        g.beginPath();
        g.arc(h.x, h.y, 21, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1b2a1f';
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(h.x + dx * 8 - dy * 7 * s, h.y + dy * 8 + dx * 7 * s, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.strokeStyle = '#d9e7cc';
        g.lineWidth = 34;
        g.beginPath();
        for (let i = 0; i < pts.length; i++)
          i ? g.lineTo(pts[i].x, pts[i].y) : g.moveTo(pts[i].x, pts[i].y);
        g.stroke();
        const h = pts[0],
          n = pts[Math.min(2, pts.length - 1)];
        let dx = h.x - n.x,
          dy = h.y - n.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        g.fillStyle = '#e8f1dc';
        g.beginPath();
        g.arc(h.x, h.y, 21, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1b2a1f';
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(h.x + dx * 8 - dy * 7 * s, h.y + dy * 8 + dx * 7 * s, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    },

    peindreAvant(g, e) {
      const A = ambiance(e.heure || 0),
        prog = Math.min(1, Math.max(0, e.progression || 0));
      const plans = [];
      const tx = e.tete.x,
        ty = e.tete.y,
        k = actives(e),
        sil = 1 - 0.7 * (e.silence || 0);
      // la pluie prend la couleur de l'heure, et force un peu quand la manche avance
      const coul = mel([180, 212, 222], A.rai, 0.55),
        force = (1 + 0.35 * prog) * sil * (e.reduit ? 0.5 : 1) * pluieF();

      {
        g.save();
        if (!halo) halo = modeleHalo();
        const pres = (x, y) => {
          const d = Math.hypot(x - tx, y - ty);
          return d < 92 ? 0 : d < 224 ? (d - 92) / 132 : 1;
        };
        // ce qui tombe en tournant : feuilles d'automne, petales de printemps
        const tombe = (P, n, graine, tons, taille, al) => {
          for (let i = 0; i < n && P > 0.01; i++) {
            const pr = alea(i, graine),
              v = 60 + pr * 70,
              T = taille * (0.7 + 0.7 * pr);
            const y = ((alea(i, graine + 2) * (H + 80) + e.t * v) % (H + 80)) - 40;
            const x =
              alea(i, graine + 4) * W +
              Math.sin(e.t * (0.5 + alea(i, graine + 6) * 0.5) + alea(i, graine + 8) * 6.28) *
                (50 + 50 * pr) +
              vent * 0.8;
            g.save();
            g.translate(x, y);
            g.rotate(e.t * (0.6 + alea(i, graine + 10)) + alea(i, graine + 12) * 6.28);
            g.globalAlpha = (al + al * pr) * pres(x, y) * sil * P;
            g.scale(1, 0.3 + 0.7 * Math.abs(Math.sin(e.t * 1.3 + i)));
            feuille(g, T, tons[i % tons.length]);
            g.restore();
          }
        };
        tombe(poids('automne'), 30, 321, ['#c8822e', '#a04e22', '#d8a446', '#8a3a1c'], 13, 0.3);
        tombe(poids('printemps'), 34, 421, ['#f4c2d0', '#f7d6de', '#eaa6bc'], 8, 0.24);
        const Pn = poids('neige');
        if (Pn > 0.01) {
          const av = Math.min(1, Math.max(0, e.avance || 0));
          const fl = teindre('flocon', halo, [236, 244, 255], 64, 64);
          // trois profondeurs. Loin : une poussiere de points nets, lente, presque verticale.
          g.fillStyle = '#eef4ff';
          for (let i = 0; i < 130; i++) {
            const v = 24 + alea(i, 501) * 22,
              y = ((alea(i, 503) * (H + 40) + e.t * v) % (H + 40)) - 20;
            const x =
              alea(i, 505) * W + Math.sin(e.t * 0.3 + alea(i, 507) * 6.28) * 12 + vent * 0.25;
            g.globalAlpha = (0.2 + 0.3 * alea(i, 509)) * pres(x, y) * sil * Pn;
            g.beginPath();
            g.arc(x, y, 1.0 + alea(i, 511) * 1.3, 0, Math.PI * 2);
            g.fill();
          }
          // Au milieu : les flocons doux qui se balancent. La chute s'epaissit quand la manche avance.
          const nMil = Math.round(46 + 34 * av);
          for (let i = 0; i < nMil; i++) {
            const pr = alea(i, 301),
              v = 56 + pr * 80,
              R = 3.5 + pr * 6;
            const y = ((alea(i, 303) * (H + 80) + e.t * v) % (H + 80)) - 40;
            const x =
              alea(i, 305) * W +
              Math.sin(e.t * (0.35 + alea(i, 307) * 0.5) + alea(i, 309) * 6.28) * (26 + 40 * pr) +
              vent * 0.6;
            g.globalAlpha = (0.2 + 0.4 * pr) * pres(x, y) * sil * Pn;
            g.drawImage(fl, x - R, y - R, R * 2, R * 2);
          }
          // Tout pres de l'objectif : quelques gros flocons flous, rapides, a peine la
          for (let i = 0; i < 9; i++) {
            const v = 190 + alea(i, 521) * 90,
              R = 20 + alea(i, 523) * 20;
            const y = ((alea(i, 525) * (H + 200) + e.t * v) % (H + 200)) - 100;
            const x =
              ((alea(i, 527) * W + e.t * (30 + vent * 0.5)) % (W + 120)) -
              60 +
              Math.sin(e.t * 0.7 + i) * 30;
            g.globalAlpha = (0.07 + 0.06 * alea(i, 529)) * pres(x, y) * sil * Pn;
            g.drawImage(fl, x - R, y - R, R * 2, R * 2);
          }
          // Le souffle froid au ras du sol, puis la congere qui monte avec la manche
          const mont = (1 - (0.36 + 0.64 * av)) * 120 + (1 - Pn) * 80;
          // (peints tout a la fin, par-dessus la vignette : la neige prend la lumiere, elle ne s'eteint pas dans le coin sombre)
          plans.push(() => {
            g.save();
            g.globalAlpha = 0.16 * Pn;
            g.drawImage(fl, -200, H - 420 + mont, W + 400, 300);
            g.globalAlpha = Pn;
            g.drawImage(congere(), 0, H - CGH + mont);
            for (let i = 0; i < 6 && !e.reduit; i++) {
              const lw = 260 + 200 * alea(i, 841),
                x = ((alea(i, 843) * (W + lw) + e.t * (70 + 70 * alea(i, 845))) % (W + lw)) - lw;
              const yc = H - CRETES[2](x + lw / 2) + mont,
                vie = 0.5 + 0.5 * Math.sin(e.t * (0.5 + 0.4 * alea(i, 847)) + i * 2);
              g.globalAlpha = 0.3 * vie * Pn;
              g.drawImage(fl, x, yc - 26, lw, 40);
            }
            // la neige scintille : de petites etoiles a quatre branches sur la crete de devant
            g.globalCompositeOperation = 'lighter';
            g.strokeStyle = '#ffffff';
            g.lineWidth = 1.6;
            g.lineCap = 'round';
            for (let i = 0; i < 18; i++) {
              const x = alea(i, 541) * W,
                y = H - CRETES[2](x) + mont + 8 + alea(i, 543) * 60;
              const tw = Math.pow(
                  Math.max(0, Math.sin(e.t * (0.9 + alea(i, 545) * 1.3) + alea(i, 547) * 6.28)),
                  8,
                ),
                L = 3 + 8 * tw;
              if (tw < 0.03 || y > H) continue;
              g.globalAlpha = 0.95 * tw * Pn;
              g.beginPath();
              g.moveTo(x - L, y);
              g.lineTo(x + L, y);
              g.moveTo(x, y - L);
              g.lineTo(x, y + L);
              g.stroke();
              g.drawImage(fl, x - L * 1.4, y - L * 1.4, L * 2.8, L * 2.8);
            }
            g.globalCompositeOperation = 'source-over';
            g.restore();
          });
          // le givre, dans les deux angles du haut seulement : le bas appartient a la congere
          [
            [0, 0],
            [W, 0],
          ].forEach((q) => {
            g.globalAlpha = 0.18 * Pn;
            g.drawImage(fl, q[0] - 420, q[1] - 420, 840, 840);
          });
        }
        // le sol de la saison, au tout premier plan, qui monte avec la manche et qui vit
        Object.keys(SOL_DE).forEach((m) => {
          const P = poids(m);
          if (P > 0.01) plans.push(() => peindreSol(g, e, m, P));
        });
        // ce qui monte et luit : spores d'ete, braises, lucioles
        const monte = (P, n, graine, coul, nom, vit, R0, al, scint) => {
          if (P <= 0.01) return;
          const im = teindre(nom, halo, coul, 64, 64);
          g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < n; i++) {
            const pr = alea(i, graine),
              R = R0 * (0.6 + pr);
            const y =
              H + 40 - ((alea(i, graine + 2) * (H + 80) + e.t * vit * (0.5 + pr)) % (H + 80));
            const x =
              alea(i, graine + 4) * W +
              Math.sin(e.t * 0.4 * (1 + scint) + alea(i, graine + 6) * 6.28) * (40 + 60 * scint);
            const cl = Math.max(
              0,
              Math.sin(e.t * (1.1 + scint * 2 * alea(i, graine + 8)) + i * 1.7),
            );
            g.globalAlpha =
              Math.min(1, (al + al * 2 * pr) * (scint ? cl * cl : 0.6 + 0.4 * cl)) *
              pres(x, y) *
              sil *
              P;
            g.drawImage(im, x - R, y - R, R * 2, R * 2);
          }
          g.globalCompositeOperation = 'source-over';
        };
        monte(poids('ete'), 34, 341, [250, 232, 160], 'spore', 30, 5, 0.12, 0);
        monte(poids('braises'), 46, 441, [255, 140, 60], 'braise', 120, 6, 0.34, 0.5);
        monte(poids('lucioles'), 60, 461, [210, 255, 120], 'luciole', 10, 10, 0.32, 1);
        const Pb = poids('brume');
        if (Pb > 0.01) {
          const br = teindre('brume', halo, [196, 210, 208], 64, 64);
          for (let i = 0; i < 6; i++) {
            const lw = 900 + alea(i, 351) * 500,
              lh = 240 + alea(i, 353) * 200;
            const x = ((alea(i, 355) * (W + lw) + e.t * (10 + alea(i, 357) * 16)) % (W + lw)) - lw;
            const y = H * (0.1 + 0.8 * alea(i, 359)) + Math.sin(e.t * 0.2 + i) * 30;
            g.globalAlpha = (0.13 + 0.07 * alea(i, 361)) * Pb;
            g.drawImage(br, x, y - lh / 2, lw, lh);
          }
        }
        g.restore();
      }
      g.save();
      // les ondes, sur le plateau, la ou le spectateur regarde
      g.lineWidth = 2.6;
      for (let i = 0; i < RMAX; i++) {
        if (rt[i] >= 1) continue;
        const pf = 0.42 + 0.58 * rp[i];
        g.globalAlpha = 0.11 * (1 - rt[i]) * force * pf;
        g.strokeStyle = rgb(coul);
        g.beginPath();
        g.ellipse(rx[i], ry[i], (14 + rt[i] * 76) * pf, (5 + rt[i] * 22) * pf, 0, 0, Math.PI * 2);
        g.stroke();
      }
      // les eclats, courts et vifs
      for (let i = 0; i < EMAX; i++) {
        if (et[i] > 0.45) continue;
        const u = 1 - et[i] / 0.45;
        g.globalAlpha = 0.22 * u * force;
        g.fillStyle = rgb(coul);
        g.beginPath();
        g.arc(ex[i], ey[i], 3 * u + 1, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // les gouttes : la pluie s'ecarte autour de la tete du serpent
      if (!gouttePre) gouttePre = modeleGoutte();
      const gImg = teindre('goutte', gouttePre, coul, 24, 128);
      const tracer = (i0, i1, proche) => {
        const lon = proche ? 40 : 22,
          lar = (lon * 24) / 128;
        for (let i = i0; i < i1; i++) {
          if (proche && gy[i] > gsol[i]) continue;
          const d = Math.hypot(gx[i] - tx, gy[i] - ty);
          if (d < 92) continue;
          const f = d < 224 ? (d - 92) / 132 : 1;
          g.globalAlpha = (proche ? 0.13 : 0.055) * ga[i] * f * force;
          g.drawImage(gImg, gx[i] - vent * 0.05 - lar / 2, gy[i] - lon, lar, lon);
        }
      };
      tracer(0, k.nl, false);
      tracer(NL, NL + k.np, true);
      g.restore();

      if (e.mondeSorte === 'lune' && e.monde > 0) {
        g.save();
        g.globalAlpha = 0.75 * e.monde;
        g.shadowColor = 'rgba(220,230,245,0.8)';
        g.shadowBlur = 30;
        g.fillStyle = '#e6ecf4';
        g.beginPath();
        g.arc(140, 80, 34, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      // le grain, qui tue le banding et donne sa matiere a l'image
      if (!motifGrain) {
        try {
          motifGrain = g.createPattern(tuileGrain(), 'repeat');
        } catch (er) {
          motifGrain = null;
        }
      }
      if (motifGrain) {
        g.save();
        g.globalAlpha = 0.5;
        g.fillStyle = motifGrain;
        g.fillRect(0, 0, W, H);
        g.restore();
      }

      // la vignette suit la tension reelle ; sans tension fournie, elle retombe sur la progression
      const ten = Math.min(1, Math.max(0, e.tension === undefined ? prog : e.tension));
      g.drawImage(peindreVignette(A, ten), 0, 0, W, H);

      // les gouttes collees a l'objectif : elles glissent sur l'image, pas sur la scene
      g.save();
      for (let i = 0; i < (pluieF() > 0.4 ? LMAX : 0); i++) {
        const y = ((ly[i] + e.t * lv[i]) % (H + 160)) - 80,
          x = lx[i] + Math.sin(e.t * 0.5 + lph[i]) * 8,
          r = lr[i];
        const c = mel([226, 242, 248], A.rai, 0.45);
        g.globalAlpha = 0.13;
        const rg2 = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
        rg2.addColorStop(0, rgba(c, 0.85));
        rg2.addColorStop(0.7, rgba(mel(c, [120, 150, 160], 0.6), 0.28));
        rg2.addColorStop(1, rgba(mel(c, [120, 150, 160], 0.6), 0.05));
        g.fillStyle = rg2;
        g.beginPath();
        g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.09;
        g.strokeStyle = rgba(c, 0.9);
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 0.04;
        const tg = g.createLinearGradient(x, y - r * 5, x, y);
        tg.addColorStop(0, rgba(c, 0));
        tg.addColorStop(1, rgba(c, 0.6));
        g.fillStyle = tg;
        g.fillRect(x - r * 0.32, y - r * 5, r * 0.64, r * 5);
      }
      g.restore();
      g.globalAlpha = 1;
      // En 16:9 le premier plan (sol, congere) monterait sur le plateau : on le decoupe autour de l'anneau,
      // il ne pousse que sur les flancs. En 9:16 il passe entierement sous le plateau, rien a decouper.
      // marge de 10 px autour de l'anneau pour que le cadre rouge reste entier, pas seulement l'interieur
      if (W > H) {
        g.save();
        g.beginPath();
        g.rect(0, 0, W, H);
        g.rect(GX0 - 10, GY0 - 10, GX1 - GX0 + 20, GY1 - GY0 + 20);
        g.clip('evenodd');
      }
      plans.forEach((f) => f());
      if (W > H) g.restore();
    },

    maj(dt, e) {
      if (e.reduit) return;
      vent = Math.sin((e.t / 15) * Math.PI * 2) * 40;
      const k = actives(e),
        force = 1 + 0.5 * Math.min(1, Math.max(0, e.progression || 0));
      for (let i = 0; i < N; i++) {
        if ((i < NL && i >= k.nl) || (i >= NL && i >= NL + k.np)) continue;
        const avant = gy[i];
        gy[i] += gv[i] * force * dt;
        gx[i] += vent * dt;
        if (gx[i] < 0) gx[i] += W;
        else if (gx[i] > W) gx[i] -= W;
        // l'impact se fait a la profondeur propre de la goutte, sur le plateau, jamais sur une ligne
        if (i >= NL && avant <= gsol[i] && gy[i] > gsol[i]) {
          const prof = (gsol[i] - GY0) / (GY1 - GY0); // 0 au fond, 1 au premier plan
          for (let r = 0; r < RMAX; r++)
            if (rt[r] >= 1) {
              rx[r] = gx[i];
              ry[r] = gsol[i];
              rt[r] = 0;
              rp[r] = prof;
              break;
            }
          for (let q = 0; q < EMAX; q++)
            if (et[q] > 0.45) {
              const a = -Math.PI / 2 + (alea(i, 93 + tours[i]) - 0.5) * 2;
              ex[q] = gx[i];
              ey[q] = gsol[i];
              evx[q] = Math.cos(a) * (60 + alea(i, 95) * 120) * prof;
              evy[q] = Math.sin(a) * (110 + alea(i, 97) * 140) * prof;
              et[q] = 0;
              break;
            }
          // elle a frappe : elle disparait et repart d'en haut, comme une vraie goutte
          tours[i]++;
          semer(i, true);
          continue;
        }
        if (gy[i] > H + 30) {
          tours[i]++;
          semer(i, true);
        }
      }
      for (let r = 0; r < RMAX; r++) if (rt[r] < 1) rt[r] = Math.min(1, rt[r] + dt / 1.1);
      for (let q = 0; q < EMAX; q++)
        if (et[q] <= 0.45) {
          et[q] += dt;
          ex[q] += evx[q] * dt;
          ey[q] += evy[q] * dt;
          evy[q] += 920 * dt;
        }
    },

    sonFond(ac, sortie, opts) {
      const musique = !!(opts && opts.musiqueExterne),
        base = musique ? 0.25 : 0.55;
      const src = ac.createBufferSource();
      src.buffer = bruitRose(ac, 6);
      src.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 0.6;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const gb = ac.createGain();
      gb.gain.value = 0.9;
      const gl = ac.createGain();
      gl.gain.value = 0.5;
      const lit = ac.createGain();
      lit.gain.value = 0;
      src.connect(bp);
      bp.connect(gb);
      gb.connect(lit);
      src.connect(lp);
      lp.connect(gl);
      gl.connect(lit);
      lit.connect(sortie);
      lit.gain.setTargetAtTime(base, ac.currentTime, 0.8);
      src.start();
      let minuteur = null,
        fini = false;
      const gamme = [392, 440, 493.88, 587.33, 659.25, 783.99];
      function carillon() {
        if (fini) return;
        const t0 = ac.currentTime,
          f = gamme[Math.floor(Math.random() * gamme.length)] * 2;
        const o = ac.createOscillator(),
          gg = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        gg.gain.setValueAtTime(0, t0);
        gg.gain.linearRampToValueAtTime(0.03, t0 + 0.01);
        gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 2.5);
        o.connect(gg);
        gg.connect(sortie);
        o.start(t0);
        o.stop(t0 + 2.6);
        minuteur = setTimeout(carillon, 8000 + Math.random() * 12000);
      }
      if (!musique) minuteur = setTimeout(carillon, 5000);
      return {
        arreter() {
          fini = true;
          if (minuteur) clearTimeout(minuteur);
          lit.gain.setTargetAtTime(0, ac.currentTime, 0.3);
          try {
            src.stop(ac.currentTime + 1.5);
          } catch (e) {}
        },
        silence(sec) {
          const t0 = ac.currentTime;
          lit.gain.cancelScheduledValues(t0);
          lit.gain.setTargetAtTime(base * 0.3, t0, 0.08);
          lit.gain.setTargetAtTime(base, t0 + 0.3, Math.max(0.1, sec / 3));
        },
      };
    },

    sonBouchee(ac, sortie, freq) {
      const t0 = ac.currentTime;
      [
        ['sine', freq, 0.12],
        ['triangle', freq * 2, 0.04],
      ].forEach(([type, f, v]) => {
        const o = ac.createOscillator(),
          gg = ac.createGain();
        o.type = type;
        o.frequency.value = f;
        gg.gain.setValueAtTime(0, t0);
        gg.gain.linearRampToValueAtTime(v, t0 + 0.005);
        gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.35);
        o.connect(gg);
        gg.connect(sortie);
        o.start(t0);
        o.stop(t0 + 0.4);
      });
    },

    // La naissance : de petits craquements secs pendant la fente, puis un accord chaud qui s'ouvre.
    sonEclosion(ac, sortie, phase) {
      const t0 = ac.currentTime;
      if (phase === 'fissure') {
        const o = ac.createOscillator(),
          gg = ac.createGain(),
          f = 1400 + Math.random() * 700;
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * 0.45, t0 + 0.05);
        gg.gain.setValueAtTime(0.045, t0);
        gg.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.09);
        o.connect(gg);
        gg.connect(sortie);
        o.start(t0);
        o.stop(t0 + 0.12);
        return;
      }
      // l'eclosion : une basse qui monte sous un accord de quinte, long et doux
      const grave = ac.createOscillator(),
        gb = ac.createGain();
      grave.type = 'sine';
      grave.frequency.setValueAtTime(98, t0);
      grave.frequency.exponentialRampToValueAtTime(196, t0 + 0.5);
      gb.gain.setValueAtTime(0.0001, t0);
      gb.gain.exponentialRampToValueAtTime(0.11, t0 + 0.06);
      gb.gain.exponentialRampToValueAtTime(0.0004, t0 + 1.1);
      grave.connect(gb);
      gb.connect(sortie);
      grave.start(t0);
      grave.stop(t0 + 1.2);
      [
        [392, 0, 0.075],
        [587.33, 0.06, 0.055],
        [783.99, 0.12, 0.04],
      ].forEach(([f, d, v]) => {
        const o = ac.createOscillator(),
          gg = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        gg.gain.setValueAtTime(0.0001, t0 + d);
        gg.gain.exponentialRampToValueAtTime(v, t0 + d + 0.05);
        gg.gain.exponentialRampToValueAtTime(0.0004, t0 + d + 1.4);
        o.connect(gg);
        gg.connect(sortie);
        o.start(t0 + d);
        o.stop(t0 + d + 1.5);
      });
    },

    sonCadeau(ac, sortie, type) {
      const t0 = ac.currentTime;
      if (type === 'aide') {
        [1174.66, 1760].forEach((f, i) => {
          const o = ac.createOscillator(),
            gg = ac.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          gg.gain.setValueAtTime(0, t0);
          gg.gain.linearRampToValueAtTime(i ? 0.03 : 0.07, t0 + 0.01);
          gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.2);
          o.connect(gg);
          gg.connect(sortie);
          o.start(t0);
          o.stop(t0 + 1.3);
        });
      } else if (type === 'gene') {
        const o = ac.createOscillator(),
          gg = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t0);
        o.frequency.exponentialRampToValueAtTime(62, t0 + 0.35);
        gg.gain.setValueAtTime(0.16, t0);
        gg.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.45);
        o.connect(gg);
        gg.connect(sortie);
        o.start(t0);
        o.stop(t0 + 0.5);
        const n = ac.createBufferSource();
        n.buffer = bruitRose(ac, 0.2);
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        const gn = ac.createGain();
        gn.gain.setValueAtTime(0.12, t0);
        gn.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.18);
        n.connect(f);
        f.connect(gn);
        gn.connect(sortie);
        n.start(t0);
      } else {
        const n = ac.createBufferSource();
        n.buffer = bruitRose(ac, 2.4);
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.7;
        f.frequency.setValueAtTime(400, t0);
        f.frequency.exponentialRampToValueAtTime(1600, t0 + 2);
        const gn = ac.createGain();
        gn.gain.setValueAtTime(0, t0);
        gn.gain.linearRampToValueAtTime(0.18, t0 + 1.8);
        gn.gain.linearRampToValueAtTime(0, t0 + 2.4);
        n.connect(f);
        f.connect(gn);
        gn.connect(sortie);
        n.start(t0);
      }
    },
  });
})();
