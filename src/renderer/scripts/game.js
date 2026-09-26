// Vipere Live, base minimale : un serpent IA qui mange et grandit dans la foret. Rien d'autre.
// Vitesse constante, se toucher tue toujours, aucun texte sur le canvas, aucun son de fond.
(function () {
  'use strict';

  let W = 1080,
    H = 1920;
  const COLS = 16,
    ROWS = 20,
    VITESSE = 7,
    DEPART = 3;
  // Zone sure du LIVE, corrigee par Abdel : un LIVE n'a PAS la colonne de boutons like, partage
  // et commentaire du feed video, donc les cotes sont libres. Ce qui recouvre vraiment : l'overlay
  // du haut (badge LIVE, pseudo, spectateurs) et tout le bas (fil de commentaires a gauche,
  // barre de saisie et bouton cadeau). Un gros cadeau s'anime par dessus tout, on ne peut rien y faire.
  // Zones MESUREES sur une capture d'un vrai live envoyee par Abdel le 2026-09-18, en fraction de
  // la hauteur d'ecran, reportees sur 1080x1920. On ne retient que le chrome TikTok : la cam et le
  // jeu de ce streamer relevaient de SON arrangement, pas de l'interface (consigne d'Abdel).
  // Haut 0-260, fil de commentaires a partir de 1237 : la hauteur sure vaut 977 et non 1130.
  let SR_X = 0,
    SR_Y = 260,
    SR_W = 1080,
    SR_H = 977;
  // Les autres zones du chrome, pour l'overlay de reperes et la maquette.
  const Z_CADEAUX = { x: 702, y: 392, w: 340, h: 343 }; // colonne de widgets cadeaux, a droite
  const Z_BANNIERE = { x: 45, y: 1133, w: 595, h: 98 }; // banniere « untel a offert x15 »
  const Z_FIL = { x: 0, y: 1237, w: 780, h: 478 }; // fil de commentaires
  const Z_SAISIE = { x: 0, y: 1751, w: 1080, h: 98 }; // barre de saisie et boutons
  // Le plateau tient dans la hauteur sure REELLE. 20 lignes de 47 plus l'anneau font 968 px pour
  // 977 disponibles ; a 52 il en fallait 1068 et les 91 px du haut passaient sous la barre de
  // l'hote en live. Les 16x20 cases sont conservees a l'identique, donc aucune regle, aucune
  // trajectoire et aucun equilibrage ne bouge : c'est un changement d'echelle, pas de plateau.
  const CELL = 47;
  let X0 = 164,
    Y0 = 278;
  // Format d'image (Abdel 2026-09-23) : 'vertical' 9:16 (TikTok) ou 'horizontal' 16:9 (YouTube). Le plateau garde
  // sa grille et ses 47 px par case dans les deux formats : seuls son origine et les ancrages du HUD changent.
  // En horizontal, le HUD migre dans les flancs : tout ce qui est Or a gauche, tout ce qui est Ombre a droite.
  const FORMATS = {
    vertical: {
      ox: 0,
      WF: 1080,
      W: 1080,
      H: 1920,
      X0: 164,
      Y0: 278,
      scCy: 1276,
      bdCx: 540,
      bdW: 600,
      bdCy: 154,
      legY: 1372,
      legCxG: 320,
      legCxD: 760,
      defY: 1330,
      defXG: 528,
      defXD: 794,
      finBase: 1206,
      cielBas: 1250,
      cielHaut: 260,
      srY: 260,
      srH: 977,
    },
    // horizontal (Abdel 2026-09-23 : « just want the black space to be filled ») : la composition verticale est
    // dessinee TELLE QUELLE au centre d'un cadre 16:9 (3414 x 1920), seule l'ambiance continue dans les cotes.
    horizontal: {
      ox: 1167,
      WF: 3414,
      W: 1080,
      H: 1920,
      X0: 164,
      Y0: 278,
      scCy: 1276,
      bdCx: 540,
      bdW: 600,
      bdCy: 154,
      legY: 1372,
      legCxG: 320,
      legCxD: 760,
      defY: 1330,
      defXG: 528,
      defXD: 794,
      finBase: 1206,
      cielBas: 1250,
      cielHaut: 260,
      srY: 260,
      srH: 977,
    },
  };
  let L = FORMATS.vertical,
    ajusterCanvas = null,
    OX = 0,
    WF = 1080; // OX : marge gauche du cadre, WF : largeur totale du cadre
  // applique le format demande en regie ; appele au debut de chaque manche (jamais en cours de manche)
  function appliquerFormat() {
    const f = FORMATS[reglages.format] || FORMATS.vertical;
    if (L === f) return;
    L = f;
    OX = f.ox;
    WF = f.WF;
    W = f.W;
    H = f.H;
    X0 = f.X0;
    Y0 = f.Y0;
    SC_CY = f.scCy;
    BD_CX = f.bdCx;
    BD_W = f.bdW;
    BD_CY = f.bdCy;
    CIEL_BAS = f.cielBas;
    CIEL_HAUT = f.cielHaut;
    SR_W = f.W;
    SR_Y = f.srY;
    SR_H = f.srH;
    if (canvas) {
      canvas.style.aspectRatio = WF + '/' + H;
      if (WF > H) {
        canvas.style.width = '100vw';
        canvas.style.height = 'auto';
      } else {
        canvas.style.width = '';
        canvas.style.height = '100vh';
      }
    }
    if (ajusterCanvas) ajusterCanvas();
  }

  let canvas,
    ctx,
    ac = null,
    sortie = null,
    sonActif = true,
    noteIdx = 0;
  // Le navigateur refuse de jouer avant un geste : on arme le son au premier clic ou a la premiere touche.
  function armerSon() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      sortie = ac.createGain();
      sortie.gain.value = 0.6;
      sortie.connect(ac.destination);
      if (ac.state === 'suspended') ac.resume();
    } catch (er) {
      ac = null;
    }
  }
  // Un souffle de bruit filtre : sert au vent de la chute comme a la poussiere du choc.
  function bruitFiltre(dur, gain, f0, f1, q, retard) {
    const t0 = ac.currentTime + (retard || 0),
      n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate),
      d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sortie);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
  // La pierre s'annonce : la terre gronde doucement pendant qu'elle se bombe.
  function sonPoussee() {
    if (!sonActif || !ac) return;
    try {
      // La sub porte la masse sur une vraie enceinte, mais un telephone ne rend rien sous 400 Hz :
      // l'avertissement doit donc vivre dans le grain median, sinon il est muet la ou le jeu se joue.
      bruitFiltre(ALERTE * 0.95, 0.016, 90, 240, 1.6);
      bruitFiltre(ALERTE * 0.95, 0.022, 520, 1400, 0.8); // le grain de terre qui se dechire, audible partout
      [0.14, 0.44, 0.76].forEach((k, i) => {
        // trois craquements secs, de plus en plus haut
        bruitFiltre(0.05, 0.04 + 0.012 * i, 1500 + 500 * i, 800, 1.2, ALERTE * k);
      });
      const t0 = ac.currentTime,
        o = ac.createOscillator(),
        g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(38, t0);
      o.frequency.linearRampToValueAtTime(58, t0 + ALERTE);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + ALERTE * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + ALERTE * 1.15);
      o.connect(g);
      g.connect(sortie);
      o.start(t0);
      o.stop(t0 + ALERTE * 1.2);
    } catch (er) {}
  }
  // Elle se cale : rien ne frappe, la terre se referme autour d'elle.
  function sonPose() {
    if (!sonActif || !ac) return;
    try {
      const t0 = ac.currentTime;
      // Trois couches : le choc qui claque, le corps qui donne la masse au telephone, la sub pour le casque.
      bruitFiltre(0.09, 0.09, 1100, 300, 0.7); // le choc
      const c = ac.createOscillator(),
        gc = ac.createGain();
      c.type = 'triangle';
      c.frequency.setValueAtTime(200, t0);
      c.frequency.exponentialRampToValueAtTime(120, t0 + 0.18);
      gc.gain.setValueAtTime(0.0001, t0);
      gc.gain.linearRampToValueAtTime(0.08, t0 + 0.012);
      gc.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.26);
      c.connect(gc);
      gc.connect(sortie);
      c.start(t0);
      c.stop(t0 + 0.28);
      const o = ac.createOscillator(),
        g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(96, t0);
      o.frequency.exponentialRampToValueAtTime(62, t0 + 0.35);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.055, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.5);
      o.connect(g);
      g.connect(sortie);
      o.start(t0);
      o.stop(t0 + 0.55);
      bruitFiltre(0.4, 0.02, 1200, 300, 0.9, 0.05); // la poussiere qui retombe
    } catch (er) {}
  }

  let ronces = [];
  // La ronce ne gronde pas : elle craque a sec et siffle. Aucune basse, c'est l'inverse de la pierre.
  function sonRonce() {
    if (!sonActif || !ac) return;
    try {
      bruitFiltre(0.55, 0.026, 700, 2600, 1.1);
      [0, 0.12, 0.26].forEach((d, i) => bruitFiltre(0.035, 0.032, 2400 - 300 * i, 1200, 1.6, d));
    } catch (er) {}
  }
  // Un segment de plus : un petit craquement sec, plus haut a chaque fois qu'elle s'allonge.
  function sonRoncePas(i) {
    if (!sonActif || !ac) return;
    try {
      bruitFiltre(0.05, 0.03, 1500 + 340 * i, 900, 1.5);
      bruitFiltre(0.18, 0.014, 900 + 200 * i, 2200, 1.0, 0.02);
    } catch (er) {}
  }

  let halos = [];
  let serpent = [],
    hist = [],
    dir = { x: 1, y: 0 },
    dirProchaine = { x: 1, y: 0 };
  let fruit = null,
    avance = 0,
    grandi = false,
    memoireIA = {},
    trace = [];
  // anneaux qui restent a sortir de la coquille : le corps s'allonge pas apres pas depuis l'oeuf
  let aPousser = 0;
  // Cadeaux des spectateurs : une graine tombe, germe en 1 s, devient une baie mangeable. 3 au plus.
  let graines = [],
    baies = [],
    etincelles = [],
    offertes = 0,
    mangeesOffertes = 0;
  const GERME = 1;
  // Deux camps, un serpent : Sun nourrit, Moon bloque. La manche tranche entre eux.
  let rochers = [],
    manche = null,
    manches = [],
    sansBaie = 0;
  let retouches = 0,
    gardes = 0; // anti-tremblement : redecisions au franchissement, et decisions gardees
  let ordreTick = 0; // duel : alterne quel serpent est resolu en premier a chaque tick (equite)
  // Mode de base : un rodeur. Le chat le nourrit en commentant, il grossit et accelere ;
  // les likes lui arrachent un morceau, les cadeaux l'assomment. Un seul objet, lisible en une seconde.
  let rodeur = null;
  const ROD = { v: 2.6, k: 0.1, fonte: 0.08 },
    ROD_VMAX = 5.8;
  // 1,3 s : sous une seconde la pierre "pop" au lieu de pousser, au-dela de 1,5 s le serpent, a
  // 7 cases par seconde sur un plateau de 16, a deja traverse toute case qu'on pourrait viser.
  const ALERTE = 1.3,
    VIEROCHER = 45;
  // La ronce : le second bloqueur. La pierre est minerale, ponctuelle, sortie d'un coup ; la ronce
  // rampe et ferme une voie entiere. Elle s'annonce plus vite par segment (0,8 s) mais elle met
  // RONCE_PAS*RONCE_MAX a se deployer, et elle vit moins longtemps parce qu'elle prend plus de place.
  const RONCE_ALERTE = 0.8,
    RONCE_PAS = 0.75,
    RONCE_MAX = 4,
    VIERONCE = 20;
  // Quatre paliers d'affluence : le jeu se tient aussi bien salle vide qu'en pleine rue.
  // cadence = evenements par minute, lissee. Chaque palier change le ravitaillement, la cible et les plafonds.
  // cielSun : baies a manger pour que le soleil atteigne le haut. cielMoon : rochers poses pour la lune.
  const PALIERS = [
    {
      id: 'desert',
      min: 0,
      coup: 0.5,
      sauvage: 10,
      cible: 27,
      cielSun: 27,
      cielMoon: 13,
      maxBaies: 3,
      maxRochers: 4,
      parBaie: 1,
      parRocher: 1,
      nature: 26,
      long: 34,
    },
    {
      id: 'calme',
      min: 6,
      coup: 0.34,
      sauvage: 22,
      cible: 48,
      cielSun: 48,
      cielMoon: 14,
      maxBaies: 3,
      maxRochers: 5,
      parBaie: 2,
      parRocher: 1,
      nature: 40,
      long: 52,
    },
    {
      id: 'anime',
      min: 60,
      coup: 0.12,
      sauvage: 0,
      cible: 108,
      cielSun: 108,
      cielMoon: 10,
      maxBaies: 4,
      maxRochers: 4,
      parBaie: 6,
      parRocher: 2,
      nature: 0,
      long: 80,
    },
    {
      id: 'foule',
      min: 250,
      coup: 0.018,
      sauvage: 0,
      cible: 120,
      cielSun: 120,
      cielMoon: 16,
      maxBaies: 5,
      maxRochers: 5,
      parBaie: 20,
      parRocher: 6,
      nature: 0,
      long: 120,
    },
  ];
  // Une mort ne finit plus la manche : elle pousse la lune de quelques crans, le serpent revient.
  const MORT_CRANS = 3;
  // La course decide la manche, pas la longueur : passe ce plafond, la baie donne le cran sans le segment.
  // Dans les deux modes la longueur est plafonnee : elle ne peut pas etre a la fois l'horloge de la
  // manche et le risque de mort, sinon allonger la manche rend la mort inevitable (mesure : 2 min
  // de mediane et 47 % de victoires serpent quand la cible etait une longueur).
  // Mesure du 2026-09-18 : a la fin des manches, la longueur mediane valait 30 sur 30 aux trois
  // paliers actifs. Ce n'etait donc pas la victoire qui arrivait trop tot, c'etait le plafond qui
  // etait la contrainte agissante, et 30 segments sur 320 cases font 9 % du plateau. Abdel : « we
  // need to be able to reach stages were the snake is really long and becomes challenging ».
  // Le plafond suit donc l'affluence : salle vide 34, calme 52, animee 80, foule 120. `reglerLong`
  // le force pour les harnais, auquel cas le palier ne le touche plus.
  let longForce = 0;
  // duel : plafond = LONG_CIBLE_DUEL (l'anneau est plein a 60). Deux serpents a 120 sur 320 cases
  // s'enfermaient eux-memes (sonde : 62 morts/6 manches, toutes piegees ; a 60 : 30)
  const longMax = () => longForce || (duel() ? LONG_CIBLE_DUEL : palier.long || 34); // duel : plafond LONG_CIBLE_DUEL
  let cadence = 0,
    palier = PALIERS[0],
    natureT = 0,
    delaiNature = 0,
    delaiSauvage = 0;
  // Salle vide, les deux camps avancaient sur deux horloges fixes et le vainqueur etait connu d'avance.
  // La foret respire : chaque delai du garde-fou varie de plus ou moins 40 %.
  const souffle = (v) => v * (0.6 + Math.random() * 0.8);

  // Chaque evenement pese sur la cadence, qui redescend toute seule en une minute
  function compter(n) {
    cadence += n;
  }
  function majPalier(dt) {
    cadence = Math.max(0, cadence - (cadence * dt) / 60);
    const c = cadence;
    let p = PALIERS[0];
    for (let i = 0; i < PALIERS.length; i++) if (c >= PALIERS[i].min) p = PALIERS[i];
    palier = p;
  }
  // Une erreur de rendu avalee en silence a casse le jeu sans que rien ne le dise : on garde le message.
  let derniereErreur = null;
  const premiereLigne = (er) =>
    ((er && er.stack ? er.stack : '').split(String.fromCharCode(10))[1] || '').trim();
  let t = 0,
    pause = 0,
    bouchees = 0,
    poses = 0,
    morsures = 0,
    morts = 0,
    erreurs = 0,
    virages = 0,
    escaliers = 0,
    evitables = 0,
    longueursMort = [],
    dirs = [];
  // Deux modes. 'base' : le serpent contre les spectateurs, ils aident ou ils genent, pas de camps.
  // 'versus' : deux camps, Sun et Moon, et la course dans le ciel tranche.
  // plafonds : faux par defaut, donc on pose autant de pierres, de ronces et de baies qu'on veut,
  // jusqu'a remplir le plateau. Vrai remet les plafonds du palier, seul etat dans lequel les
  // harnais d'equilibrage mesurent quelque chose de comparable.
  const reglages = {
    ia: true,
    maquette: false,
    temps: 1,
    imprudence: 0,
    zones: false,
    duree: 240,
    dureeDuel: 120,
    sauvage: 1,
    mode: 'base',
    cycle: 480,
    heure: 0.06,
    plafonds: false,
    // avantage (super admin, regie) : -100 favorise Ombre, 0 neutre, +100 favorise Or.
    // Invisible a l'ecran : il ne touche que la qualite de jeu de l'IA. Remis a 0 a chaque manche.
    avantage: 0,
    // underdog (super admin) : le serpent le plus court reçoit en douce +audace et +portées. Aucun affichage.
    underdog: false,
    // plateforme (regie) : 'tiktok' affiche la legende des cadeaux et les colonnes de statuts qu'ils
    // alimentent ; 'neutre' (YouTube, test de gameplay) les cache. Le jeu, lui, ne change pas.
    plateforme: 'tiktok',
    // retourCadeau (regie) : prototype a valider par Abdel DANS le jeu, sur la vraie legende du bas.
    // 'aucun', 'G1' ligne illuminee + donateur + trait qui se vide, 'G2' anneau autour de l'image,
    // 'G3' pastille compteur, 'G4' bandeau donateur au-dessus de la colonne.
    retourCadeau: 'G1',
    // affichageCadeaux (regie) : forme de la legende. 'complet' = deux colonnes verticales avec prix + effet
    // (tests hors live). 'aucun' = rien du tout. 'defile' = bandeaux qui glissent, icones animees, EFFET
    // en toutes lettres SANS prix ni verbe d'envoi (live-safe : la regle du 25/07 vise le prix et l'appel a
    // l'action, pas la reaction a un cadeau). Le retour a l'arrivee d'un cadeau reste porte par le bandeau P1.
    affichageCadeaux: 'defile',
    // pattern d'apparition du mode 'defile' (reglable en regie, teste en direct) : secondes visibles puis
    // secondes cachees, en boucle. defileCache=0 => toujours visible (tests hors live seulement).
    defileVisi: 8,
    defileCache: 12,
    // nomsDonateurs (regie) : affiche ou non le pseudo du spectateur sur la ligne du cadeau (G1) et le bandeau (G4).
    nomsDonateurs: true,
    // bandeau (regie) : prototype du bandeau d'activite en haut-centre (arrivees, cadeaux, likes, partages),
    // porte par un mini serpent au rendu reel. 'aucun', 'P1' orbite, 'P2' porteur, 'P3' mascotte. A valider par Abdel.
    // meteo de la foret (regie) : 'pluie' d'origine, 'neige', 'automne', 'ete', 'orage', 'etoiles', 'brume'.
    // ambianceAuto : a chaque manche, une heure et une meteo tirees au sort. Prototype, a valider par Abdel.
    meteo: 'pluie',
    ambianceAuto: true,
    // format (regie) : 'vertical' 9:16 TikTok ou 'horizontal' 16:9 YouTube, applique a la prochaine manche.
    format: 'vertical',
    bandeau: 'P1',
    // classement (regie) : prototype du classement des donateurs de la manche, sur l'ecran de fin.
    // 'aucun', 'C1' podium, 'C2' deux colonnes par camp, 'C3' MVP ; mises en avant du MVP : 'M1' couronne et
    // rayons, 'M2' couronne et serpent qui tourne autour, 'M3' podium a trois marches. A valider par Abdel.
    classement: 'C3',
    // fluide (regie) : coupe tous les halos flous (shadowBlur) du canevas de jeu. Mesure dans le moteur de
    // l'exe, plateau charge : 28 images par seconde avec les flous, 45 sans. Change l'aspect : a juger a l'ecran.
    fluide: false,
    // superIA (super admin) : true = les deux camps jouent avec ia-super.js (recherche adverse).
    // 'or' ou 'ombre' = un seul camp (tournois des harnais). Suspendue pendant une scene.
    superIA: false,
    // debugIA (super admin, regie) : calque des decisions de l'IA sur le plateau. Coupe par defaut ;
    // coupe, l'IA ne remplit rien et le calque n'est pas dessine (zero effet sur le jeu).
    debugIA: false,
  };
  const duel = () => reglages.mode === 'duel';

  const px = (gx, gy) => ({ x: X0 + gx * CELL + CELL / 2, y: Y0 + gy * CELL + CELL / 2 });
  const amb = () => (window.AMBIANCES || []).find((a) => a.id === 'foret') || null;

  function libres() {
    const occ = new Set(serpent.map((s) => s.x + ',' + s.y));
    if (duel()) {
      const a = autre();
      if (a) a.serpent.forEach((s) => occ.add(s.x + ',' + s.y));
    }
    graines.concat(baies, rochers).forEach((o) => occ.add(o.x + ',' + o.y));
    ronces.forEach((R) => R.seg.forEach((g) => occ.add(g.x + ',' + g.y)));
    const l = [];
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) if (!occ.has(x + ',' + y)) l.push({ x, y });
    return l;
  }

  let creditSun = 0,
    creditMoon = 0;
  // Economie calquee sur un vrai live : la rose est le cadeau dominant et joue CONTRE le serpent,
  // Le like, le commentaire et le partage sont sans effet (Abdel, 2026-09-19 : la poussee par likes est retiree).
  // La seule poussee de vitesse est le cadeau tempo (SURGE_FACT pendant TEMPO_DUR).
  const SURGE_FACT = 1.2; // Abdel, 2026-09-19 : « the actual speed boost value, tone it down a little » (etait 1,5)
  // ancien commentaire :  // le serpent va 50 % plus vite pendant la poussee
  const FORET_DUEL = 8; // duel : secondes (x0.6 a 1.4) entre deux baies vertes neutres quand le plateau est vide, ralenti par l'affluence
  const TEMPO_COUT = 10,
    TEMPO_DUR = 10; // don 10-29 coins : 10 s de poussee de tempo payee (x1.5), au-dela du plafond des likes
  const COUPE_COUT = 20,
    COUPE_FRAC = 0.15; // coupe duel (Abdel : « cut at 15% for 30 ») : don >= 30 enleve 15 % de la longueur adverse, 1 anneau minimum
  const coupeDe = (L) => Math.max(1, Math.round(L * COUPE_FRAC));
  const BOUCLIER_COUT = 30,
    VIE_COUT = 100,
    BOUCLIER_DUR = 15; // dons duel : bouclier a 50 = 15 s d'immunite, cumulables sans plafond, vie a 100, sans plafond (Abdel : « no cap »)
  let TENUE_DUEL = 5; // secondes a tenir l'anneau plein pour gagner (reglerTenue pour le bench)
  const LONG_CIBLE_DUEL = 40; // longueur cible pour l'anneau duel (TEST equilibre 2026-09-18 : 60 -> 40, revert si ca ne marche pas)
  const SURSIS_DUEL = 5; // sous cette longueur, le demi-anneau vire au rouge : moment 'vie'
  const DEPART_DUEL = 5,
    MIN_JEUNE = 2; // duel : naissance a 5 anneaux ; un serpent jeune peut etre coupe jusqu'a 1 anneau, jamais tue (Abdel)
  const ADULTE_DUEL = 10; // un serpent qui n'a jamais atteint 10 anneaux est 'jeune' : une coupe ne le descend jamais sous 3 et il n'est pas en sursis (pas de piege au depart)
  // compteurs de moments de depense (proxy de profit) : tenues entamees, sursis entames, parades
  let moments = { tenues: 0, sursis: 0, parades: 0, manches: 0 };
  let baieCount = 0; // compteur de baies mangees pour la croissance decouplee (mode base)

  // eclaterAnneaux : convertit des segments en baies actives (coupe duel ou mort duel).
  // Appeler sous charger(i) : zoneMorte utilise le bon contexte de tete (duel verifie les deux).
  // camp : les anneaux laches gardent la couleur du serpent qui les a perdus (Abdel : « the food
  // dropped need to be the same color as the snake who dropped it »). Sans camp, baie verte normale.
  function eclaterAnneaux(segs, camp) {
    segs.forEach((s) => {
      if (zoneMorte(s, 0)) return;
      const p = px(s.x, s.y);
      eclat(
        p.x,
        p.y,
        4,
        camp === 'or' ? 'offerte-or' : camp === 'ombre' ? 'offerte-ombre' : 'rodeur',
      );
      baies.push({ x: s.x, y: s.y, pseudo: '', t: 0, sauvage: false, camp: camp || null });
    });
  }

  // semerPour(i, pseudo) : seme une baie dans la moitie du plateau proche de la tete de corps i.
  // Doit etre appele pendant le traitement d'un evenement duel ; charger(0) apres la boucle.
  function semerPour(i, pseudo) {
    const tiI = corps[i] && corps[i].serpent[0];
    const tiAdv = corps[1 - i] && corps[1 - i].serpent[0];
    if (!tiI) return 0;
    charger(i);
    let l = libres().filter((c) => !zoneMorte(c, GERME));
    if (tiAdv) {
      const pref = l.filter(
        (c) =>
          Math.abs(c.x - tiI.x) + Math.abs(c.y - tiI.y) <
          Math.abs(c.x - tiAdv.x) + Math.abs(c.y - tiAdv.y),
      );
      if (pref.length) l = pref;
    }
    if (!l.length) l = libres();
    if (!l.length) {
      ranger();
      return 0;
    }
    // Fiable (Abdel, reco validee) : la baie tombe PRES de la tete du camp, pas n'importe ou dans sa moitie.
    // Cases triees par distance a la tete (hors zone morte, donc jamais franchies avant d'etre actives),
    // tirage parmi les 4 plus proches. Un spam de 15 roses forme une grappe autour de la tete, mangee
    // dans les secondes qui suivent ; les cases se remplissent de proche en proche.
    // Devant lui, jamais derriere (Abdel) : on garde les cases dont le produit scalaire avec sa direction
    // est positif (devant ou de cote-devant) ; repli sur toutes si aucune.
    const dI = corps[i].dir || { x: 1, y: 0 };
    const devant = l.filter((c) => (c.x - tiI.x) * dI.x + (c.y - tiI.y) * dI.y > 0);
    if (devant.length) l = devant;
    l.sort(
      (p, q) =>
        Math.abs(p.x - tiI.x) +
        Math.abs(p.y - tiI.y) -
        (Math.abs(q.x - tiI.x) + Math.abs(q.y - tiI.y)),
    );
    const c = l[Math.floor(Math.random() * Math.min(4, l.length))];
    graines.push({
      x: c.x,
      y: c.y,
      pseudo: pseudo || '',
      t: 0,
      camp: corps[i].camp,
      pour: corps[i].camp,
    }); // teinte du camp, et RESERVEE a ce camp (Abdel : pas de vol de rose)
    offertes++;
    ranger();
    return 1;
  }

  // couperDuel(adverseIdx, k) : coupe k anneaux de la queue du corps adverse, les eclate en baies.
  // Retourne le nombre d'anneaux effectivement coupes. Finit avec ranger() mais PAS charger(0).
  function couperDuel(adverseIdx, k, voleurIdx) {
    charger(adverseIdx);
    if (!serpent.length) {
      ranger();
      return 0;
    }
    if (corps[adverseIdx].bouclierT > 0) {
      // le bouclier pare la coupe entiere tant qu'il est actif ; le rail et la tete le montrent
      corps[adverseIdx].pareT = 0.9;
      moments.parades++;
      sauve(adverseIdx, 'bouclier');
      // TEST equilibre : la coupe paree est RENDUE au serpent protege, il grandit de ce qu'elle aurait coupe
      const gain = Math.max(1, Math.round(serpent.length * COUPE_FRAC));
      aPousser += gain;
      const tp = px(serpent[0].x, serpent[0].y);
      eclat(tp.x, tp.y, 20, 'coquille');
      ranger();
      return 0;
    }
    let nb = Math.min(k, Math.max(0, serpent.length - 1));
    if (nb <= 0) {
      ranger();
      return 0;
    }
    if (serpent.length - nb < 3 && !corps[adverseIdx].adulte) {
      // serpent jeune (jamais 10 anneaux) : la coupe descend jusqu'a MIN_JEUNE, on ne tue pas un serpent au berceau
      nb = Math.max(0, serpent.length - MIN_JEUNE);
      if (nb <= 0) {
        ranger();
        return 0;
      }
    }
    if (serpent.length - nb < 3 && corps[adverseIdx].vies > 0) {
      // une vie encaisse la mort : la coupe s'arrete a 3 anneaux
      corps[adverseIdx].vies--;
      corps[adverseIdx].pareT = 0.9;
      sauve(adverseIdx, 'vie');
      nb = Math.max(0, serpent.length - 3);
      if (nb <= 0) {
        ranger();
        return 0;
      }
    }
    corps[adverseIdx].anneauHaut = serpent.length / LONG_CIBLE_DUEL;
    corps[adverseIdx].reculT = 0.9;
    corps[adverseIdx].coupT = 0.9;
    const segs = serpent.slice(-nb);
    serpent = serpent.slice(0, serpent.length - nb);
    hist = hist.slice(0, Math.max(1, serpent.length + 3));
    if (segs.length) {
      const p = px(segs[0].x, segs[0].y);
      eclat(p.x, p.y, 16, 'rodeur');
    }
    if (voleurIdx !== undefined && corps[voleurIdx]) {
      // VOL (Abdel : « steal 15% ») : les anneaux ne tombent pas en baies, ils passent directement au serpent du camp
      corps[voleurIdx].aPousser = (corps[voleurIdx].aPousser || 0) + segs.length;
      segs.forEach((sg) => {
        const p = px(sg.x, sg.y);
        eclat(p.x, p.y, 3, corps[voleurIdx].camp === 'or' ? 'offerte-or' : 'offerte-ombre');
      });
    } else eclaterAnneaux(segs, corps[adverseIdx].camp);
    if (serpent.length < 3 && corps[adverseIdx].adulte) {
      serpent = [];
      // adverseIdx a perdu : le camp oppose gagne
      const gagnant = corps[adverseIdx].camp === 'ombre' ? 'or' : 'ombre';
      ranger();
      finir(gagnant, 'place');
      return nb;
    }
    ranger();
    demanderIA();
    return nb;
  }

  // Un geste qui ne pose rien se voit quand meme : une baie deja la se ranime
  function pulser() {
    const b = baies[Math.floor(Math.random() * baies.length)];
    if (b) {
      const p = px(b.x, b.y);
      eclat(p.x, p.y, 5, 'offerte');
      b.t = 0;
    }
  }

  // Une graine tombe devant le serpent, assez pres pour qu'il aille la chercher tout de suite
  function semer(pseudo) {
    if (!serpent.length) return false;
    // plateau plein : le like nourrit une baie deja posee, il se voit toujours
    if (reglages.plafonds && graines.length + baies.length >= palier.maxBaies) {
      pulser();
      return false;
    }
    // La regle vaut aussi pour ce qui aide : une graine semee sous ses pattes est germee trop
    // tard, il l'a deja franchie, et le like du spectateur n'a rien produit de visible.
    const h = serpent[0],
      loin = Math.ceil(VITESSE * (GERME + 0.25)) + 2;
    const vise = { x: h.x + dir.x * loin, y: h.y + dir.y * loin };
    let l = libres().filter((c) => !zoneMorte(c, GERME));
    if (!l.length) l = libres();
    if (!l.length) return false;
    l.sort(
      (a, b) =>
        Math.abs(a.x - vise.x) +
        Math.abs(a.y - vise.y) -
        (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
    );
    const c = l[Math.floor(Math.random() * Math.min(5, l.length))];
    graines.push({ x: c.x, y: c.y, pseudo: pseudo || '', t: 0 });
    offertes++;
    return true;
  }

  // Moon : la pierre pousse devant le serpent, mais jamais sous ses pattes. A VITESSE cases par
  // seconde, il franchit ALERTE*VITESSE cases pendant la sortie : toute case plus proche que ca,
  // dans son couloir, serait traversee avant que la pierre existe, et l'animation ne servirait a
  // rien. On la place donc largement devant, ou sur le flanc, et jamais dans cette zone morte.
  const PORTEE = () => VITESSE * (ALERTE + 0.25); // ce que le serpent avale pendant la pousse, avec marge
  // REGLE, valable pour TOUT ce qui bloque, pierre comme ronce, ancrage comme croissance :
  // on ne pose jamais rien devant le serpent s'il aura traverse la case avant que ca devienne
  // actif. Sinon l'objet apparait sous lui pour rien, l'animation ne sert a rien, et le joueur
  // comme le spectateur ne comprennent pas ce qu'ils voient.
  function zoneMorte(c, delai) {
    if (!serpent.length) return false;
    const h = serpent[0],
      dx = c.x - h.x,
      dy = c.y - h.y;
    const devant = dx * dir.x + dy * dir.y,
      cote = Math.abs(dx * dir.y - dy * dir.x);
    if (devant > 0 && cote <= 1 && devant <= VITESSE * (delai + 0.25)) return true;
    if (duel()) {
      const a = autre();
      if (a && a.serpent.length) {
        const h2 = a.serpent[0],
          dx2 = c.x - h2.x,
          dy2 = c.y - h2.y;
        const dev2 = dx2 * a.dir.x + dy2 * a.dir.y,
          cot2 = Math.abs(dx2 * a.dir.y - dy2 * a.dir.x);
        if (dev2 > 0 && cot2 <= 1 && dev2 <= VITESSE * (delai + 0.25)) return true;
      }
    }
    return false;
  }
  function bloquer(pseudo) {
    if (!serpent.length) return false;
    if (reglages.plafonds && rochers.length >= palier.maxRochers) return false;
    const h = serpent[0],
      portee = PORTEE();
    const couloir = (c) => zoneMorte(c, ALERTE);
    const flanc = (c) => {
      const dx = c.x - h.x,
        dy = c.y - h.y;
      return Math.abs(dx * dir.y - dy * dir.x) >= 2 && Math.abs(dx) + Math.abs(dy) >= 3;
    };
    const tout = libres().filter((c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 2);
    if (!tout.length) return false;
    // d'abord loin devant, sur sa route : elle sera sortie quand il arrivera
    const loin = Math.ceil(portee) + 2,
      vise = { x: h.x + dir.x * loin, y: h.y + dir.y * loin };
    let l = tout.filter((c) => !couloir(c) && (c.x - h.x) * dir.x + (c.y - h.y) * dir.y > 0);
    // rien de valable devant : elle ferme une ligne de fuite sur le cote
    if (!l.length) l = tout.filter((c) => flanc(c));
    if (!l.length) l = tout.filter((c) => !couloir(c));
    if (!l.length) return false;
    l.sort(
      (a, b) =>
        Math.abs(a.x - vise.x) +
        Math.abs(a.y - vise.y) -
        (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
    );
    const c = l[Math.floor(Math.random() * Math.min(4, l.length))];
    rochers.push({ x: c.x, y: c.y, pseudo: pseudo || '', t: 0 });
    sonPoussee();
    poses++;
    monter('moon', 1);
    return true;
  }

  // Les cases mortes de la ronce, celles qui tuent deja.
  function roncesDures(k) {
    const l = [];
    ronces.forEach((R) =>
      R.seg.forEach((g) => {
        if (g.t >= RONCE_ALERTE * (k || 1)) l.push(g);
      }),
    );
    return l;
  }
  const maxRonces = () => Math.max(1, Math.round(palier.maxRochers / 2));
  // Elle prend racine hors de la zone morte, comme la pierre, mais elle pousse ensuite en travers
  // de la course du serpent : c'est une voie qu'elle ferme, pas une case.
  function planterRonce(pseudo) {
    if (!serpent.length) return false;
    if (reglages.plafonds && ronces.length >= maxRonces()) return false;
    const h = serpent[0],
      portee = PORTEE();
    const couloir = (c) => zoneMorte(c, RONCE_ALERTE);
    const tout = libres().filter(
      (c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 3 && !couloir(c),
    );
    if (!tout.length) return false;
    // elle s'ancre a l'entree de la voie qu'il allait prendre, un peu de biais
    const loin = Math.ceil(portee) + 2;
    const vise = { x: h.x + dir.x * loin + dir.y * 2, y: h.y + dir.y * loin + dir.x * 2 };
    tout.sort(
      (a, b) =>
        Math.abs(a.x - vise.x) +
        Math.abs(a.y - vise.y) -
        (Math.abs(b.x - vise.x) + Math.abs(b.y - vise.y)),
    );
    const c = tout[Math.floor(Math.random() * Math.min(4, tout.length))];
    // elle rampe en travers : perpendiculaire a la course, vers le large du plateau
    let ax = { x: Math.abs(dir.y), y: Math.abs(dir.x) };
    if (!ax.x && !ax.y) ax = { x: 1, y: 0 };
    const versPlus = ax.x ? (c.x < COLS / 2 ? 1 : -1) : c.y < ROWS / 2 ? 1 : -1;
    ronces.push({
      seg: [{ x: c.x, y: c.y, t: 0 }],
      ax,
      sens: versPlus,
      t: 0,
      pas: 0,
      pseudo: pseudo || '',
    });
    sonRonce();
    monter('moon', 1);
    return true;
  }
  // Elle s'allonge d'une case a la fois, et se retourne si le large lui est ferme.
  function allongerRonce(R) {
    const occ = new Set(serpent.map((g) => g.x + ',' + g.y));
    rochers.forEach((r) => occ.add(r.x + ',' + r.y));
    ronces.forEach((o) => o.seg.forEach((g) => occ.add(g.x + ',' + g.y)));
    for (const sens of [R.sens, -R.sens]) {
      const bout = sens === R.sens ? R.seg[R.seg.length - 1] : R.seg[0];
      const n = { x: bout.x + R.ax.x * sens, y: bout.y + R.ax.y * sens, t: 0 };
      if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || occ.has(n.x + ',' + n.y)) continue;
      if (zoneMorte(n, RONCE_ALERTE)) continue; // elle ne repousse pas sous ses pattes non plus
      if (sens === R.sens) R.seg.push(n);
      else R.seg.unshift(n);
      R.sens = sens;
      sonRoncePas(R.seg.length - 1);
      demanderIA();
      return true;
    }
    return false;
  }

  function rodeurVitesse() {
    return Math.min(ROD_VMAX, ROD.v + ROD.k * (rodeur ? rodeur.faim : 0));
  }

  // opt regle la force d'un eclat : vitesse, poussee vers le haut, pesanteur, taille, opacite.
  function eclat(x, y, n, teinte, opt) {
    const o = opt || {},
      v0 = o.v0 !== undefined ? o.v0 : 60,
      v1 = o.v1 !== undefined ? o.v1 : 240;
    const haut = o.haut !== undefined ? o.haut : 40,
      g = o.g !== undefined ? o.g : 520;
    const r = o.r !== undefined ? o.r : 1,
      a0 = o.a !== undefined ? o.a : 1,
      d = o.duree !== undefined ? o.duree : 0.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        v = v0 + Math.random() * (v1 - v0);
      etincelles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - haut,
        t: 0,
        duree: d + Math.random() * 0.4 * d,
        teinte,
        r,
        g,
        a: a0,
        k: o.frein || 0,
      });
    }
  }

  // Entree unique des evenements du live (un connecteur TikTok appellera la meme fonction)
  window.recevoirEvenement = function (ev) {
    const e = ev || {},
      n = Math.max(1, Math.min(parseInt(e.n) || 1, 20));
    // Mode de base : aider et gener sont tous deux gratuits et ouverts a tous.
    // Un geste, un effet, jamais deux : le like seme une baie, le commentaire fait pousser une
    // pierre, le partage plante une ronce, le cadeau seme large. Aucun geste ne melange bonus et malus.
    // Mode de base : un seul objet recoit tous les gestes, le rodeur. Aucun geste n'est avale
    // par un seuil ni par un plafond : le like l'entame, le commentaire le nourrit, le cadeau l'assomme.
    if (duel()) {
      if (e.type === 'spectateurs') {
        const tot = parseInt(e.total) || 0;
        let haut = 0;
        for (const pl of PALIERS_VUE) {
          if (tot >= pl && !paliersVus[pl]) {
            paliersVus[pl] = 1;
            haut = pl;
          }
        }
        if (haut) annoncer({ genre: 'palier', pseudo: '', texte: dire('palier', { n: haut }) });
        return 0;
      }
      if (e.type === 'arrivee' || e.type === 'partage' || e.type === 'abonne') {
        annoncer({
          genre: e.type,
          pseudo: String(e.pseudo || ''),
          avatar: e.avatar,
          texte: dire(e.type),
        });
        return 0;
      }
      if (e.type === 'like' && e.pseudo) {
        const lp = String(e.pseudo);
        likesPar[lp] = (likesPar[lp] || 0) + n;
        if (likesPar[lp] >= 10) {
          annoncer({
            genre: 'like',
            pseudo: lp,
            avatar: e.avatar,
            texte: dire('like', { n: likesPar[lp] }),
          });
          likesPar[lp] = 0;
        }
      }
      // Camp : explicite (regie), sinon par le NOM du cadeau TikTok (Abdel : « red 1 coin rose gives one
      // point to Or, white 1 coin gives 1 point to the other ») : 'rose' -> Or, tout autre cadeau -> Ombre.
      // Sans camp ni nom : tirage au sort (public simule).
      const nom = String(e.nom || e.cadeau || e.gift || '').toLowerCase();
      // Rose rouge ('rose') -> Or ; rose blanche (TikTok la nomme 'Rosa', ou 'rose blanche'/'white rose') -> Ombre.
      // A 10 coins (Abdel) : une rose a 10 -> tempo Or, le 'Dyno' a 10 -> tempo Ombre : tout nom contenant 'rose' -> Or.
      const v = e.valeur || 0;
      // Cadeaux du camp Or par nom : rose (10), donut (30) ; tout le reste (Dyno, Capybara...) est Ombre.
      const roseRouge =
        v >= TEMPO_COUT
          ? /rose|bouquet|bagel|donut|doughnut|teddy|bear/.test(nom)
          : /^rose( rouge| red)?$/.test(nom.trim());
      const i =
        e.camp === 'ombre'
          ? 1
          : e.camp === 'or'
            ? 0
            : nom
              ? roseRouge
                ? 0
                : 1
              : Math.random() < 0.5
                ? 0
                : 1;
      compter(e.type === 'cadeau' ? n * 3 : n);
      // Le like ne donne plus de poussee de vitesse en duel (Abdel, 2026-09-19 : « this is not a feature
      // anymore, remove it »). Il compte toujours pour l'affluence (compter, plus haut), rien d'autre.
      if (e.type === 'like') return 0;
      if (e.type === 'cadeau') {
        noterCadeau(i, e.valeur || 0, e.pseudo, n, e.avatar);
        if ((e.valeur || 0) >= VIE_COUT) {
          // vie : quand une coupe devrait tuer le serpent, elle le laisse a 3 anneaux
          const av = corps[i].vies;
          corps[i].vies += n;
          corps[i].viePar = String(e.pseudo || '');
          corps[i].vieAvatar = e.avatar;
          charger(i);
          if (serpent.length) {
            const tp = px(serpent[0].x, serpent[0].y);
            eclat(tp.x, tp.y, 18, 'rodeur');
          }
          ranger();
          charger(0); // vie : eclat rouge, comme le coeur
          return corps[i].vies - av;
        }
        if ((e.valeur || 0) >= BOUCLIER_COUT) {
          // bouclier : BOUCLIER_DUR secondes d'immunite aux coupes et aux collisions (Abdel : actif 15 s)
          corps[i].bouclierT += BOUCLIER_DUR * n;
          corps[i].bouclierPar = String(e.pseudo || '');
          corps[i].bouclierAvatar = e.avatar;
          charger(i);
          if (serpent.length) {
            const tp = px(serpent[0].x, serpent[0].y);
            eclat(tp.x, tp.y, 18, 'coquille');
          }
          ranger();
          charger(0);
          return n;
        }
        if ((e.valeur || 0) >= TEMPO_COUT && (e.valeur || 0) < COUPE_COUT) {
          // tempo paye : TEMPO_DUR secondes de poussee sur SON serpent, cumulable (Abdel : le cadeau a 10 coins)
          corps[i].surgeT += TEMPO_DUR * n;
          charger(i);
          if (serpent.length) {
            const tp = px(serpent[0].x, serpent[0].y);
            eclat(tp.x, tp.y, 16, 'coquille');
          }
          ranger();
          charger(0);
          return n;
        }
        if ((e.valeur || 0) >= COUPE_COUT) {
          // coupe : 15 % de la longueur adverse, n fois
          let total = 0;
          for (let q = 0; q < n; q++) {
            if (!(manche && manche.etat === 'en cours')) break;
            total += couperDuel(1 - i, coupeDe(corps[1 - i].serpent.length), i);
          }
          charger(0);
          return total;
        }
        // bon marche : semer n baies pour le camp i
        let pose = 0;
        for (let q = 0; q < n; q++) pose += semerPour(i, e.pseudo);
        charger(0);
        return pose;
      }
      // commentaire/partage : cadence seulement
      return 0;
    }
    if (e.type === 'like') {
      compter(n);
      if (manche) manche.sun += n;
      creditSun += n;
      let pose = 0;
      while (creditSun >= palier.parBaie) {
        creditSun -= palier.parBaie;
        if (semer(e.pseudo)) pose++;
        else break;
      }
      if (!pose) pulser(e.pseudo);
      return pose;
    }
    if (e.type === 'cadeau') {
      compter(n * 3);
      if (manche) manche.moonEv += n;
      creditMoon += n;
      let pose = 0;
      while (creditMoon >= palier.parRocher) {
        creditMoon -= palier.parRocher;
        if (bloquer(e.pseudo)) pose++;
        else break;
      }
      return pose;
    }
    return 0;
  };

  // La course dans le ciel : un soleil a gauche, une lune a droite, tous deux bas au depart.
  // Chaque baie mangee monte le soleil d'un cran, chaque rocher pose monte la lune d'un cran.
  // Le premier en haut termine la manche. Le serpent est la balle, pas le joueur.
  function nouvelleManche() {
    appliquerFormat();
    reglages.avantage = 0; // le coup de pouce est un geste ponctuel, jamais un reglage qui traine
    retourCadeaux = [[], []];
    bandeauCadeau = [null, null];
    donsManche = {};
    if (reglages.ambianceAuto && duel()) {
      const ms = [
        'pluie',
        'neige',
        'automne',
        'ete',
        'printemps',
        'orage',
        'etoiles',
        'aurore',
        'lucioles',
        'braises',
        'brume',
      ].filter((m) => m !== reglages.meteo);
      reglages.meteo = ms[Math.floor(Math.random() * ms.length)];
      reglages.heure = ['etoiles', 'aurore', 'lucioles'].includes(reglages.meteo)
        ? 0.02
        : reglages.meteo === 'braises'
          ? 0.78
          : reglages.meteo === 'printemps'
            ? 0.36
            : [0.02, 0.22, 0.36, 0.5, 0.64, 0.78][Math.floor(Math.random() * 6)];
    }
    finirScene(); // la scène ne survit pas à la manche ; l'underdog, oui (interrupteur explicite)
    manche = {
      t: 0,
      etat: 'en cours',
      sun: 0,
      moon: 0,
      moonEv: 0,
      vainqueur: null,
      fin: 0,
      cielSun: 0,
      cielMoon: 0,
      hautSun: palier.cielSun,
      hautMoon: palier.cielMoon,
      pulseSun: 9,
      pulseMoon: 9,
      cible: palier.cible,
      recolte: 0,
    };
    baieCount = 0;
    creditSun = 0;
    creditMoon = 0;
    rochers = [];
    ronces = [];
    sansBaie = 0;
    if (duel()) {
      corps = [
        nouveauCorps('or', OR, COLS / 2 - 1, Math.floor(ROWS / 2), { x: -1, y: 0 }),
        nouveauCorps('ombre', OMBRE, COLS / 2, Math.floor(ROWS / 2), { x: 1, y: 0 }),
      ];
    } else {
      corps = [nouveauCorps('or', OR)];
    }
    for (let i = 0; i < corps.length; i++) {
      charger(i);
      naitre(false, corps[i].x0, corps[i].y0, corps[i].dir0);
      ranger();
    }
    charger(0);
  }

  // L'affluence monte : le ciel s'allonge, jamais ne se raccourcit, et l'astre garde sa hauteur a l'ecran.
  // Sans cela une ruee ferait redescendre le soleil, et plus personne ne comprendrait la course.
  function etirer(camp, vise, pas) {
    const kh = 'haut' + camp,
      kc = 'ciel' + camp,
      h = manche[kh];
    if (vise <= h) return;
    const nh = Math.min(vise, h + pas);
    manche[kc] *= nh / h;
    manche[kh] = nh;
  }

  // Un cran de plus pour un camp. Le premier en haut du ciel gagne.
  function monter(camp, n) {
    if (!manche || manche.etat !== 'en cours' || duel()) return;
    if (camp === 'sun') {
      manche.cielSun += n;
      manche.pulseSun = 0;
      if (manche.cielSun >= manche.hautSun) finir('sun');
    } else {
      manche.cielMoon += n;
      manche.pulseMoon = 0;
      if (manche.cielMoon >= manche.hautMoon) finir('moon');
    }
  }

  // Le compteur de serie. Il ne compte pas des points, il compte des MANCHES gagnees, et il
  // survit aux manches : c'est la seule memoire longue que le spectateur qui arrive en cours de
  // live peut lire d'un coup d'oeil. `pulse` part a zero quand le camp vient de marquer, ce qui
  // declenche le gonflement du chiffre : sans ca, l'increment passe inapercu sous le voile de fin.
  let scoreSerpent = 0,
    scoreViewers = 0,
    pulseS = 9,
    pulseV = 9;
  const campSerpent = (c) => c === 'serpent' || c === 'sun' || c === 'or';

  function finir(camp, cause) {
    if (!manche || manche.etat !== 'en cours') return;
    manche.etat = 'finie';
    manche.vainqueur = camp;
    manche.fin = 0;
    if (duel()) moments.manches++;
    if (duel() && (camp === 'or' || camp === 'ombre')) {
      if (serieCamp === camp) serieN++;
      else {
        serieCamp = camp;
        serieN = 1;
      }
      if (serieN >= 2)
        annoncer({
          genre: 'serie',
          pseudo: '',
          texte: dire('serie', {
            c: nomCamp(camp),
            a: nomCamp(camp === 'or' ? 'ombre' : 'or'),
            n: serieN,
          }),
          camp,
          devant: true,
        });
    }
    if (camp === 'nul') {
      /* match nul : aucun point */
    } else if (campSerpent(camp)) {
      scoreSerpent++;
      pulseS = 0;
    } else {
      scoreViewers++;
      pulseV = 0;
    }
    manches.push({
      camp,
      cause: cause || 'inconnue',
      duree: manche.t,
      longueur: serpent.length,
      faim: rodeur ? Math.round(rodeur.faim) : 0,
      sun: manche.sun,
      moon: manche.moonEv,
      cielSun: manche.cielSun,
      cielMoon: manche.cielMoon,
      cible: manche.cible,
      recolte: manche.recolte,
      mode: reglages.mode,
      palier: palier.id,
    });
  }

  // Une manche commence par une naissance : une coquille blanche se pose au centre du plateau,
  // elle se fend, elle eclate, et le serpent en sort. Tant qu'elle est la, rien ne bouge.
  const ECLOSION = 1.4,
    SORTIE = 0.6,
    TRAINE = 0.55;
  let couvee = null;

  // Architecture multi-corps : motif charger/ranger.
  // base.js a ~106 references a `serpent`, `hist`, `dir`, etc. : on ne renomme pas ces variables.
  // On charge le corps i dans les variables de module, on travaille dessus, on range.
  // flair : part de joueur presse dans l'IA (0 = IA prudente du mode base). Deux valeurs differentes
  // en duel, sinon les deux serpents jouent en miroir (Abdel, 2026-09-18).
  // EGALITE STRICTE (Abdel, 2026-09-18 : « without viewer interaction they are on the same playing
  // field 50/50 chances »). Les deux camps recoivent EXACTEMENT les memes valeurs. Mesure qui a
  // impose ce choix : en inversant les leviers, l'avantage suivait le caractere (le camp qui recoit
  // flair 0,4 / chasse 0,9 tombe de 53 % a 47 %), donc toute difference de levier est un handicap
  // de camp. Les serpents ne jouent pas en miroir pour autant : `flair` et `chasse` tirent au sort
  // (ia-humain.js:124 et 306), donc a parametres egaux les deux trajectoires divergent quand meme.
  const FLAIR_DUEL = { or: 0.3, ombre: 0.3 };
  // chasse : gout du piege (l'IA referme la poche adverse avec son corps)
  const CHASSE_DUEL = { or: 0.7, ombre: 0.7 };
  function nouveauCorps(camp, teinte, x0, y0, dir0) {
    return {
      camp,
      teinte,
      flair: duel() ? FLAIR_DUEL[camp] || 0 : 0,
      chasse: duel() ? CHASSE_DUEL[camp] || 0 : 0,
      x0: x0 !== undefined ? x0 : Math.floor(COLS / 2),
      y0: y0 !== undefined ? y0 : Math.floor(ROWS / 2),
      dir0: dir0 || { x: 1, y: 0 },
      serpent: [],
      hist: [],
      dir: { x: 1, y: 0 },
      dirProchaine: { x: 1, y: 0 },
      avance: 0,
      grandi: false,
      memoireIA: {},
      trace: [],
      aPousser: 0,
      couvee: null,
      baieCount: 0,
      surgeT: 0,
      invincT: 0,
      coupT: 0,
      reculT: 0,
      creditLike: 0,
      anneau: 0,
      anneauHaut: 0,
      bouclierT: 0,
      vies: 0,
      pareT: 0,
    };
  }
  let corps = [],
    actif = 0;
  // Scène courante (super admin) : {nom, restant, ...params}. Chaque tick d'IA la lit ; à zéro,
  // on rend la main à l'IA normale. Définies dans SCENES ci-dessous.
  let scene = null;
  // Nettoyage complet en fin de scène (naturel ou bouton "Couper la scène") : la scène disparaît et
  // tout effet qu'elle a pu poser sur les corps (invincibilité du ballet, mémoire IA de posture, de
  // fatigue, d'attente) redevient normal. Les fruits, les rochers et le score restent, ils n'appartiennent
  // pas à la scène. L'interrupteur underdog n'est pas touché, c'est un choix explicite séparé.
  function finirScene() {
    scene = null;
    if (!duel()) return;
    corps.forEach((c) => {
      c.invincT = 0; // ballet : invincibilité poussée à chaque tick, on la coupe net
      if (c.memoireIA) {
        c.memoireIA.posture = null; // la posture forcée s'oublie, elle sera recalculée
        c.memoireIA.postureActive = 'neutre';
        c.memoireIA.postureT = 0;
        c.memoireIA.attaqueT = 0;
        c.memoireIA.fatigue = 0;
        c.memoireIA.raison = null;
      }
    });
  }
  const SCENES = {
    // Ballet (Abdel : « donner le show, ne pas tuer l'autre, chaque serpent doit avoir une sortie
    // s'il joue intelligemment, un 4D chess move »). Comme face à face, mais nePasTuer coupe la
    // fermeture décisive : la pression, l'usure et l'orbite restent. Un serpent peut toujours mourir
    // d'une faute (mur, ronce, son propre corps), pas d'un piège volontaire de l'autre.
    ballet: {
      duree: 20,
      or: {
        posture: 'attaque',
        pA: 20,
        pD: 20,
        chasse: 1,
        flair: 0.25,
        attirer: true,
        nePasTuer: true,
      },
      ombre: {
        posture: 'attaque',
        pA: 20,
        pD: 20,
        chasse: 1,
        flair: 0.25,
        attirer: true,
        nePasTuer: true,
      },
    },
    course: {
      duree: 15,
      or: { courseBaie: true, pA: 12, pD: 10 },
      ombre: { courseBaie: true, pA: 12, pD: 10 },
    },
    // Chasse unifiée (retour d'Abdel : « le mener à un mur, le pousser à l'erreur, l'encercler avec
    // son propre corps »). Un serpent va au contact, l'encercle et tente le piège même risqué ; l'autre
    // joue normalement, il ne sait pas qu'il est visé.
    chasseOr: {
      duree: 12,
      or: {
        posture: 'attaque',
        pA: 20,
        pD: 20,
        chasse: 1,
        flair: 0.05,
        attirer: true,
        piegeImmediat: true,
        encercler: true,
      },
      ombre: {},
    },
    chasseOm: {
      duree: 12,
      or: {},
      ombre: {
        posture: 'attaque',
        pA: 20,
        pD: 20,
        chasse: 1,
        flair: 0.05,
        attirer: true,
        piegeImmediat: true,
        encercler: true,
      },
    },
  };
  function charger(i) {
    actif = i;
    const c = corps[i];
    serpent = c.serpent;
    hist = c.hist;
    dir = c.dir;
    dirProchaine = c.dirProchaine;
    avance = c.avance;
    grandi = c.grandi;
    memoireIA = c.memoireIA;
    trace = c.trace;
    aPousser = c.aPousser;
    couvee = c.couvee;
    baieCount = c.baieCount;
  }
  function ranger() {
    const c = corps[actif];
    c.serpent = serpent;
    c.hist = hist;
    c.dir = dir;
    c.dirProchaine = dirProchaine;
    c.avance = avance;
    c.grandi = grandi;
    c.memoireIA = memoireIA;
    c.trace = trace;
    c.aPousser = aPousser;
    c.couvee = couvee;
    c.baieCount = baieCount;
  }
  const autre = () => (duel() && corps.length > 1 ? corps[1 - actif] : null);

  function naitre(garder, x0, y0, dir0) {
    const cx = x0 !== undefined ? x0 : Math.floor(COLS / 2);
    const cy = y0 !== undefined ? y0 : Math.floor(ROWS / 2);
    serpent = [];
    hist = [];
    trace = [];
    couvee = { t: 0, x: cx, y: cy, garder: !!garder, dir0: dir0 || null };
    if (!garder) {
      graines = [];
      baies = [];
    }
  }

  function eclore(garder) {
    const cx = couvee ? couvee.x : Math.floor(COLS / 2);
    const cy = couvee ? couvee.y : Math.floor(ROWS / 2);
    const d0 = couvee && couvee.dir0 ? couvee.dir0 : { x: 1, y: 0 };
    serpent = [{ x: cx, y: cy }];
    aPousser = (duel() ? DEPART_DUEL : DEPART) - 1;
    hist = serpent.map((s) => ({ ...s }));
    dir = { ...d0 };
    dirProchaine = { ...d0 };
    avance = 0;
    grandi = false;
    memoireIA = {};
    // Renaissance en cours de manche : les offrandes des spectateurs restent, seule la case de depart se libere
    if (garder) {
      const occupe = (c) => serpent.some((s) => s.x === c.x && s.y === c.y);
      graines = graines.filter((g) => !occupe(g));
      baies = baies.filter((b) => !occupe(b));
      rochers = rochers.filter((r) => !occupe(r) && Math.abs(r.x - cx) + Math.abs(r.y - cy) > 2);
    }
    demanderIA();
  }

  // Les baies offertes sont vues tout de suite : une action de spectateur a un effet visible sans delai
  // En duel, une baie reservee a l'autre camp n'existe pas pour cette IA : elle ne la vise pas.
  function tousFruits() {
    const moi = duel() && corps[actif] ? corps[actif].camp : null;
    return baies
      .filter((b) => !b.pour || !moi || b.pour === moi)
      .map((b) => ({ x: b.x, y: b.y, offerte: true }));
  }

  // Duel : la tete adverse bouge en meme temps que la notre. Les deux serpents allaient l'un vers
  // l'autre sur la meme baie et se percutaient tete contre tete (sonde : 48 frontales en 90 s, toutes
  // perdues par Or qui avance en premier dans la boucle). Les quatre voisines de la tete adverse
  // sont donc interdites a l'IA, comme la couronne du rodeur : elle contourne au lieu de foncer.
  function couronneAdverse(a) {
    const h = a.serpent[0];
    if (!h) return [];
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([x, y]) => ({ x: h.x + x, y: h.y + y }))
      .filter((c) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS);
  }
  function demanderIA(garder) {
    if (!reglages.ia || !window.VipereIA || !serpent.length) return;
    try {
      const autreCorps = autre();
      const etat = {
        cols: COLS,
        rows: ROWS,
        corps: serpent,
        dir,
        fruits: tousFruits(),
        obstacles: rochers
          .filter((r) => r.t >= ALERTE * 0.6)
          .map((r) => ({ x: r.x, y: r.y }))
          .concat(roncesDures(0.6).map((g) => ({ x: g.x, y: g.y })))
          .concat(duel() && autreCorps ? autreCorps.serpent : []),
        eviter: duel() && autreCorps ? couronneAdverse(autreCorps) : [],
        aGrandir: aPousser,
        imprudence: reglages.imprudence,
        avantage:
          duel() && corps[actif]
            ? ((corps[actif].camp === 'or' ? 1 : -1) * (reglages.avantage || 0)) / 100
            : 0,
        flair: corps[actif] ? corps[actif].flair : 0,
        chasse: corps[actif] ? corps[actif].chasse : 0,
        adversaire: duel() && autreCorps ? autreCorps.serpent : null,
        adversaireInvincible: !!(duel() && autreCorps && autreCorps.invincT > 0),
        memoire: memoireIA,
      };
      // Scène : la moitié concernant le camp du serpent actif s'applique sur etat.
      if (scene && duel() && corps[actif]) {
        const s2 = scene[corps[actif].camp] || {};
        if (s2.posture) etat.postureForcee = s2.posture;
        if (s2.pA) etat.porteeAttaque = s2.pA;
        if (s2.pD) etat.porteeDefense = s2.pD;
        if (s2.chasse != null) etat.chasseForcee = s2.chasse;
        if (s2.flair != null) etat.flairForce = s2.flair;
        if (s2.imprudence != null) etat.imprudence = s2.imprudence;
        if (s2.courseBaie) etat.courseBaie = true;
        if (s2.piegeImmediat) etat.piegeImmediat = true;
        if (s2.attirer) etat.attirer = true;
        if (s2.repousser) etat.repousser = true;
        if (s2.encercler) etat.encercler = true;
        if (s2.nePasTuer) etat.nePasTuer = true;
      }
      // Underdog : le plus court reçoit +audace et +2 cases de portée, en silence.
      if (reglages.underdog && duel() && corps.length === 2) {
        const moi = corps[actif].serpent.length,
          adv = corps[1 - actif].serpent.length;
        if (moi < adv) {
          etat.imprudence = (etat.imprudence || 0) + 0.03;
          etat.porteeAttaque = (etat.porteeAttaque || 12) + 2;
          etat.porteeDefense = (etat.porteeDefense || 10) + 2;
        }
      }
      if (reglages.debugIA) {
        etat.debug = true;
        memoireIA.dbgEviter = etat.eviter;
      } else if (memoireIA.debug) {
        delete memoireIA.debug;
        delete memoireIA.dbgEviter;
        delete memoireIA.dbgFlash;
      }
      const superOn = !!(
        duel() &&
        !scene &&
        window.VipereSuperIA &&
        corps[actif] &&
        (reglages.superIA === true || reglages.superIA === corps[actif].camp)
      );
      if (superOn && garder) etat.prefere = dirProchaine;
      let d = superOn ? window.VipereSuperIA.choisir(etat) : window.VipereIA.choisir(etat);
      // garder : une direction deja annoncee (et dessinee) reste si elle est encore sure
      if (
        !superOn &&
        garder &&
        d &&
        (d.x !== dirProchaine.x || d.y !== dirProchaine.y) &&
        window.VipereIA.pasSur &&
        window.VipereIA.pasSur(etat, dirProchaine)
      )
        d = dirProchaine;
      // l'arriere est le cou, pas la derniere direction tentee (apres un pas rate contre un mur,
      // dir pointe dans le mur et son inverse est parfois la seule issue)
      const cou = serpent[1]
        ? { x: serpent[1].x - serpent[0].x, y: serpent[1].y - serpent[0].y }
        : { x: -dir.x, y: -dir.y };
      if (d && !(d.x === cou.x && d.y === cou.y)) dirProchaine = d;
    } catch (er) {
      erreurs++;
      derniereErreur =
        'ia: ' + er.message + ' | ' + (er.stack || '').split('\n').slice(0, 3).join(' > ');
    }
  }

  function mourir(cause) {
    if (duel() && corps[actif]) corps[actif].mortCause = cause || 'soi'; // pour les sondes : de quoi il est mort
    // mort evitable : la tete avait encore une case libre a cote d'elle
    // la queue ne libere pas sa case au pas d'une bouchee : elle compte comme occupee
    const h = serpent[0],
      segsCourants = grandi ? serpent : serpent.slice(0, -1);
    if (
      [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ].some(([x, y]) => {
        const a = h.x + x,
          b = h.y + y;
        return (
          a >= 0 &&
          b >= 0 &&
          a < COLS &&
          b < ROWS &&
          !segsCourants.some((c) => c.x === a && c.y === b)
        );
      })
    )
      evitables++;
    longueursMort.push(serpent.length);
    morts++;
    trace = [];
    // La mort ne tranche plus la manche : elle pousse la lune de quelques crans, puis le serpent revient.
    // Mode de base : la mort du serpent donne la manche aux spectateurs, c'est tout l'enjeu.
    // Versus : elle ne tranche rien, elle pousse la lune de quelques crans et le serpent revient.
    // Base : mourir contre un mur ou contre soi ne donne pas la manche, mais le rodeur en profite.
    if (duel()) {
      // duel : pas de renaissance, pas de pause. Ramener a max(3, floor(L/2)).
      // La moitie perdue eclate en baies. Sous 3 anneaux : mort seche, l'autre camp gagne.
      if (corps[actif].bouclierT > 0) {
        // le bouclier pare la collision : aucun anneau perdu, il repart invincible
        corps[actif].pareT = 0.9;
        corps[actif].invincT = 1.5;
        sauve(actif, 'bouclier');
        if (serpent.length) {
          const tp = px(serpent[0].x, serpent[0].y);
          eclat(tp.x, tp.y, 20, 'coquille');
        }
        demanderIA();
        return;
      }
      // Faute propre (mur, son propre corps) : AUCUN anneau perdu (Abdel : « the team should never lose
      // because of a self mistake of the snake »). Il repart invincible 1,5 s et re-decide. Seuls le corps
      // adverse et la frontale, c'est-a-dire le piege de l'autre, coutent la moitie.
      // ... sauf si l'adversaire l'a acculee : son corps a 2 cases ou moins de ma tete, c'est SON piege
      // (Abdel : « orange blocked blue on the side and led him to the wall, blue didn't lose anything »).
      const advC = autre();
      const h0 = serpent[0];
      const accule = !!(
        advC &&
        h0 &&
        advC.serpent.some((q) => Math.abs(q.x - h0.x) + Math.abs(q.y - h0.y) <= 2)
      );
      if (accule && (cause === 'mur' || cause === 'soi')) {
        cause = 'adverse';
        corps[actif].mortCause = 'adverse';
      }
      if (cause === 'mur' || cause === 'soi') {
        corps[actif].invincT = 1.5;
        corps[actif].pareT = 0.4;
        if (serpent.length) {
          const tp = px(serpent[0].x, serpent[0].y);
          eclat(tp.x, tp.y, 10, 'poussiere');
        }
        demanderIA();
        return;
      }
      const L = serpent.length;
      const seuil = Math.max(corps[actif].adulte ? 3 : MIN_JEUNE, Math.floor(L / 2));
      const perdu = serpent.slice(seuil);
      serpent = serpent.slice(0, seuil);
      hist = hist.slice(0, Math.max(1, seuil + 3));
      corps[actif].invincT = 1.5;
      corps[actif].anneauHaut = L / LONG_CIBLE_DUEL;
      corps[actif].reculT = 0.9;
      corps[actif].coupT = 0.9;
      eclaterAnneaux(perdu, corps[actif].camp);
      if (serpent.length < 3 && corps[actif].adulte) {
        serpent = [];
        const adv = autre();
        finir(adv ? adv.camp : 'or', 'place');
      } else demanderIA(); // sinon il garde son cap dans le mur et remeurt a la fin de l'invincibilite
      return;
    }
    monter('moon', MORT_CRANS);
    pause = 0.8;
    serpent = [];
  }

  function pas() {
    if (!serpent.length) return false;
    // duel : l'adversaire a bouge depuis la derniere decision, on re-decide sur sa position reelle.
    // Sans ca, toutes les morts etaient "evitables" (sonde) : la tete fonçait dans une case qu'il
    // venait de prendre. Avec, la couronne de sa tete est a jour et les frontales disparaissent.
    // Anti-tremblement (Abdel, 2026-09-19 : « really a wiggle when they are head to head, very
    // subtle »). La tete est dessinee en glissant vers la case que vise dirProchaine, decidee a la fin
    // du pas precedent. Redecider ici changeait souvent d'avis tete contre tete (3 262 fois en 45 min
    // de duel) : la tete s'inclinait d'un cote puis partait de l'autre, sa pointe sautait d'une
    // demi-case. On redecide toujours, mais on GARDE la direction annoncee tant que l'IA la juge
    // encore sure (pasSur) : la reactivite face au danger reste entiere, seuls les caprices partent.
    if (duel()) {
      const av = { ...dirProchaine };
      demanderIA(!window.VIPERE_REDECIDE_TOUJOURS);
      if (av.x !== dirProchaine.x || av.y !== dirProchaine.y) retouches++;
      else gardes++;
      if (reglages.debugIA)
        memoireIA.dbgFlash = {
          t,
          change: av.x !== dirProchaine.x || av.y !== dirProchaine.y,
          x: serpent[0].x,
          y: serpent[0].y,
        };
    }
    if (dirProchaine.x !== dir.x || dirProchaine.y !== dir.y) {
      virages++;
      // escalier : a, b, a, b sur quatre pas de suite
      const n = dirs.length,
        c = dirProchaine;
      if (
        n >= 3 &&
        dirs[n - 1] !== dirs[n - 2] &&
        dirs[n - 2] !== dirs[n - 3] &&
        dirs[n - 2].x === c.x &&
        dirs[n - 2].y === c.y &&
        dirs[n - 1].x === dirs[n - 3].x &&
        dirs[n - 1].y === dirs[n - 3].y
      )
        escaliers++;
    }
    dir = dirProchaine;
    dirs.push(dir);
    if (dirs.length > 4) dirs.shift();
    const nx = serpent[0].x + dir.x,
      ny = serpent[0].y + dir.y;
    // invincibilite temporaire (apres absorption d'une mort par vie, ou apres collision en duel)
    const enInvinc = duel() && corps[actif].invincT > 0;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      if (!enInvinc) {
        mourir('mur');
        return false;
      }
      demanderIA();
      return true;
    }
    if (rochers.some((r) => r.t >= ALERTE && r.x === nx && r.y === ny)) {
      mourir('rocher');
      return false;
    }
    if (roncesDures().some((g) => g.x === nx && g.y === ny)) {
      mourir('ronce');
      return false;
    }
    // baie reservee a l'autre camp : le serpent passe dessus sans la manger (Abdel : « avoid the stealing case »)
    const moiCamp = duel() && corps[actif] ? corps[actif].camp : null;
    const iBaie = baies.findIndex(
      (b) => b.x === nx && b.y === ny && !(b.pour && moiCamp && b.pour !== moiCamp),
    );
    const mange = iBaie >= 0;
    const sort = aPousser > 0;
    const pousseManges = mange && serpent.length < longMax();
    const pousse = sort || pousseManges;
    if (sort) aPousser--;
    // la queue libere sa case au meme pas, sauf si le serpent mange ; en duel, le corps adverse bloque aussi
    const autreCorpsDuel = autre();
    const bloquant = (pousse ? serpent : serpent.slice(0, -1)).concat(
      duel() && autreCorpsDuel ? autreCorpsDuel.serpent : [],
    );
    if (!enInvinc && bloquant.some((s) => s.x === nx && s.y === ny)) {
      // duel, tete contre tete : la faute est partagee, les deux serpents encaissent. Sinon celui qui
      // avance en premier dans la boucle perd toutes les frontales.
      const ta = duel() && autreCorpsDuel && autreCorpsDuel.serpent[0];
      if (ta && ta.x === nx && ta.y === ny && autreCorpsDuel.invincT <= 0) {
        const moi = actif;
        mourir('frontale');
        if (manche && manche.etat === 'en cours') {
          ranger();
          charger(1 - moi);
          mourir('frontale');
          ranger();
          charger(moi);
        }
        return false;
      }
      mourir(
        autreCorpsDuel && autreCorpsDuel.serpent.some((s) => s.x === nx && s.y === ny)
          ? 'adverse'
          : 'soi',
      );
      return false;
    }
    serpent = pousse ? [{ x: nx, y: ny }, ...serpent] : [{ x: nx, y: ny }, ...serpent.slice(0, -1)];
    hist.unshift({ x: nx, y: ny });
    if (hist.length > serpent.length + 3) hist.length = serpent.length + 3;
    grandi = pousse;
    if (mange) {
      bouchees++;
      const p = px(nx, ny);
      const b = baies[iBaie];
      baies.splice(iBaie, 1);
      if (!b || !b.sauvage) mangeesOffertes++;
      // halo de la couleur de la baie mangee : or, ombre, ou vert (baie sans camp)
      halos.push({
        x: p.x,
        y: p.y,
        t: 0,
        duree: b && b.sauvage ? 0.85 : 1.1,
        teinte:
          b && b.sauvage
            ? 'nature'
            : b && b.camp === 'or'
              ? 'offerte-or'
              : b && b.camp === 'ombre'
                ? 'offerte-ombre'
                : 'offerte',
      });
      monter('sun', 1);
      const a = amb();
      if (sonActif && ac && a)
        try {
          a.sonBouchee(ac, sortie, a.gamme[noteIdx++ % a.gamme.length]);
        } catch (er) {}
    }
    demanderIA();
    return true;
  }

  // Trace lissee : un arc de Bezier par case, de milieu a milieu (virages arrondis, continuite exacte)
  function sommet(k) {
    if (k < 0) {
      const h = hist[0];
      return { x: h.x + dirProchaine.x, y: h.y + dirProchaine.y };
    }
    return hist[Math.min(k, hist.length - 1)];
  }
  function pointSur(p) {
    const k = Math.round(p),
      u = Math.min(1, Math.max(0, p - k + 0.5));
    const a = sommet(k - 1),
      v = sommet(k),
      b = sommet(k + 1);
    const Ax = (a.x + v.x) / 2,
      Ay = (a.y + v.y) / 2,
      Bx = (v.x + b.x) / 2,
      By = (v.y + b.y) / 2,
      i = 1 - u;
    return px(i * i * Ax + 2 * u * i * v.x + u * u * Bx, i * i * Ay + 2 * u * i * v.y + u * u * By);
  }
  function tracer() {
    const L = serpent.length;
    if (!L) return [];
    const ph = 1 - avance,
      pt = grandi ? L - 1 : L - avance,
      pts = [];
    for (let p = ph; p < pt; p += 1 / 3) pts.push(pointSur(p));
    pts.push(pointSur(pt));
    return pts;
  }

  // Avance la logique de dt secondes (sans rendu : sert aussi au harnais Node)
  function avancer(dt) {
    t += dt;
    majPalier(dt);
    // le gonflement du chiffre vit HORS de la manche : il commence justement quand elle finit
    pulseS += dt;
    pulseV += dt;
    // le cycle du jour tourne tout seul : nuit, lever, plein jour, coucher, en boucle
    if (reglages.cycle > 0) reglages.heure = (reglages.heure + dt / reglages.cycle) % 1;
    if (scene && manche && manche.etat === 'en cours') {
      scene.restant -= dt;
      if (scene.restant <= 0) finirScene();
    }
    // graines : elles germent, puis deviennent des baies mangeables
    for (let i = graines.length - 1; i >= 0; i--) {
      const g = graines[i];
      g.t += dt;
      if (g.t >= GERME) {
        graines.splice(i, 1);
        baies.push({
          x: g.x,
          y: g.y,
          pseudo: g.pseudo,
          t: 0,
          camp: g.camp || null,
          pour: g.pour || null,
        });
        eclat(
          px(g.x, g.y).x,
          px(g.x, g.y).y,
          6,
          g.camp === 'or' ? 'offerte-or' : g.camp === 'ombre' ? 'offerte-ombre' : 'offerte',
        );
        demanderIA();
      }
    }
    baies.forEach((b) => {
      b.t += dt;
    });
    // la tension se remesure dix fois par seconde, puis se lisse : vite vers le haut, lentement vers le bas
    tensionT -= dt;
    if (tensionT <= 0) {
      tensionT = 0.1;
      tensionCible = mesurerTension();
    }
    tension += (tensionCible - tension) * Math.min(1, dt * (tensionCible > tension ? 3.5 : 0.9));
    for (let i = halos.length - 1; i >= 0; i--) {
      halos[i].t += dt;
      if (halos[i].t >= halos[i].duree) halos.splice(i, 1);
    }
    for (let i = etincelles.length - 1; i >= 0; i--) {
      const e = etincelles[i];
      e.t += dt;
      if (e.t >= e.duree) {
        etincelles.splice(i, 1);
        continue;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += (e.g === undefined ? 520 : e.g) * dt;
      if (e.k) {
        const fr = Math.max(0, 1 - e.k * dt);
        e.vx *= fr;
        e.vy *= fr;
      }
    }
    // rochers : l'ombre, puis la pierre, puis l'effacement
    for (let i = rochers.length - 1; i >= 0; i--) {
      const r = rochers[i];
      r.t += dt;
      if (r.t >= VIEROCHER) rochers.splice(i, 1);
      else if (r.t >= ALERTE && r.t - dt < ALERTE) {
        demanderIA();
        sonPose();
        const pi = px(r.x, r.y);
        // des mottes de terre qui retombent au pied, sans jamais gicler
        eclat(pi.x, pi.y + 14, 7, 'poussiere', {
          v0: 18,
          v1: 65,
          haut: -4,
          g: 260,
          frein: 3.4,
          r: 0.8,
          a: 0.4,
          duree: 0.55,
        });
      }
    }
    for (let i = ronces.length - 1; i >= 0; i--) {
      const R = ronces[i];
      R.t += dt;
      R.seg.forEach((g) => (g.t += dt));
      if (R.t >= VIERONCE) {
        ronces.splice(i, 1);
        demanderIA();
        continue;
      }
      R.pas += dt;
      if (R.pas >= RONCE_PAS && R.seg.length < RONCE_MAX) {
        R.pas = 0;
        allongerRonce(R);
      }
      // chaque segment qui devient dur remue la terre a son pied
      R.seg.forEach((g) => {
        if (g.t >= RONCE_ALERTE && g.t - dt < RONCE_ALERTE) {
          const pi = px(g.x, g.y);
          eclat(pi.x, pi.y + 10, 4, 'poussiere', {
            v0: 12,
            v1: 44,
            haut: -6,
            g: 200,
            frein: 3.2,
            r: 0.6,
            a: 0.32,
            duree: 0.45,
          });
        }
      });
    }
    if (manche) {
      if (manche.etat === 'en cours') {
        manche.t += dt;
        // la cible ne monte qu'avec l'affluence : une ruee ne rend pas la manche triviale,
        // et une salle qui se vide ne punit pas ceux qui restent
        etirer('Sun', palier.cielSun, dt * 14);
        etirer('Moon', palier.cielMoon, dt * 2);
        // La cible s'allonge avec l'affluence, donc la recolte se remet a l'echelle comme le fait
        // deja etirer() pour les astres. Sans ca, un anneau plein retombait a 17 % quand la foule
        // arrivait, et le spectateur voyait la progression RECULER.
        if (palier.cible > manche.cible) {
          const avant = manche.cible;
          manche.cible = Math.min(palier.cible, manche.cible + dt * 14);
          if (avant > 0 && manche.cible > avant) manche.recolte *= manche.cible / avant;
        }
        manche.pulseSun += dt;
        manche.pulseMoon += dt;
        // Temps ecoule. En base, le serpent n'a pas tenu son pari, les spectateurs l'emportent :
        // le code donnait l'inverse, contre son propre commentaire et contre spec-modes.md.
        // Corrige le 2026-09-18 sur OK d'Abdel. En versus, le plus haut l'emporte, egalite a Moon.
        // Duel, victoire a l'anneau (Abdel, 2026-09-18) : un camp gagne quand son demi-anneau est
        // plein (LONG_CIBLE_DUEL anneaux, le bas-centre atteint) et qu'il le TIENT TENUE_DUEL
        // secondes sans etre coupe en dessous. Le chrono reste la fin de secours.
        if (duel()) {
          const pleins = [];
          for (let i = 0; i < corps.length; i++) {
            const c = corps[i];
            const avT = c.tenue || 0;
            c.tenue = c.serpent.length >= LONG_CIBLE_DUEL ? (c.tenue || 0) + dt : 0;
            if (avT === 0 && c.tenue > 0) moments.tenues++;
            if (c.serpent.length >= ADULTE_DUEL) c.adulte = true;
            const enSursis = !c.couvee && c.serpent.length > 0 && c.serpent.length < SURSIS_DUEL;
            if (enSursis && !c.sursis) moments.sursis++;
            c.sursis = enSursis;
            if (c.tenue >= TENUE_DUEL) pleins.push(c);
          }
          // EGALITE STRICTE : avant, la boucle finissait sur `break` des que corps[0] tenait son
          // anneau, donc Or passait devant Ombre du seul fait de son rang dans le tableau. On
          // depouille maintenant les deux, et la plus longue tenue gagne ; tenue identique = nul.
          if (pleins.length === 1) finir(pleins[0].camp, 'anneau');
          else if (pleins.length > 1) {
            const a = pleins[0],
              b = pleins[1];
            finir(a.tenue === b.tenue ? 'nul' : a.tenue > b.tenue ? a.camp : b.camp, 'anneau');
          }
          if (manche.etat !== 'en cours') return;
        }
        // duel : chrono propre (TEST equilibre : 120 s, les publics calmes ne remplissent jamais l'anneau)
        if (manche.t >= (duel() ? reglages.dureeDuel || reglages.duree : reglages.duree)) {
          if (duel()) {
            // plus long gagne ; egalite = ombre (comme Moon en versus). Aucun progres des deux cotes (personne
            // n'a depasse la longueur de naissance) : match nul, aucun point (Abdel).
            const l0 = corps[0].serpent.length,
              l1 = corps[1].serpent.length;
            // EGALITE STRICTE : l'egalite de longueur allait silencieusement a Ombre (« comme Moon en
            // versus »), ce qui est un biais de camp. Sans spectateur les deux serpents finissent
            // souvent a la meme longueur (5 % des manches mesurees) : c'est un match nul, aucun point.
            if (l0 === l1) finir('nul', 'temps');
            else if (l0 <= DEPART_DUEL && l1 <= DEPART_DUEL) finir('nul', 'temps');
            else finir(l0 > l1 ? 'or' : 'ombre', 'temps');
          } else {
            finir(
              manche.cielSun / manche.hautSun > manche.cielMoon / manche.hautMoon ? 'sun' : 'moon',
              'temps',
            );
          }
        }
        // garde-fou : sans spectateur le plateau reste vide et rien ne peut arriver
        // ARBITRAGE, 2026-09-18. Abdel a demande deux choses contradictoires le meme jour :
        // « unlimited food », puis « i dont want food to be abundant unless a user drops a lot of
        // food ». Tranche ainsi : **illimite pour ce que le public donne** (semer n'a plus de
        // plafond), **rationne pour ce que la foret donne toute seule**. La foret n'est donc plus
        // qu'un filet de securite : elle ne nourrit que si le plateau est vide de toute nourriture,
        // et sa cadence RALENTIT a mesure que le public devient genereux, jusqu'a se taire.
        if (!graines.length && !baies.length) {
          sansBaie += dt;
          // Base : le like ne seme plus, il frappe le rodeur. C'est donc la foret seule qui nourrit
          // le serpent, a tous les paliers, sinon a forte affluence il n'a plus rien a manger.
          // Plus le public est actif, plus la foret se tait : c'est la generosite reelle du public
          // qui regle l'abondance, pas une horloge fixe. A cadence 20, la foret est deja 2 fois
          // plus lente ; a cadence 200, 11 fois.
          // Duel (Abdel) : la foret nourrit en quantite moderee quand le plateau est vide, une baie verte
          // neutre a intervalle, posee a EGALE distance des deux tetes (a 1 case pres).
          const sv0 = duel() ? FORET_DUEL : reglages.sauvage >= 0 ? palier.sauvage : 0;
          const sv = sv0 / (1 + cadence / 20);
          if (!delaiSauvage) delaiSauvage = souffle(sv);
          if (sv > 0 && sansBaie >= delaiSauvage) {
            sansBaie = 0;
            delaiSauvage = souffle(sv);
            // La baie sauvage obeit a la regle comme tout le reste. Son delai est nul, elle ne
            // peut donc pas etre franchie avant d'etre active, mais la regle ne sert pas qu'a ca :
            // une nourriture qui parait sous son nez est un cadeau gratuit, sans decision, et elle
            // n'a aucune raison de se comporter autrement qu'une baie semee. Meme delai, GERME.
            let l = libres().filter((c) => !zoneMorte(c, GERME));
            if (duel() && corps[0] && corps[1] && corps[0].serpent[0] && corps[1].serpent[0]) {
              const a = corps[0].serpent[0],
                b = corps[1].serpent[0];
              const dd = (c) =>
                Math.abs(
                  Math.abs(c.x - a.x) +
                    Math.abs(c.y - a.y) -
                    (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)),
                );
              const eq = l.filter((c) => dd(c) <= 1 && !zoneMorte(c, GERME));
              if (eq.length) l = eq;
              else {
                l.sort((p, q) => dd(p) - dd(q));
                l = l.slice(0, 4);
              }
            }
            if (!l.length) l = libres();
            if (l.length) {
              const c = l[Math.floor(Math.random() * l.length)];
              baies.push({ x: c.x, y: c.y, pseudo: '', t: 0, sauvage: true });
              demanderIA();
            }
          }
        } else {
          sansBaie = 0;
          delaiSauvage = 0;
        }
        // salle vide ou presque : la foret elle-meme fait tomber des pierres, sinon rien ne menace jamais
        if (palier.nature > 0 && !duel()) {
          natureT += dt;
          if (!delaiNature) delaiNature = souffle(palier.nature);
          if (natureT >= delaiNature) {
            natureT = 0;
            delaiNature = souffle(palier.nature);
            bloquer('');
          }
        } else {
          natureT = 0;
          delaiNature = 0;
        }
      } else {
        manche.fin += dt;
        if (manche.fin >= 8) nouvelleManche();
        return;
      }
    }
    // Equite du duel : resoudre toujours Or puis Ombre donne l'initiative permanente au premier
    // servi (banc : 38-2). On alterne donc l'ordre a chaque tick, aucun camp ne garde la main.
    ordreTick = 1 - ordreTick;
    if (duel() && ordreTick) {
      for (let _i = corps.length - 1; _i >= 0; _i--) {
        charger(_i);
        avancerCorps(dt);
        ranger();
      }
    } else
      for (let _i = 0; _i < corps.length; _i++) {
        charger(_i);
        avancerCorps(dt);
        ranger();
      }
    charger(0);
  }

  // Avance le corps charge (actif) de dt secondes. Appele depuis avancer apres charger(i).
  function avancerCorps(dt) {
    // minuteries par corps en duel (surgeT, invincT, coupT)
    if (duel()) {
      if (corps[actif].surgeT > 0) corps[actif].surgeT = Math.max(0, corps[actif].surgeT - dt);
      if (corps[actif].invincT > 0) corps[actif].invincT = Math.max(0, corps[actif].invincT - dt);
      if (corps[actif].coupT > 0) corps[actif].coupT = Math.max(0, corps[actif].coupT - dt);
      if (corps[actif].pareT > 0) corps[actif].pareT = Math.max(0, corps[actif].pareT - dt);
      if (corps[actif].bouclierT > 0)
        corps[actif].bouclierT = Math.max(0, corps[actif].bouclierT - dt);
      if (corps[actif].reculT > 0) corps[actif].reculT = Math.max(0, corps[actif].reculT - dt);
    }
    if (pause > 0) {
      pause -= dt;
      if (pause <= 0) {
        pause = 0;
        naitre(!!(manche && manche.etat === 'en cours'));
      }
      return;
    }
    if (couvee) {
      const avant = couvee.t;
      couvee.t += dt;
      const a0 = amb();
      if (sonActif && ac && a0 && a0.sonEclosion) {
        const uu = couvee.t / ECLOSION,
          ua = avant / ECLOSION;
        [0.34, 0.46, 0.55].forEach((m) => {
          if (ua < m && uu >= m)
            try {
              a0.sonEclosion(ac, sortie, 'fissure');
            } catch (er) {}
        });
        if (ua < SORTIE && uu >= SORTIE)
          try {
            a0.sonEclosion(ac, sortie, 'naissance');
          } catch (er) {}
      }
      // le serpent sort avant la fin de l'animation, la coquille finit de s'ouvrir derriere lui
      if (!couvee.sorti && couvee.t >= ECLOSION * SORTIE) {
        couvee.sorti = true;
        const p = px(couvee.x, couvee.y);
        eclat(p.x, p.y, 18, 'coquille');
        eclore(couvee.garder);
      }
      if (couvee.t >= ECLOSION + TRAINE) couvee = null;
      if (!couvee || !couvee.sorti) return;
    }
    const surge = duel() && corps[actif].surgeT > 0;
    avance += dt * VITESSE * (surge ? SURGE_FACT : 1); // like : poussee de tempo
    while (avance >= 1) {
      avance -= 1;
      if (!pas()) return;
    }
  }

  const OR = '#F2C57C';
  // Duel : la nourriture ne peut pas etre or (couleur du camp Or) : vert tendre, distinct des deux
  // camps et du fond de foret (Abdel, 2026-09-18). En base elle reste or.
  const BAIE_VERT = '#9BE28A',
    BAIE_VERT_A = (a) => 'rgba(155,226,138,' + a + ')';
  const teinteBaie = (camp) =>
    camp === 'or' ? OR : camp === 'ombre' ? OMBRE : duel() ? BAIE_VERT : OR;
  const lueurBaie = (a, camp) =>
    camp === 'or'
      ? 'rgba(242,197,124,' + a + ')'
      : camp === 'ombre'
        ? 'rgba(180,212,222,' + a + ')'
        : duel()
          ? BAIE_VERT_A(a)
          : 'rgba(242,197,124,' + a + ')';
  const OMBRE = '#b4d4de'; // couleur du second serpent en mode duel (a verifier au contraste)

  // Ce que les spectateurs offrent : la graine tombe, l'ombre se resserre, la baie s'ouvre.
  const BAIE_RS = 58,
    BAIE_N = 48,
    cacheBaie = new Map();
  function spriteBaie(ph, camp) {
    const cle = ph + (duel() ? 'd' : 'b') + (camp || '');
    let s = cacheBaie.get(cle);
    if (s) return s;
    const si = Math.sin((ph / BAIE_N) * Math.PI * 2),
      bat = 1 + 0.09 * si;
    s = document.createElement('canvas');
    s.width = 2 * BAIE_RS;
    s.height = 2 * BAIE_RS;
    const avant = ctx;
    ctx = s.getContext('2d');
    ctx.translate(BAIE_RS, BAIE_RS);
    try {
      ctx.globalAlpha = 0.35 + 0.15 * si;
      ctx.strokeStyle = teinteBaie(camp);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24 * bat, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowColor = lueurBaie(0.9, camp);
      ctx.shadowBlur = 26;
      ctx.fillStyle = teinteBaie(camp);
      ctx.beginPath();
      ctx.arc(0, 0, 17 * bat, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,246,228,0.55)';
      ctx.beginPath();
      ctx.arc(-5, -5, 5, 0, Math.PI * 2);
      ctx.fill();
    } finally {
      ctx = avant;
    }
    cacheBaie.set(cle, s);
    return s;
  }
  function peindreOffrandes() {
    graines.forEach((g) => {
      const p = px(g.x, g.y),
        u = Math.min(1, g.t / GERME),
        chute = Math.min(1, u / 0.7);
      if (chute < 1) {
        const y = p.y - CELL * 3.2 * (1 - chute) * (1 - chute);
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.3 * chute;
        ctx.fillStyle = '#0b120d';
        ctx.beginPath();
        ctx.ellipse(p.y ? p.x : p.x, p.y + 6, 10 + 8 * chute, 3 + 2 * chute, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowColor = lueurBaie(0.8, g.camp);
        ctx.shadowBlur = 20;
        ctx.fillStyle = teinteBaie(g.camp);
        ctx.beginPath();
        ctx.arc(p.x, y, 5 + 3 * chute, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const s = (u - 0.7) / 0.3;
        ctx.save();
        ctx.strokeStyle = 'rgba(159,199,164,0.85)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + 12);
        ctx.lineTo(p.x, p.y + 12 - 14 * s);
        ctx.stroke();
        ctx.shadowColor = lueurBaie(0.9, g.camp);
        ctx.shadowBlur = 24;
        ctx.fillStyle = teinteBaie(g.camp);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
    baies.forEach((b) => {
      const p = px(b.x, b.y);
      // Toutes les baies battent au meme rythme, decale par leur age : leur dessin ne depend donc
      // que de la phase du battement. On en garde 48 images, partagees par toutes les baies du
      // plateau. C'est ici que se joue la vraie depense : `shadowBlur` est l'operation la plus
      // chere du canvas 2D, et elle etait payee une fois PAR BAIE ET PAR IMAGE. Elle est desormais
      // cuite dans le sprite, payee 48 fois pour toute la partie.
      const ph = ((Math.round(((b.t * 3.4) / (Math.PI * 2)) * BAIE_N) % BAIE_N) + BAIE_N) % BAIE_N;
      ctx.drawImage(spriteBaie(ph, b.camp), Math.round(p.x) - BAIE_RS, Math.round(p.y) - BAIE_RS);
    });
  }

  const BLEU = '#8FA8D8',
    ROUGE = '#D64A42',
    COQUILLE = '#F6F3EA';

  // Les rochers de Moon : rien ne tombe du ciel. La terre se bombe une seconde, la mousse se
  // souleve, et la pierre sort du sol. L'avertissement reste lisible, le geste devient vegetal.
  function bosse(x, y, rx, ry, force) {
    const g = ctx.createRadialGradient(x, y - ry * 0.35, rx * 0.12, x, y, rx);
    g.addColorStop(0, 'rgba(58,70,56,' + 0.55 * force + ')');
    g.addColorStop(0.55, 'rgba(35,45,36,' + 0.5 * force + ')');
    g.addColorStop(1, 'rgba(20,30,23,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Les plaques de terre : l'ecorce du sol se fend en quartiers qui basculent vers l'exterieur.
  // Chacune pivote autour de son bord interne, donc la pierre a l'air de forcer le sol, pas de glisser.
  function plaques(x, y, ouv, j) {
    for (let i = 0; i < 4; i++) {
      const an = (i / 4) * Math.PI * 2 + j * 0.21,
        r0 = 9,
        r1 = 20 + 13 * ouv;
      const bas = 0.34 + 0.06 * ((i + j + 8) % 3); // quartiers inegaux, aucun n'est le miroir d'un autre
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.46);
      ctx.rotate(an);
      ctx.beginPath();
      ctx.moveTo(r0, -r0 * bas);
      ctx.lineTo(r1, -r1 * bas * 0.9);
      ctx.lineTo(r1, r1 * bas * 0.9);
      ctx.lineTo(r0, r0 * bas);
      ctx.closePath();
      ctx.fillStyle = 'rgba(31,40,32,' + (0.62 + 0.28 * ouv) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,180,140,' + 0.26 * ouv + ')';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }
  }
  // La fissure : trois branches noires qui s'ouvrent depuis le centre avant que rien ne depasse.
  function fissure(x, y, ouv, j) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.46);
    ctx.strokeStyle = 'rgba(6,10,7,' + 0.75 * Math.min(1, ouv * 2) + ')';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const an = (i / 3) * Math.PI * 2 + j * 0.4,
        L = 13 + 20 * ouv;
      ctx.lineWidth = 3.2 - 1.1 * i * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(an + 0.3) * L * 0.55,
        Math.sin(an + 0.3) * L * 0.55,
        Math.cos(an) * L,
        Math.sin(an) * L,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  // Une motte arrachee au flanc de la pierre : elle devale, tombe, et se tasse au pied.
  function motte(x, y, k, i, j) {
    if (k <= 0 || k >= 1) return;
    const cote = i % 2 ? 1 : -1,
      d = 8 + 5 * ((i + j + 5) % 3);
    const px2 = x + cote * d * (0.4 + 0.6 * k),
      py2 = y - 16 + 34 * k * k;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
    ctx.fillStyle = '#2a3529';
    ctx.beginPath();
    ctx.ellipse(px2, py2, 3.4 - 1.2 * k, 2.8 - 1 * k, cote * k * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Le grain hache, meme principe que l'ambiance : un bruit deterministe, donc une pierre a
  // toujours exactement la meme forme et la meme mousse tant qu'elle est au meme endroit.
  const HACHE = (i, d) => {
    const v = Math.sin((i + 1) * 12.9898 + (d + 7) * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  // Une seule lumiere pour tout ce qui est pose au sol, calquee sur les cles de l'ambiance : elle
  // vient de la gauche au lever, du zenith a midi, de la droite au coucher, et la nuit elle est
  // faible et froide. Sans elle, un objet reste un aplat colle sur une image peinte.
  function lumiere() {
    const h = (((reglages.heure || 0) % 1) + 1) % 1;
    const jour = Math.max(0, Math.min(1, (Math.cos((h - 0.5) * Math.PI * 2) + 0.35) / 1.35));
    const an = Math.PI * (-0.82 + 0.62 * Math.min(1, Math.max(0, (h - 0.2) / 0.58)));
    const chaud = [248, 226, 186],
      froid = [164, 192, 214];
    const te = chaud.map((c, i) => Math.round(c + (froid[i] - c) * (1 - jour)));
    return { x: Math.cos(an), y: Math.sin(an), k: 0.28 + 0.72 * jour, te: te.join(',') };
  }

  // La pierre : une silhouette irreguliere a onze sommets, deux plans casses net, une fissure
  // eclairee d'un cote, du grain, de la mousse du cote du jour, et un liseret de lumiere qui ne
  // court que sur les aretes tournees vers la source.
  function pointsRocher(j, ech) {
    const n = 11,
      R = 23 * (ech || 1),
      pts = [];
    for (let i = 0; i < n; i++) {
      const an = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = R * (0.8 + 0.28 * HACHE(i, j));
      pts.push({ x: Math.cos(an) * r, y: Math.sin(an) * r * 0.9 + 2, an: an });
    }
    return pts;
  }
  function traceRocher(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }
  function corpsRocher(j) {
    const L = lumiere(),
      pts = pointsRocher(j);
    // le corps : un degrade oriente par la lumiere, du flanc eclaire au flanc dans l'ombre
    traceRocher(pts);
    const g = ctx.createLinearGradient(-26 * L.x, -26 * L.y, 26 * L.x, 26 * L.y);
    g.addColorStop(0, '#7c8798');
    g.addColorStop(0.44, '#4f5a6c');
    g.addColorStop(1, '#212934');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    traceRocher(pts);
    ctx.clip();
    // le plan du dessus, casse net : c'est lui qui donne le volume, pas une facette plus claire
    ctx.beginPath();
    ctx.moveTo(-28, -4 + 1.5 * j);
    ctx.lineTo(-5, -16);
    ctx.lineTo(13, -10 + j);
    ctx.lineTo(28, -3);
    ctx.lineTo(28, -34);
    ctx.lineTo(-28, -34);
    ctx.closePath();
    const g2 = ctx.createLinearGradient(0, -26, 0, 2);
    g2.addColorStop(0, 'rgba(' + L.te + ',' + 0.34 * L.k + ')');
    g2.addColorStop(1, 'rgba(' + L.te + ',0)');
    ctx.fillStyle = g2;
    ctx.fill();
    // la fissure, creusee d'un trait sombre et relevee d'un trait clair du cote du jour
    ctx.strokeStyle = 'rgba(14,18,24,0.72)';
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6 + 2 * j, -15);
    ctx.quadraticCurveTo(2, -2, -2 + j, 17);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + L.te + ',' + 0.2 * L.k + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6 + 2 * j - 1.4 * L.x, -15 - 1.4 * L.y);
    ctx.quadraticCurveTo(2 - 1.4 * L.x, -2 - 1.4 * L.y, -2 + j - 1.4 * L.x, 17 - 1.4 * L.y);
    ctx.stroke();
    // le grain : quatorze eclats, moitie sombres moitie clairs, toujours les memes
    for (let i = 0; i < 14; i++) {
      const an = HACHE(i, j) * Math.PI * 2,
        r = HACHE(i + 9, j) * 19;
      ctx.globalAlpha = 0.09 + 0.09 * HACHE(i + 3, j);
      ctx.fillStyle = i % 2 ? '#0d1218' : '#a9b5c5';
      ctx.beginPath();
      ctx.arc(
        Math.cos(an) * r,
        Math.sin(an) * r * 0.88,
        0.8 + 1.2 * HACHE(i + 5, j),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // la mousse : trois touffes sur le dessus, du cote eclaire, avec leur pointe plus claire
    for (let i = 0; i < 3; i++) {
      const an = -Math.PI / 2 + (HACHE(i + 2, j) - 0.5) * 1.6,
        r = 9 + 6 * HACHE(i + 7, j);
      const x = Math.cos(an) * r + L.x * 4,
        y = Math.sin(an) * r * 0.8;
      ctx.fillStyle = 'rgba(78,110,66,0.58)';
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + 2.6 * HACHE(i, j), 2.3 + 1.2 * HACHE(i + 1, j), an, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(148,182,126,0.26)';
      ctx.beginPath();
      ctx.ellipse(x - L.x * 1.2, y - 1.4, 2.4 + 1.3 * HACHE(i, j), 1.2, an, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // le liseret : seulement les aretes dont la normale regarde la lumiere
    ctx.strokeStyle = 'rgba(' + L.te + ',' + 0.46 * L.k + ')';
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        q = pts[(i + 1) % pts.length],
        mx = (p.x + q.x) / 2,
        my = (p.y + q.y) / 2;
      const n = Math.hypot(mx, my) || 1;
      if ((mx / n) * L.x + (my / n) * L.y > 0.15) continue; // arete a l'ombre, pas de liseret
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  }

  // Cache de pierres. Le corps d'une pierre ne depend que de sa variante `j` et de la lumiere,
  // jamais de sa position ni de son animation de sortie, qui sont des transformations posees par
  // l'appelant. On le peignait entierement a chaque image, pour chaque pierre : deux degrades, un
  // clip, quatorze eclats de grain, six ellipses de mousse et onze aretes de liseret. Mesure au
  // profileur, `routines/profil-rendu.js` : 2170 des 4582 operations canvas par image, soit 47 %.
  // On le peint donc une fois par variante et par palier de lumiere, dans un canvas hors ecran.
  const ROC_RS = 40,
    cacheRocher = new Map();
  let cacheRocherCle = null;
  function spriteRocher(j) {
    const cle = Math.round(((((reglages.heure || 0) % 1) + 1) % 1) * 180);
    if (cle !== cacheRocherCle) {
      cacheRocher.clear();
      cacheRocherCle = cle;
    }
    let s = cacheRocher.get(j);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = 2 * ROC_RS;
    s.height = 2 * ROC_RS;
    const avant = ctx;
    ctx = s.getContext('2d');
    ctx.translate(ROC_RS, ROC_RS);
    try {
      corpsRocher(j);
    } finally {
      ctx = avant;
    }
    cacheRocher.set(j, s);
    return s;
  }
  // Remplace un appel a corpsRocher : meme dessin, meme origine, une seule operation canvas.
  function poserRocher(j) {
    ctx.drawImage(spriteRocher(j), -ROC_RS, -ROC_RS);
  }
  function peindreRochers() {
    rochers.forEach((r) => {
      const p = px(r.x, r.y),
        j = ((r.x * 13 + r.y * 7) % 7) - 3;
      if (r.t < ALERTE) {
        const u = r.t / ALERTE,
          lev = u * u * (3 - 2 * u); // le bombement, doux aux deux bouts
        // Elle perce tot, et sa montee a un ressaut : elle force, elle glisse d'un cheveu vers 60 %,
        // puis elle passe. C'est ce temps mort qui la rend pesante au lieu de jaillir.
        const sor = Math.max(0, (u - 0.18) / 0.82);
        let emer = sor * sor * (3 - 2 * sor);
        emer -=
          0.085 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (sor - 0.46) / 0.26)) * Math.PI));
        emer = Math.max(0, Math.min(1, emer));
        ctx.save();
        // l'ombre portee du monticule, qui s'allonge a mesure qu'il monte
        ctx.globalAlpha = 0.3 * lev;
        ctx.fillStyle = '#050907';
        ctx.beginPath();
        ctx.ellipse(p.x + 6 * lev, p.y + 13, 26 * lev + 6, 8 * lev + 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // la terre qui se souleve, puis se fend
        bosse(p.x, p.y + 6, 20 + 14 * lev, 9 + 9 * lev, lev);
        fissure(p.x, p.y + 4, lev, j);
        // la pierre sort du sol : on ne montre que ce qui depasse la ligne de terre
        if (emer > 0.001) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(p.x - 42, p.y - 48, 84, 48 + 12);
          ctx.clip();
          ctx.translate(p.x, p.y + 34 * (1 - emer));
          ctx.rotate((1 - emer) * 0.22 * (j > 0 ? 1 : -1));
          ctx.scale(0.86 + 0.14 * emer, 0.86 + 0.14 * emer);
          poserRocher(j);
          ctx.restore();
        }
        // les quartiers de sol basculent par-dessus le pied de la pierre : c'est elle qui force
        plaques(p.x, p.y + 5, lev, j);
        // les mottes arrachees devalent le flanc pendant la sortie
        for (let i = 0; i < 3; i++) motte(p.x, p.y, (emer - (0.3 + 0.16 * i)) / 0.42, i, j);
        ctx.restore();
        return;
      }
      // une fois sortie, elle se cale : un tassement sec, vers le bas seulement, jamais de rebond
      const d = r.t - ALERTE,
        k = d < 0.18 ? Math.sin((d / 0.18) * Math.PI) : 0;
      const sx = 1 + 0.05 * k,
        sy = 1 - 0.08 * k;
      const f = r.t > VIEROCHER - 2 ? (VIEROCHER - r.t) / 2 : 1;
      ctx.save();
      // la terre remuee reste visible au pied, puis se tasse
      ctx.globalAlpha = f * (d < 1.4 ? 1 - d / 1.4 : 0) * 0.8;
      if (ctx.globalAlpha > 0.01) bosse(p.x, p.y + 8, 30, 14, 0.7);
      // l'anneau de poussiere chassee par le choc
      if (d < 0.45) {
        const q = d / 0.45;
        ctx.globalAlpha = f * (1 - q) * 0.42;
        ctx.strokeStyle = 'rgba(168,176,150,1)';
        ctx.lineWidth = 3 - 2 * q;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 13, 20 + 34 * q, 7 + 12 * q, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = f * 0.45;
      ctx.fillStyle = '#050907';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 15, 21 * sx, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = f;
      ctx.translate(p.x, p.y);
      ctx.scale(sx, sy);
      poserRocher(j);
      ctx.restore();
    });
  }

  // La ronce : une liane, pas un trait. Le corps est un contour rempli, epais a la racine et fin a
  // la pointe, avec son ombre de contact au sol, un ruban de lumiere du cote de la source, des
  // feuilles a nervure et des epines crochues qui n'apparaissent que sur la part qui tue.
  function pointsRonce(R) {
    const pts = [];
    R.seg.forEach((g, i) => {
      const p = px(g.x, g.y),
        u = Math.min(1, g.t / RONCE_ALERTE),
        ouv = u * u * (3 - 2 * u);
      const v = R.seg[i - 1] || R.seg[i + 1];
      if (!v || ouv >= 1) {
        pts.push({ x: p.x, y: p.y, dur: u >= 1, ouv: ouv, i: i });
        return;
      }
      const q = px(v.x, v.y);
      pts.push({
        x: q.x + (p.x - q.x) * ouv,
        y: q.y + (p.y - q.y) * ouv,
        dur: false,
        ouv: ouv,
        i: i,
      });
    });
    return pts;
  }
  // Le contour de la tige : on longe la ligne d'un cote, on revient de l'autre, la demi-epaisseur
  // decroit vers la pointe. C'est ce qui fait une plante plutot qu'un tuyau d'epaisseur constante.
  function contourRonce(pts, ep, dx, dy) {
    const n = pts.length;
    const nor = (i) => {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(n - 1, i + 1)];
      const vx = b.x - a.x,
        vy = b.y - a.y,
        l = Math.hypot(vx, vy) || 1;
      return { x: -vy / l, y: vx / l };
    };
    const e = (i) =>
      ep * (1 - 0.52 * (i / Math.max(1, n - 1))) * Math.min(1, 0.35 + 0.65 * pts[i].ouv);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const u = nor(i),
        w = e(i);
      const x = pts[i].x + u.x * w + (dx || 0),
        y = pts[i].y + u.y * w + (dy || 0);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    for (let i = n - 1; i >= 0; i--) {
      const u = nor(i),
        w = e(i);
      ctx.lineTo(pts[i].x - u.x * w + (dx || 0), pts[i].y - u.y * w + (dy || 0));
    }
    ctx.closePath();
  }
  function feuille(x, y, an, L, clair, f, ouv) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(an);
    ctx.globalAlpha = f * Math.min(1, ouv * 1.2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(L * 0.5, -L * 0.34, L, 0);
    ctx.quadraticCurveTo(L * 0.5, L * 0.34, 0, 0);
    ctx.fillStyle = clair ? '#46603a' : '#2c3d25';
    ctx.fill();
    ctx.strokeStyle = 'rgba(158,190,138,0.30)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(L * 0.08, 0);
    ctx.lineTo(L * 0.86, 0);
    ctx.stroke();
    ctx.restore();
  }
  function epine(x, y, an, L, te, f) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(an);
    ctx.globalAlpha = f * 0.92;
    ctx.beginPath();
    ctx.moveTo(0, -2.4);
    ctx.quadraticCurveTo(L * 0.72, -L * 0.3, L, -L * 0.06); // le crochet, courbe vers l'arriere
    ctx.quadraticCurveTo(L * 0.52, L * 0.12, 0, 2.4);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, '#5d7a4c');
    g.addColorStop(1, 'rgba(' + te + ',0.92)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
  // Cache de ronces. Le dessin d'une liane ne depend que de ses noeuds, de leur ouverture, de son
  // effacement `f` et de la lumiere : jamais du temps qui passe. Or il etait entierement refait a
  // chaque image, deux feuilles et trois epines par noeud, chacune avec son save, sa rotation et
  // ses courbes. Mesure au profileur : 1406 des 4582 operations canvas par image, soit 31 %.
  // Une ronce posee ne bouge plus, donc son sprite ne se repeint qu'a l'ouverture et a la mort.
  // Le decalage est entier, pour que la recopie soit au pixel pres et non reechantillonnee.
  const RON_M = 26;
  function peindreRonces() {
    const L = lumiere();
    const cleL = Math.round(((((reglages.heure || 0) % 1) + 1) % 1) * 180);
    ronces.forEach((R) => {
      const f = R.t > VIERONCE - 2 ? (VIERONCE - R.t) / 2 : 1;
      const pts = pointsRonce(R);
      if (pts.length < 1) return;
      let ax = Infinity,
        ay = Infinity,
        bx = -Infinity,
        by = -Infinity;
      for (const p of pts) {
        if (p.x < ax) ax = p.x;
        if (p.x > bx) bx = p.x;
        if (p.y < ay) ay = p.y;
        if (p.y > by) by = p.y;
      }
      const ox = Math.floor(ax - RON_M),
        oy = Math.floor(ay - RON_M);
      let sig = cleL + '|' + f.toFixed(2) + '|' + ox + '|' + oy + '|' + pts.length;
      for (const q of pts) sig += '|' + Math.round(q.ouv * 24) + (q.dur ? 'd' : '');
      if (R.sig !== sig) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(bx + RON_M) - ox);
        c.height = Math.max(1, Math.ceil(by + RON_M) - oy);
        const avant = ctx;
        ctx = c.getContext('2d');
        ctx.translate(-ox, -oy);
        try {
          corpsRonce(pts, f, L, R);
        } finally {
          ctx = avant;
        }
        R.sprite = c;
        R.sig = sig;
      }
      ctx.drawImage(R.sprite, ox, oy);
    });
  }
  function corpsRonce(pts, f, L, R) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // l'ombre de contact : la meme tige, decalee au sol, floue par un degre d'alpha
    ctx.globalAlpha = f * 0.42;
    ctx.fillStyle = '#070c07';
    contourRonce(pts, 8.5, 2.5, 6);
    ctx.fill();
    ctx.globalAlpha = f * 0.22;
    contourRonce(pts, 11, 3.5, 9);
    ctx.fill();
    // le corps, degrade le long de la liane : sombre a la racine, plus vert vers la pointe vive
    ctx.globalAlpha = f;
    const q0 = pts[0],
      q1 = pts[pts.length - 1];
    const gb = ctx.createLinearGradient(q0.x, q0.y, q1.x, q1.y);
    gb.addColorStop(0, '#1b2616');
    gb.addColorStop(0.55, '#26331d');
    gb.addColorStop(1, '#354823');
    contourRonce(pts, 8);
    ctx.fillStyle = gb;
    ctx.fill();
    // le ruban de lumiere, du cote de la source, plus fin que le corps
    ctx.globalAlpha = f * (0.3 + 0.34 * L.k);
    contourRonce(pts, 3.1, L.x * 2.6, L.y * 2.6);
    ctx.fillStyle = 'rgba(' + L.te + ',0.55)';
    ctx.fill();
    // les feuilles : deux par noeud, jamais symetriques, la claire du cote du jour
    pts.forEach((p, i) => {
      const v = pts[i - 1] || pts[i + 1] || p;
      const an = Math.atan2(p.y - v.y, p.x - v.x),
        h = HACHE(i, R.seg.length);
      for (let k = 0; k < 2; k++) {
        const cote = k ? 1 : -1;
        const ec = an + cote * (0.78 + 0.34 * h);
        const clair = Math.cos(ec) * L.x + Math.sin(ec) * L.y < 0;
        feuille(p.x, p.y, ec, 8.5 + 3.5 * HACHE(i + k, 3), clair, f, p.ouv);
      }
    });
    // les epines : uniquement sur la part dure. Elles sont le seul signal que ca tue.
    pts.forEach((p, i) => {
      if (!p.dur) return;
      const v = pts[i - 1] || pts[i + 1] || p;
      const an = Math.atan2(p.y - v.y, p.x - v.x);
      for (let k = 0; k < 3; k++) {
        const ec = an + (k === 1 ? -Math.PI / 2 : Math.PI / 2) + (k - 1) * 0.38;
        epine(p.x, p.y, ec, 7.5 + 2 * HACHE(i + k, 5), L.te, f);
      }
    });
    ctx.restore();
  }

  // La course dans le ciel, lisible sans un mot : le soleil monte a gauche, la lune a droite.
  // Une baie mangee, le soleil gagne un cran ; un rocher pose, la lune gagne le sien. Premier en haut.
  let CIEL_BAS = 1250,
    CIEL_HAUT = 260;
  const CIEL_X = 62;

  function astre(x, u, sun, pulse) {
    const y = CIEL_BAS + (CIEL_HAUT - CIEL_BAS) * Math.min(1, u);
    const teinte = sun ? OR : BLEU,
      rgb = sun ? '242,197,124' : '143,168,216';
    ctx.save();
    // le chemin deja parcouru reste allume derriere l'astre
    const g = ctx.createLinearGradient(0, CIEL_BAS, 0, y);
    g.addColorStop(0, 'rgba(' + rgb + ',0)');
    g.addColorStop(1, 'rgba(' + rgb + ',0.5)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, CIEL_BAS);
    ctx.lineTo(x, y);
    ctx.stroke();
    // la ligne d'arrivee, tout en haut
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.6 + (sun ? 0 : Math.PI));
    ctx.strokeStyle = teinte;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 24, CIEL_HAUT - 38);
    ctx.lineTo(x + 24, CIEL_HAUT - 38);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // le cran vient d'etre gagne : l'astre respire une fois
    const k = Math.max(0, 1 - pulse / 0.45),
      R = 44 + 13 * k;
    ctx.shadowColor = 'rgba(' + rgb + ',' + (0.75 + 0.25 * k) + ')';
    ctx.shadowBlur = 40 + 40 * k;
    ctx.fillStyle = teinte;
    if (sun) {
      ctx.beginPath();
      ctx.arc(x, y, R * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 4;
      ctx.strokeStyle = teinte;
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2 + t * 0.25;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(an) * R * 0.85, y + Math.sin(an) * R * 0.85);
        ctx.lineTo(x + Math.cos(an) * R * 1.15, y + Math.sin(an) * R * 1.15);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, R * 0.64, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x + R * 0.34, y - R * 0.2, R * 0.58, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function peindreCourse() {
    if (!manche || duel()) return; // duel : pas d'astres, les demi-anneaux et la serie suffisent
    astre(CIEL_X, Math.min(1, manche.cielSun / manche.hautSun), true, manche.pulseSun);
    astre(W - CIEL_X, Math.min(1, manche.cielMoon / manche.hautMoon), false, manche.pulseMoon);
  }

  // Mode de base, sans un mot : l'anneau du plateau est le METRE DE VICTOIRE GLOBAL. Il compte la
  // progression sur tout le run, des grades deja faits jusqu'au dernier. Il monte a chaque bouchee et
  // fait le tour complet au dernier grade. Il PEUT redescendre : chaque coeur arrache par la meute
  // (rose premium) recule la progression, et la portion perdue brule alors en rouge avant de refluer.
  // Le rail gauche, lui, montre le detail du grade courant (jauge qui se remplit puis se vide a chaque
  // grade) : deux echelles distinctes, macro au bord et micro dans le rail.

  // Le compteur de serie, sous le plateau. Emplacement mesure : le plateau finit a Y0+ROWS*CELL,
  // soit 1220, et le fil de commentaires TikTok demarre a 1290. La bande 1226-1284 est le seul
  // endroit a la fois dans la zone sure et jamais recouvert par l'interface.
  // Il se lit sans un mot : a gauche une tete de serpent et son nombre de manches gagnees, a
  // droite une foule et le sien. Pas de libelle, comme l'anneau et les astres.
  // Idee d'Abdel : le mode versus place le soleil a gauche et la lune a droite, un camp par cote.
  // Le compteur reprend la meme grammaire. En mode de base `peindreCourse` ne dessine rien, donc
  // les deux bandes laterales, x 40 a 124 et 956 a 1040, sont libres sur toute la hauteur et sont
  // dans la zone sure (SR_X=40, SR_W=1000). Le plateau va de x=124 a x=956, il n'est pas touche.
  // Poser un camp par cote libere la hauteur, qui etait le vrai plafond de la version en bas :
  // entre l'anneau (1234) et le fil de commentaires (1290) il n'y avait que 56 px.
  // La hauteur choisie, 258 a 400, est celle du haut des colonnes d'astres (CIEL_HAUT=260).
  // Les colonnes laterales sont enfin larges. L'anneau va de X0-14=150 a X0+COLS*CELL+14=930, il
  // reste donc 150 px de chaque cote. En hauteur, la bande libre est celle entre le bas du chrome
  // du haut (260) et le sommet de la colonne de widgets cadeaux de TikTok (392) : 132 px.
  // La plaque prend 266 a 390, ce qui laisse 6 px sous le chrome et 2 px au-dessus des widgets.
  // Les deux camps tiennent dans UNE barre horizontale, centree, juste sous le plateau. Choix
  // d'Abdel : le tableau d'affichage se lit sous le jeu, comme une borne d'arcade, pas sur le cote.
  // La bande sous l'anneau (1232) et le fil de commentaires est etroite, la barre est donc basse
  // et compacte : glyphe puis chiffre, cote a cote, un filet vertical entre les deux camps.
  let SC_CY = 1276; // ligne centrale de la barre, avec un peu d'air sous l'anneau
  const SC_ECART = 122; // ecart entre les centres des deux camps, de part et d'autre de W/2
  const SC_GX = 32; // ecart glyphe-chiffre a l'interieur d'un camp
  const SC_R = 13; // rayon du glyphe, compact
  const SC_BW = 250,
    SC_BH = 48; // largeur et hauteur de la plaque de fond, reduites
  const doux01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  // Le gonflement d'un chiffre qui vient de marquer : une poussee franche puis un retour amorti.
  // 0,9 s, pas plus : au-dela le chiffre danse encore quand le spectateur a deja tourne la page.
  function bond(p) {
    if (p >= 0.9) return 1;
    const u = p / 0.9;
    // plafonne a 1,25 : au-dela, un chiffre a deux chiffres deborde de la bande de 84 px
    return 1 + 0.3 * Math.sin(Math.PI * doux01(u * 1.25)) * (1 - u);
  }

  // La tete de serpent du compteur : la meme silhouette qu'en jeu, en petit. Deux yeux, pas un
  // pictogramme abstrait : c'est ce qui rend le camp evident sans legende.
  function glypheSerpent(x, y, r, teinte) {
    ctx.fillStyle = teinte || '#e8f1dc';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // le cou, un moignon vers l'arriere, pour qu'on lise une tete et non une bille
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 1.15;
    ctx.strokeStyle = teinte || '#d9e7cc';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.2, y + r * 0.35);
    ctx.lineTo(x - r * 1.25, y + r * 0.72);
    ctx.stroke();
    ctx.fillStyle = '#1b2a1f';
    for (const o of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + r * 0.36, y + o * r * 0.36, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Le camp des spectateurs, ce sont des gens. Deux essais rates avant celui-ci : trois disques qui
  // se chevauchaient, lus comme une icone de chat, puis une pierre, qui disait ce que le camp POSE
  // et non ce qu'il EST. Ici, deux silhouettes tete-et-epaules franchement separees par un vide,
  // la plus petite en retrait : c'est le signe universel de « des gens », et deux suffisent a dire
  // le pluriel. Le vide entre elles est creuse en `destination-out`, sinon les deux corps fusionnent
  // en une tache a cette taille.
  function personne(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y - r * 0.95, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // les epaules : un arc large ferme a plat, la forme qui fait lire un buste et non un champignon
    ctx.beginPath();
    ctx.moveTo(x - r * 1.05, y + r * 1.15);
    ctx.quadraticCurveTo(x - r * 1.02, y + r * 0.02, x, y + r * 0.02);
    ctx.quadraticCurveTo(x + r * 1.02, y + r * 0.02, x + r * 1.05, y + r * 1.15);
    ctx.closePath();
    ctx.fill();
  }

  // Le vide entre les deux silhouettes se creuse en `destination-out`. Sur le canvas principal ce
  // mode trouerait l'image entiere, fond compris, puisque le compteur est dessine par-dessus tout.
  // Le glyphe est donc cuit une seule fois dans un sprite hors ecran, ou le decoupage ne concerne
  // que lui. Bonus : il est paye une fois pour toute la partie et non a chaque image.
  const GENS_RS = 48;
  let spriteGens = null;
  function glypheGens(x, y, r) {
    if (!spriteGens) {
      const s = document.createElement('canvas');
      s.width = s.height = 2 * GENS_RS;
      const avant = ctx;
      ctx = s.getContext('2d');
      try {
        ctx.translate(GENS_RS, GENS_RS);
        const R = GENS_RS * 0.66;
        ctx.fillStyle = BLEU;
        personne(R * 0.86, -R * 0.16, R * 0.74);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = R * 0.3;
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#000';
        personne(-R * 0.3, 0, R * 0.96);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = BLEU;
        personne(-R * 0.3, 0, R * 0.86);
      } finally {
        ctx = avant;
      }
      spriteGens = s;
    }
    const k = r / (GENS_RS * 0.66),
      w = 2 * GENS_RS * k;
    ctx.drawImage(spriteGens, x - w / 2, y - w / 2, w, w);
  }

  // Un camp : son glyphe puis son nombre de manches gagnees, cote a cote sur la ligne SC_CY.
  // Seuls le glyphe et le chiffre respirent quand le camp marque, jamais la plaque : sinon la
  // barre entiere danse et les deux camps ne se comparent plus.
  // teinte (duel) : les deux camps sont des viperes, chacune dans sa couleur
  // miroir (camp de droite) : le chiffre passe cote centre et le glyphe a l'extremite, comme une
  // plaque de score de football : glyphe, chiffre | chiffre, glyphe
  function campBarre(cx, n, sun, pulse, teinte, miroir) {
    const sg = miroir ? -1 : 1;
    const k = bond(pulse),
      vif = Math.max(0, 1 - pulse / 0.9);
    const lueur = teinte ? teinte : sun ? 'rgba(242,197,124,0.85)' : 'rgba(143,168,216,0.85)';
    ctx.save();
    ctx.translate(cx - sg * SC_GX, SC_CY);
    ctx.scale(sg * k, 1); // miroir : le glyphe de droite regarde dans l'autre sens
    if (vif > 0.02) {
      ctx.shadowColor = lueur;
      ctx.shadowBlur = 26 * vif;
    }
    if (sun || teinte) glypheSerpent(0, 0, SC_R, teinte);
    else glypheGens(0, 0, SC_R);
    ctx.restore();

    ctx.save();
    ctx.translate(cx + sg * SC_GX, SC_CY);
    ctx.scale(k, k);
    if (vif > 0.02) {
      ctx.shadowColor = lueur;
      ctx.shadowBlur = 24 * vif;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 30px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = teinte || (sun ? OR : BLEU);
    ctx.fillText(String(n), 0, 1);
    ctx.restore();
  }

  // HUD de grade : rail vertical d'icones dans la gouttiere gauche (x=14..150, y=285..1115).
  // Gouttiere gauche = x=0..164, libre de chrome TikTok entre y=260 et y=1133 (Z_BANNIERE).
  // Aucun mot, aucun overlay sur les zones TikTok reservees.
  // De haut en bas : pips de grade, jauge verticale, coeurs de vie, icones de capacites.

  // Legende des cadeaux (duel) : sous le compteur, une colonne par camp. Chaque ligne = image du cadeau
  // TikTok (cadeaux/*.png, fond transparent), prix en coins, effet. Etape 1 (Abdel) : les deux roses.
  const CADEAUX_DUEL = {
    or: [
      { img: 'rose-rouge', prix: 1, effet: '+1' },
      { img: 'rose-10', prix: 10, effet: 'speed 10s' },
      { img: 'bouquet', prix: 20, effet: 'steal 15%' },
      { img: 'bagel', prix: 30, effet: 'shield 15s' },
      { img: 'teddy', prix: 100, effet: '+1 life' },
    ],
    ombre: [
      { img: 'rose-blanche', prix: 1, effet: '+1' },
      { img: 'dyno', prix: 10, effet: 'speed 10s' },
      { img: 'parfum', prix: 20, effet: 'steal 15%' },
      { img: 'capybara', prix: 30, effet: 'shield 15s' },
      { img: 'hand-heart', prix: 100, effet: '+1 life' },
    ],
    // a venir, une ligne par cadeau : {img:'dyno',prix:10,effet:'speed 10s'}, {prix:30,effet:'steal 15%'}, {prix:50,effet:'shield 15s'}, {prix:100,effet:'+1 life'}
  };
  const imgCadeaux = {};
  function imageCadeau(nom) {
    if (imgCadeaux[nom] !== undefined) return imgCadeaux[nom];
    if (typeof Image === 'undefined') {
      imgCadeaux[nom] = null;
      return null;
    }
    const im = new Image();
    im.src = 'assets/gifts/' + nom + '.png';
    imgCadeaux[nom] = im;
    return im;
  }
  function peindreLegendeDuel() {
    if (!duel()) return;
    // Compact (Abdel : 5 cadeaux par cote a venir, anglais, sans 'pour X', la couleur suffit) :
    // 5 lignes de 92 px tiennent entre 1340 et 1800.
    const Y = L.legY,
      LH = 92,
      IMG = 64,
      CW = 400;
    ctx.save();
    const mode = reglages.retourCadeau || 'aucun';
    [
      ['or', L.legCxG, OR, '242,197,124'],
      ['ombre', L.legCxD, OMBRE, '180,212,222'],
    ].forEach(([camp, cx, teinte, rgb]) => {
      const liste = CADEAUX_DUEL[camp],
        ci = camp === 'or' ? 0 : 1,
        cc = corps[ci];
      // G4 : bandeau donateur au-dessus de la colonne, il glisse vers le haut et s'efface
      const bd = bandeauCadeau[ci];
      if (mode === 'G4' && bd && t - bd.t < 2.6) {
        const a = t - bd.t,
          en = Math.min(1, a / 0.35),
          so = a > 2 ? 1 - (a - 2) / 0.6 : 1,
          e2 = 1 - Math.pow(1 - en, 3);
        ctx.globalAlpha = Math.max(0, e2 * so);
        ctx.fillStyle = teinte;
        ctx.font = '700 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bd.texte, cx, Y - LH / 2 - 16 + (1 - e2) * 18);
        ctx.globalAlpha = 1;
      }
      liste.forEach((c, k) => {
        const y = Y + k * LH;
        // retour visuel : age du dernier cadeau de cette ligne, et part restante de l'effet s'il dure
        const rc = retourCadeaux[ci][k],
          age = rc ? t - rc.t : 99;
        const reste = cc
          ? k === 1
            ? Math.min(1, (cc.surgeT || 0) / TEMPO_DUR)
            : k === 3
              ? Math.min(1, (cc.bouclierT || 0) / BOUCLIER_DUR)
              : 0
          : 0;
        if (mode === 'G1' && (age < 1.8 || reste > 0)) {
          const flash = age < 1.8 ? Math.pow(1 - age / 1.8, 1.5) : 0;
          ctx.fillStyle =
            'rgba(' +
            rgb +
            ',' +
            (0.3 * flash + (reste > 0 ? 0.1 + 0.03 * Math.sin(t * 2.4) : 0)) +
            ')';
          ctx.beginPath();
          ctx.roundRect(cx - CW / 2, y - LH / 2 + 6, CW, LH - 12, 22);
          ctx.fill();
        }
        // plaque
        ctx.fillStyle = 'rgba(6,11,8,0.46)';
        ctx.beginPath();
        ctx.roundRect(cx - CW / 2, y - LH / 2 + 6, CW, LH - 12, 22);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(' + rgb + ',0.35)';
        ctx.stroke();
        // image du cadeau, a gauche de la plaque
        // Ombre en miroir d'Or (Abdel, 2026-09-19) : image et pastille de prix a DROITE, effet aligne a droite
        const miroir = camp === 'ombre';
        const im = imageCadeau(c.img);
        const ix = miroir ? cx + CW / 2 - 16 - IMG : cx - CW / 2 + 16,
          iy = y - IMG / 2;
        // G2 : l'image sursaute ; G3 : elle sautille
        const saut = mode === 'G2' && age < 0.3 ? 1 + 0.18 * Math.sin((age / 0.3) * Math.PI) : 1,
          hop = mode === 'G3' && age < 0.25 ? -9 * Math.sin((age / 0.25) * Math.PI) : 0;
        if (im && im.complete && im.naturalWidth) {
          const d2 = IMG * saut;
          ctx.drawImage(im, ix + IMG / 2 - d2 / 2, iy + IMG / 2 - d2 / 2 + hop, d2, d2);
        } else {
          ctx.fillStyle = 'rgba(' + rgb + ',0.25)';
          ctx.beginPath();
          ctx.arc(ix + IMG / 2, y, IMG * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }
        // prix : pastille coin
        // prix (pastille teintee) puis effet, sur une seule ligne
        const pcx = miroir ? ix - 18 - 17 : ix + IMG + 18 + 17; // centre de la pastille de prix
        ctx.fillStyle = teinte;
        ctx.beginPath();
        ctx.arc(pcx, y, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0c110e';
        ctx.font = '900 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(c.prix), pcx, y + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '700 30px system-ui, sans-serif';
        ctx.textAlign = miroir ? 'right' : 'left';
        ctx.fillText(c.effet, miroir ? pcx - 29 : pcx + 29, y + 1);
        ctx.textAlign = 'left';
        if (mode === 'G1') {
          if (rc && age < 2.2 && reglages.nomsDonateurs !== false) {
            ctx.globalAlpha = age < 1.6 ? 1 : Math.max(0, 1 - (age - 1.6) / 0.6);
            ctx.fillStyle = teinte;
            ctx.font = '600 19px system-ui, sans-serif';
            ctx.textAlign = miroir ? 'left' : 'right';
            ctx.fillText(rc.pseudo, miroir ? cx - CW / 2 + 18 : cx + CW / 2 - 18, y - LH / 2 + 24);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
          }
          if (reste > 0) {
            ctx.strokeStyle = 'rgba(' + rgb + ',0.95)';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx - CW / 2 + 24, y + LH / 2 - 9);
            ctx.lineTo(cx - CW / 2 + 24 + (CW - 48) * reste, y + LH / 2 - 9);
            ctx.stroke();
          }
        }
        if (mode === 'G2' && reste > 0) {
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.beginPath();
          ctx.arc(ix + IMG / 2, y, IMG / 2 + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = teinte;
          ctx.beginPath();
          ctx.arc(ix + IMG / 2, y, IMG / 2 + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reste);
          ctx.stroke();
        }
        if (mode === 'G3' && rc && rc.n > 0) {
          const bx = miroir ? ix + 6 : ix + IMG - 6,
            by = y - IMG / 2 + 8,
            pop = age < 0.3 ? 1 + 0.35 * Math.sin((age / 0.3) * Math.PI) : 1;
          ctx.fillStyle = teinte;
          ctx.beginPath();
          ctx.arc(bx, by, 15 * pop, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0c110e';
          ctx.font = '900 17px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(rc.n), bx, by + 1);
          ctx.textAlign = 'left';
        }
      });
    });
    ctx.restore();
  }
  // Bandeau de cadeaux qui defile (modele Livecade, valide en direction par Abdel 2026-09-22) : un ruban
  // horizontal au bas de l'ecran qui glisse en continu, chaque cadeau = son image ANIMEE (wiggle) + son EFFET
  // en toutes lettres. AUCUN prix, AUCUN verbe d'envoi : c'est un menu de jeu, pas une vitrine d'achat.
  const EFFET_LABEL = {
    '+1': 'BERRY',
    'speed 10s': 'SPEED',
    'steal 15%': 'STEAL',
    'shield 15s': 'SHIELD',
    '+1 life': 'LIFE',
  };
  const tuilesCamp = {};
  function tuiles(camp) {
    if (tuilesCamp[camp]) return tuilesCamp[camp];
    const t = CADEAUX_DUEL[camp].map((c) => ({
      img: c.img,
      label: EFFET_LABEL[c.effet] || c.effet.toUpperCase(),
    }));
    tuilesCamp[camp] = t;
    return t;
  }
  // un ruban compact : boite etroite posee sur un cote ; la liste d'un camp glisse, boucle, et s'ESTOMPE en
  // fondu transparent aux deux bords (rendu sur un calque a part puis efface aux extremites). Icones animees
  // (wiggle), label teinte du camp. Pas de prix.
  const calquesRuban = {};
  function calqueRuban(camp, bw, bh) {
    let c = calquesRuban[camp];
    if (!c) {
      if (typeof document === 'undefined') return null;
      c = document.createElement('canvas');
      calquesRuban[camp] = c;
    }
    if (c.width !== bw) {
      c.width = bw;
      c.height = bh;
    }
    return c;
  }
  // Pictogramme de l'EFFET dans la DA du jeu (memes traces que le rail duel : ecusson, coeur, eclair, baie),
  // dessine sur un contexte donne. C'est l'element principal de chaque ligne ; le cadeau TikTok n'est qu'un
  // petit badge a cote (consigne Abdel : « the effect explicit action in the game accompagne de l'icone »).
  function glypheEffet(o, label, x, y, s, rgb) {
    o.save();
    o.lineJoin = 'round';
    o.lineCap = 'round';
    if (label === 'SHIELD') {
      o.beginPath();
      o.moveTo(x, y - s);
      o.lineTo(x + s * 0.8, y - s * 0.6);
      o.lineTo(x + s * 0.8, y + s * 0.1);
      o.bezierCurveTo(x + s * 0.8, y + s * 0.7, x, y + s, x, y + s);
      o.bezierCurveTo(x, y + s, x - s * 0.8, y + s * 0.7, x - s * 0.8, y + s * 0.1);
      o.lineTo(x - s * 0.8, y - s * 0.6);
      o.closePath();
      o.fillStyle = 'rgba(' + rgb + ',0.92)';
      o.shadowColor = 'rgba(' + rgb + ',0.6)';
      o.shadowBlur = 10;
      o.fill();
      o.shadowBlur = 0;
      o.lineWidth = 2.2;
      o.strokeStyle = 'rgba(255,255,255,0.85)';
      o.stroke();
      o.lineWidth = 2.6;
      o.strokeStyle = 'rgba(12,17,14,0.7)';
      o.beginPath();
      o.moveTo(x, y - s * 0.55);
      o.lineTo(x, y + s * 0.5);
      o.moveTo(x - s * 0.45, y - s * 0.1);
      o.lineTo(x + s * 0.45, y - s * 0.1);
      o.stroke();
    } else if (label === 'LIFE') {
      o.beginPath();
      o.moveTo(x, y + s * 0.85);
      o.bezierCurveTo(x - s * 1.15, y - s * 0.05, x - s * 0.6, y - s * 0.95, x, y - s * 0.35);
      o.bezierCurveTo(x + s * 0.6, y - s * 0.95, x + s * 1.15, y - s * 0.05, x, y + s * 0.85);
      o.closePath();
      o.fillStyle = 'rgba(228,64,58,0.95)';
      o.shadowColor = 'rgba(228,64,58,0.7)';
      o.shadowBlur = 12;
      o.fill();
      o.shadowBlur = 0;
      o.lineWidth = 2.2;
      o.strokeStyle = 'rgba(255,255,255,0.85)';
      o.stroke();
    } else if (label === 'SPEED') {
      o.beginPath();
      o.moveTo(x - s * 0.05, y - s);
      o.lineTo(x + s * 0.6, y - s);
      o.lineTo(x + s * 0.1, y - s * 0.15);
      o.lineTo(x + s * 0.55, y - s * 0.15);
      o.lineTo(x - s * 0.35, y + s);
      o.lineTo(x - s * 0.05, y + s * 0.12);
      o.lineTo(x - s * 0.6, y + s * 0.12);
      o.closePath();
      o.fillStyle = 'rgba(' + rgb + ',0.95)';
      o.shadowColor = 'rgba(' + rgb + ',0.65)';
      o.shadowBlur = 12;
      o.fill();
      o.shadowBlur = 0;
      o.lineWidth = 2;
      o.strokeStyle = 'rgba(255,255,255,0.85)';
      o.stroke();
    } else if (label === 'BERRY') {
      // la baie du plateau : rond vert lumineux
      o.fillStyle = 'rgba(130,214,120,0.96)';
      o.shadowColor = 'rgba(130,214,120,0.8)';
      o.shadowBlur = 14;
      o.beginPath();
      o.arc(x, y, s * 0.72, 0, Math.PI * 2);
      o.fill();
      o.shadowBlur = 0;
      o.lineWidth = 2.2;
      o.strokeStyle = 'rgba(255,255,255,0.85)';
      o.stroke();
      o.fillStyle = 'rgba(255,255,255,0.55)';
      o.beginPath();
      o.arc(x - s * 0.25, y - s * 0.25, s * 0.18, 0, Math.PI * 2);
      o.fill();
    } else if (label === 'STEAL') {
      // fleche courbe qui ramene vers soi : le vol d'une part de l'adversaire
      o.lineWidth = 4.5;
      o.strokeStyle = 'rgba(' + rgb + ',0.95)';
      o.shadowColor = 'rgba(' + rgb + ',0.6)';
      o.shadowBlur = 10;
      o.beginPath();
      o.arc(x, y, s * 0.72, -Math.PI * 0.15, Math.PI * 1.25);
      o.stroke();
      o.shadowBlur = 0;
      const ax = x + Math.cos(-Math.PI * 0.15) * s * 0.72,
        ay = y + Math.sin(-Math.PI * 0.15) * s * 0.72;
      o.fillStyle = 'rgba(' + rgb + ',0.95)';
      o.beginPath();
      o.moveTo(ax + s * 0.05, ay - s * 0.5);
      o.lineTo(ax + s * 0.45, ay + s * 0.05);
      o.lineTo(ax - s * 0.35, ay + s * 0.12);
      o.closePath();
      o.fill();
      o.lineWidth = 1.8;
      o.strokeStyle = 'rgba(255,255,255,0.7)';
      o.beginPath();
      o.arc(x, y, s * 0.72, -Math.PI * 0.15, Math.PI * 1.25);
      o.stroke();
    }
    o.restore();
  }
  // ruban VERTICAL : colonne d'un camp qui defile de bas en haut (ou l'inverse), chaque cadeau = icone + effet
  // sur une ligne, projecteur au centre vertical, fondu haut et bas, plaque qualite prod.
  function rubanCadeaux(camp, x0, y0, bw, bh, rgb, vitesse, sens) {
    const T = tuiles(camp),
      n = T.length,
      TH = 132,
      FADE = 64,
      midY = bh / 2,
      icx = 52;
    ctx.save();
    // plaque TRANSLUCIDE : l'ambiance du jeu passe derriere. Ombre portee douce, lisere teinte.
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    const pg = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
    pg.addColorStop(0, 'rgba(14,19,16,0.42)');
    pg.addColorStop(1, 'rgba(8,11,9,0.5)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(x0, y0, bw, bh, 22);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.5)';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.roundRect(x0 + 2, y0 + 2, bw - 4, bh - 4, 20);
    ctx.stroke();
    const oc = calqueRuban(camp, bw, bh);
    if (oc) {
      const o = oc.getContext('2d');
      o.clearRect(0, 0, bw, bh);
      // les deux colonnes partagent le meme defilement ; le cote 'sens>0' est le MIROIR vertical de l'autre :
      // meme effet au centre au meme instant des deux cotes (Abdel : « LIFE au centre a gauche = LIFE a droite »),
      // tout en glissant en sens opposes.
      const bande = n * TH,
        dec = (((t * vitesse) % bande) + bande) % bande;
      const premier = Math.floor(dec / TH) - 1;
      o.textAlign = 'left';
      o.textBaseline = 'middle';
      for (let i = premier; i * TH - dec < bh + TH; i++) {
        const it = T[((i % n) + n) % n],
          cyB = i * TH - dec + TH / 2,
          cy = sens > 0 ? bh - cyB : cyB;
        if (cy < -TH || cy > bh + TH) continue;
        // separateur discret entre deux paires
        const byB = i * TH - dec,
          by = sens > 0 ? bh - byB : byB;
        o.fillStyle = 'rgba(255,255,255,0.10)';
        o.fillRect(20, by - 0.5, bw - 40, 1);
        // projecteur au centre vertical : le cadeau au milieu s'anime, les autres au repos
        let env = 1 - Math.abs(cy - midY) / 95;
        env = env > 0 ? env * env * (3 - 2 * env) : 0;
        const ang = env * 0.17 * Math.sin(t * 9.2),
          sc = 1 + env * 0.15;
        if (env > 0.04) {
          const r = o.createRadialGradient(icx, cy, 0, icx, cy, 66);
          r.addColorStop(0, 'rgba(' + rgb + ',' + 0.22 * env + ')');
          r.addColorStop(1, 'rgba(' + rgb + ',0)');
          o.fillStyle = r;
          o.fillRect(icx - 66, cy - 66, 132, 132);
        }
        // element principal : le pictogramme de l'EFFET dans la DA du jeu (anime au centre)
        o.save();
        o.translate(icx, cy);
        o.rotate(ang);
        o.scale(sc, sc);
        glypheEffet(o, it.label, 0, 0, 22, rgb);
        o.restore();
        // le mot de l'effet
        o.shadowColor = 'rgba(0,0,0,0.6)';
        o.shadowBlur = 4;
        o.shadowOffsetY = 2;
        o.fillStyle = 'rgba(' + rgb + ',' + (0.9 + 0.1 * env) + ')';
        o.font = '800 24px system-ui, sans-serif';
        o.fillText(it.label, icx + 36, cy + 1);
        o.shadowColor = 'transparent';
        o.shadowBlur = 0;
        o.shadowOffsetY = 0;
        // le cadeau TikTok en petit badge a droite : secondaire, legerement attenue
        const im = imageCadeau(it.img),
          GB = 34,
          gx = bw - 24 - GB / 2;
        o.save();
        o.globalAlpha = 0.88;
        o.shadowColor = 'rgba(0,0,0,0.4)';
        o.shadowBlur = 5;
        o.shadowOffsetY = 2;
        if (im && im.complete && im.naturalWidth) o.drawImage(im, gx - GB / 2, cy - GB / 2, GB, GB);
        o.restore();
      }
      // fondu haut et bas : on efface vraiment le contenu (transparence), la plaque translucide reste dessous
      o.globalCompositeOperation = 'destination-out';
      let gt = o.createLinearGradient(0, 0, 0, FADE);
      gt.addColorStop(0, 'rgba(0,0,0,1)');
      gt.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = gt;
      o.fillRect(0, 0, bw, FADE);
      let gb = o.createLinearGradient(0, bh - FADE, 0, bh);
      gb.addColorStop(0, 'rgba(0,0,0,0)');
      gb.addColorStop(1, 'rgba(0,0,0,1)');
      o.fillStyle = gb;
      o.fillRect(0, bh - FADE, bw, FADE);
      o.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.roundRect(x0, y0, bw, bh, 22);
      ctx.clip();
      ctx.drawImage(oc, x0, y0);
    }
    ctx.restore();
  }
  // les plaques ne sont PAS permanentes (un panneau permanent est un declencheur TikTok documente) :
  // pattern etudie et REGLABLE en regie : visibles defileVisi s, cachees defileCache s, en boucle.
  // Fondu doux en entree comme en sortie. Aucun lien avec l'arrivee des cadeaux (pattern pur).
  const DEFILE_FONDU = 0.7; // s
  function alphaDefile() {
    // 0 est une valeur legitime pour cache (toujours visible) : ne pas la confondre avec « non regle »
    const vis = reglages.defileVisi > 0 ? reglages.defileVisi : 8,
      cache = reglages.defileCache == null ? 12 : reglages.defileCache,
      P = vis + cache,
      ph = t % P;
    if (cache <= 0) return 1; // option "toujours visible" (tests hors live)
    const a =
      ph < DEFILE_FONDU
        ? ph / DEFILE_FONDU
        : ph < vis - DEFILE_FONDU
          ? 1
          : ph < vis
            ? 1 - (ph - (vis - DEFILE_FONDU)) / DEFILE_FONDU
            : 0;
    return Math.max(0, Math.min(1, a));
  }
  function peindreDefileCadeaux() {
    if (!duel()) return;
    const al = alphaDefile();
    if (al <= 0.01) return;
    // deux colonnes verticales longues, placees sur le cote DROIT, SOUS le plateau (la gauche reste libre)
    const BW = 250,
      BH = 372,
      YB = L.defY,
      XD = L.defXD,
      XG = L.defXG;
    ctx.save();
    ctx.globalAlpha = al;
    rubanCadeaux('or', XG, YB, BW, BH, '242,197,124', 40, -1);
    rubanCadeaux('ombre', XD, YB, BW, BH, '180,212,222', 40, 1);
    ctx.restore();
  }
  // ===== Bandeau d'activite, haut-centre (prototype, Abdel 2026-09-21 : « welcome people, thanks donations,
  // like and share, with a cute animation of the snake », puis « more polished »). Une annonce a la fois,
  // les cadeaux passent devant. Meme plaque que les lignes de la legende, et le VRAI rendu du serpent en
  // petit. Masque pendant la tenue de l'anneau (le compte a rebours occupe la meme place). Rendu seul.
  let annonces = [],
    annonceCur = null,
    likesPar = {};
  // memoire du LIVE (pas de la manche) : paliers de spectateurs deja salues, premiers cadeaux, serie de victoires,
  // et dons de la manche en cours par spectateur (pour le classement de fin de manche).
  const PALIERS_VUE = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  let paliersVus = {},
    dejaDonne = {},
    serieCamp = null,
    serieN = 0,
    donsManche = {},
    sauveT = [-9, -9];
  function nomCamp(c) {
    return c === 'or' ? 'Or' : 'Ombre';
  }
  // Les mots du bandeau (Abdel, 2026-09-21 : « more natural and user friendly, not like a bot, a bit more warm »).
  // Plusieurs tournures par evenement, tirees au sort sans jamais redire la meme deux fois de suite.
  // De vraies phrases, comme un hote qui parle, avec le NOM du spectateur dedans (Abdel : « not human speech
  // readable », « their name is not visible »). {nom} est mis en valeur au rendu ; {c} camp, {a} camp adverse.
  // Plus AUCUNE notion de cadeau dans les annonces (Abdel, 2026-09-22 : « get rid of the notion of gift but
  // still reward the viewer ») : le spectateur est celebre pour son ACTION dans le jeu. DONS = l'action
  // accomplie, conjuguee, par effet (meme index que CADEAUX_DUEL).
  const DONS = [
    'drops a berry',
    'fires a speed boost',
    'pulls off a steal',
    'raises a shield',
    'grants an extra life',
  ];
  const MOTS = {
    arrivee: [
      "Welcome {nom}, glad you're here!",
      'Hey {nom}, good to see you!',
      '{nom} just joined us, say hi!',
    ],
    partage: ['Thanks for sharing the live, {nom}!', '{nom} shared the live, thank you so much!'],
    abonne: ['Thanks for the follow, {nom}!', '{nom} just followed, welcome aboard!'],
    like: ['{nom} dropped {n} likes, thank you!', '{n} likes from {nom}, love it!'],
    // Abdel : ne jamais ecrire « Or » ni « Ombre », la couleur de la plaque et du nom le dit deja
    cadeau: ['{nom} {q}! What a play!', 'Big play: {nom} {q}!', '{nom} {q} for the team!'],
    premier: ['{nom} enters the game and {q}! Welcome!', 'First play by {nom}: {q}!'],
    palier: ["We're {n} here now, welcome everyone!", "{n} of us watching, you're amazing!"],
    serie: ['{n} wins in a row! Who can stop them?', "That's {n} in a row, unstoppable!"],
    sauve: ["{nom}'s {q} just saved the day!", "What a save! {nom}'s {q} kept them alive."],
    sauveSans: ['A {q} just saved the day!', 'What a save, that {q} kept them alive!'],
  };
  const dernierMot = {};
  function dire(cle, v) {
    const l = MOTS[cle];
    let k = Math.floor(Math.random() * l.length);
    if (l.length > 1 && k === dernierMot[cle]) k = (k + 1) % l.length;
    dernierMot[cle] = k;
    return l[k]
      .replace('{n}', v && v.n !== undefined ? v.n : '')
      .replace('{c}', (v && v.c) || '')
      .replace('{a}', (v && v.a) || '')
      .replace('{q}', (v && v.q) || '');
  }
  function sauve(i, quoi) {
    // un bouclier ou une vie offerts viennent d'eviter une perte
    if (t - sauveT[i] < 4) return;
    sauveT[i] = t;
    const camp = i === 0 ? 'or' : 'ombre',
      qui = corps[i] && corps[i][quoi === 'vie' ? 'viePar' : 'bouclierPar'];
    annoncer({
      genre: 'sauve',
      pseudo: qui || '',
      texte: dire(qui ? 'sauve' : 'sauveSans', {
        c: nomCamp(camp),
        q: quoi === 'vie' ? 'extra life' : 'shield',
      }),
      avatar: corps[i] && corps[i][quoi === 'vie' ? 'vieAvatar' : 'bouclierAvatar'],
      camp,
      effet: quoi === 'vie' ? 'LIFE' : 'SHIELD',
      devant: true,
    });
  }
  const BD_DUR = 3.8,
    BD_H = 96;
  let BD_W = 600,
    BD_CY = 154,
    BD_CX = 540; // Abdel : P1 retenu, « a little higher », loin du chrono
  function annoncer(a) {
    if (!duel() || !reglages.bandeau || reglages.bandeau === 'aucun') return;
    if (a.genre === 'cadeau' || a.devant) {
      let k = annonces.findIndex((q) => q.genre !== 'cadeau');
      if (k < 0) k = annonces.length;
      annonces.splice(k, 0, a);
    } else annonces.push(a);
    if (annonces.length > 6) annonces.length = 6;
  }
  // photos de profil des spectateurs (URL fournie par TikFinity) : cache borne, image prete ou rien
  const photos = {};
  let nbPhotos = 0;
  function photoProfil(url) {
    if (!url || typeof url !== 'string' || !/^https?:/.test(url)) return null;
    let im = photos[url];
    if (!im) {
      if (nbPhotos > 80) {
        for (const k in photos) delete photos[k];
        nbPhotos = 0;
      }
      im = new Image();
      im.referrerPolicy = 'no-referrer';
      im.src = url;
      photos[url] = im;
      nbPhotos++;
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function miniSerpent(pts, teinte, ech) {
    const a = amb();
    if (!a || !a.peindreSerpent || pts.length < 2) return;
    ctx.save();
    ctx.scale(ech, ech);
    a.peindreSerpent(
      ctx,
      pts.map((p) => ({ x: p.x / ech, y: p.y / ech })),
      CELL,
      { teinte },
    );
    ctx.restore();
  }
  function peindreBandeau() {
    const mode = reglages.bandeau;
    if (!duel() || !mode || mode === 'aucun' || !manche) return;
    const tenue = corps.some((c) => c && (c.tenue || 0) > 0 && manche.etat === 'en cours');
    if (tenue) {
      annonceCur = null;
      return;
    }
    if (!annonceCur && annonces.length) {
      annonceCur = annonces.shift();
      annonceCur.t0 = t;
    }
    const lisse = (v) => {
      v = Math.max(0, Math.min(1, v));
      return v * v * v * (v * (6 * v - 15) + 10);
    };
    if (annonceCur && t - annonceCur.t0 >= BD_DUR) annonceCur = null;
    const actif = annonceCur,
      age = actif ? t - actif.t0 : 0;
    const teinte = actif && actif.camp ? (actif.camp === 'or' ? OR : OMBRE) : '#e8f1dc',
      rgb =
        actif && actif.camp ? (actif.camp === 'or' ? '242,197,124' : '180,212,222') : '232,241,220';
    const en = actif ? lisse(age / 0.55) : 0,
      so = actif ? lisse((age - (BD_DUR - 0.55)) / 0.55) : 0;
    const cx = BD_CX + (mode === 'P3' ? 34 : 0),
      x = cx - BD_W / 2,
      y = BD_CY - BD_H / 2;
    // la plaque et son contenu ; reveal = part visible depuis la gauche (P2, P3), alpha global
    const plaque = (reveal, alpha, dy) => {
      if (alpha <= 0.01 || reveal <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(0, dy || 0);
      ctx.beginPath();
      ctx.rect(x - 4, y - 6, (BD_W + 8) * reveal, BD_H + 12);
      ctx.clip();
      ctx.fillStyle = 'rgba(8,12,10,0.74)';
      ctx.beginPath();
      ctx.roundRect(x, y, BD_W, BD_H, 24);
      ctx.fill();
      ctx.fillStyle = 'rgba(' + rgb + ',' + (0.1 * (1 - Math.min(1, age / 1.6))).toFixed(3) + ')';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.38)';
      ctx.stroke();
      const AV = 64,
        ax = x + 16 + AV / 2,
        pop =
          age < 0.9
            ? 1 + 0.14 * Math.sin(Math.min(1, Math.max(0, (age - 0.45) / 0.45)) * Math.PI)
            : 1;
      const noms = reglages.nomsDonateurs !== false,
        nom = noms && actif.pseudo ? actif.pseudo.slice(0, 18) : '',
        av = noms ? photoProfil(actif.avatar) : null;
      // photo de profil du spectateur, ronde, cerclee de la couleur du camp ; sinon son initiale ; sinon le glyphe
      if (nom) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
        ctx.closePath();
        if (av) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(av, ax - (AV / 2) * pop, BD_CY - (AV / 2) * pop, AV * pop, AV * pop);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
          ctx.fill();
          ctx.fillStyle = teinte;
          ctx.font = '800 32px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            nom
              .replace(/[^A-Za-z0-9]/g, '')
              .charAt(0)
              .toUpperCase() || '?',
            ax,
            BD_CY + 2,
          );
        }
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
        ctx.beginPath();
        ctx.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else glypheSerpent(ax, BD_CY, 17 * pop, actif.camp ? teinte : null);
      // a droite : le glyphe de l'EFFET du jeu (plus l'artwork du cadeau, notion de cadeau retiree)
      const IM = 60,
        aImg = !!actif.effet;
      if (aImg) {
        ctx.save();
        ctx.translate(x + BD_W - 16 - IM / 2, BD_CY);
        ctx.scale(pop, pop);
        glypheEffet(ctx, actif.effet, 0, 0, 22, rgb);
        ctx.restore();
      }
      // la phrase : mots de couleur claire, le nom en gras dans la couleur du camp, deux lignes au plus
      const tx = ax + AV / 2 + 18,
        place = x + BD_W - (aImg ? IM + 30 : 22) - tx;
      const morceaux = String(actif.texte).split('{nom}'),
        pieces = [];
      morceaux.forEach((m, k) => {
        if (k > 0) pieces.push({ t: nom || 'a viewer', fort: !!nom });
        (m.match(/\S+|\s+/g) || []).forEach((q) => pieces.push({ t: q, fort: false }));
      });
      const mots = [];
      let cur = null;
      pieces.forEach((q) => {
        if (!q.fort && /^\s+$/.test(q.t)) {
          cur = null;
          return;
        }
        if (!cur) {
          cur = [];
          mots.push(cur);
        }
        cur.push(q);
      });
      let corpsT = 30,
        lignes = [];
      for (; corpsT >= 19; corpsT--) {
        const fN = '500 ' + corpsT + 'px system-ui, sans-serif',
          fF = '800 ' + corpsT + 'px system-ui, sans-serif';
        ctx.font = fN;
        const esp = ctx.measureText(' ').width;
        mots.forEach((w) => {
          w.l = 0;
          w.forEach((q) => {
            ctx.font = q.fort ? fF : fN;
            q.l = ctx.measureText(q.t).width;
            w.l += q.l;
          });
        });
        lignes = [[]];
        let lx = 0;
        mots.forEach((w) => {
          if (lx > 0 && lx + esp + w.l > place) {
            lignes.push([]);
            lx = 0;
          }
          if (lx > 0) lx += esp;
          w.x = lx;
          lx += w.l;
          lignes[lignes.length - 1].push(w);
        });
        if (lignes.length <= 2 && mots.every((w) => w.l <= place)) break;
      }
      const inter = corpsT * 1.22,
        y0 = BD_CY - ((lignes.length - 1) * inter) / 2 + 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      lignes.slice(0, 2).forEach((li, k) =>
        li.forEach((w) => {
          let wx = tx + w.x;
          w.forEach((q) => {
            ctx.font = (q.fort ? '800 ' : '500 ') + corpsT + 'px system-ui, sans-serif';
            ctx.fillStyle = q.fort ? (actif.camp ? teinte : '#ffffff') : 'rgba(255,255,255,0.86)';
            ctx.fillText(q.t, wx, y0 + k * inter);
            wx += q.l;
          });
        }),
      );
      ctx.restore();
    };
    if (mode === 'P1' && actif) {
      // orbite : le serpent fait le tour de la plaque, se pose, puis repart en l'effacant
      plaque(1, en * (1 - so), (1 - en) * 10);
      const m = 13,
        rx = x - m,
        ry = y - m,
        rw = BD_W + 2 * m,
        rh = BD_H + 2 * m,
        rr = 24 + m,
        per = 2 * (rw + rh) - 8 * rr + 2 * Math.PI * rr;
      const tour = lisse(age / 1.25),
        sTete = per * 0.08 + tour * per + Math.max(0, age - 1.25) * 22 + so * per * 0.55,
        long = Math.min(170, tour * per) * (1 - so * 0.4);
      const pts = [];
      for (let d = 0; d <= long; d += 7) {
        const s2 = (((sTete - d) % per) + per) % per;
        pts.push(pointRail(rx, ry, rw, rh, rr, s2));
      }
      ctx.save();
      ctx.globalAlpha = 1 - so;
      miniSerpent(pts, teinte, 0.5);
      ctx.restore();
    }
    if (mode === 'P2' && actif) {
      // porteur : le serpent traverse en ondulant et deroule la plaque derriere lui
      const hx = x - 60 + lisse(age / 1.1) * (BD_W + 140) + Math.max(0, age - 1.1) * 520;
      plaque(Math.max(0, Math.min(1, (hx - x - 10) / BD_W)), 1 - so, -so * 12);
      const pts = [];
      for (let i = 0; i < 26; i++) {
        const px2 = hx - i * 7;
        pts.push({ x: px2, y: BD_CY + Math.sin(px2 * 0.03) * 15 });
      }
      if (hx < W + 220) miniSerpent(pts, teinte, 0.5);
    }
    if (mode === 'P3') {
      // mascotte : un petit serpent love, toujours la ; il se redresse et la plaque sort de lui
      const mx = cx - BD_W / 2 - 38,
        my = BD_CY + 6,
        leve = en - so,
        resp = 1 + 0.03 * Math.sin(t * 2.2);
      if (actif) plaque(en, 1 - so, 0);
      const pts = [
        { x: mx + 6 + leve * 10, y: my - 30 - leve * 16 - 2 * Math.sin(t * 2.2) },
        { x: mx + 2 + leve * 6, y: my - 22 - leve * 9 },
        { x: mx - 2, y: my - 14 },
      ];
      for (let i = 0; i <= 19; i++) {
        const ang = -Math.PI / 2 - i * 0.4,
          rad = (27 - i * 0.35) * resp;
        pts.push({ x: mx + Math.cos(ang) * rad * 1.2, y: my + 4 + Math.sin(ang) * rad * 0.6 });
      }
      miniSerpent(pts, actif ? teinte : '#e8f1dc', 0.42);
    }
  }
  function peindreScore() {
    // en mode versus les deux colonnes appartiennent aux astres (CIEL_X=62), le compteur s'efface
    // en duel il reste : une vipere par camp, Or a gauche, Ombre a droite, meme plaque, meme logique
    if (!duel()) return;
    const cx = W / 2;
    // Duel (Abdel, 2026-09-21, variante T1) : le temps restant de la manche, en chiffres, entre les deux
    // scores, comme une carte de score de foot. La plaque s'elargit pour lui faire place ; glyphes inchanges.
    const chrono = duel() && manche,
      bw = chrono ? SC_BW + 84 : SC_BW,
      ecart = chrono ? SC_ECART + 84 : SC_ECART;
    ctx.save();
    // la plaque : le compteur doit tenir aussi bien en plein jour que dans la nuit, il porte donc
    // son propre fond, sombre et discret. Une seule plaque pour les deux camps.
    ctx.fillStyle = 'rgba(6,11,8,0.46)';
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, SC_CY - SC_BH / 2, bw, SC_BH, SC_BH / 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    if (chrono) {
      const dureeM = reglages.dureeDuel || reglages.duree,
        r = Math.max(0, Math.ceil(dureeM - (manche.t || 0)));
      const txt = Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0');
      ctx.beginPath();
      ctx.moveTo(cx - 42, SC_CY - 13);
      ctx.lineTo(cx - 42, SC_CY + 13);
      ctx.moveTo(cx + 42, SC_CY - 13);
      ctx.lineTo(cx + 42, SC_CY + 13);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '500 24px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle =
        r <= 20 && manche.etat === 'en cours' ? 'rgba(240,78,62,0.95)' : 'rgba(255,255,255,0.72)';
      ctx.fillText(txt, cx, SC_CY + 1);
    } else {
      // un filet vertical, entre les deux camps
      ctx.beginPath();
      ctx.moveTo(cx, SC_CY - 13);
      ctx.lineTo(cx, SC_CY + 13);
      ctx.stroke();
    }
    ctx.restore();
    campBarre(cx - ecart / 2, scoreSerpent, true, pulseS, duel() ? OR : null);
    campBarre(cx + ecart / 2, scoreViewers, false, pulseV, duel() ? OMBRE : null, true);
  }

  // Maquette de l'interface TikTok, pour juger le jeu en conditions reelles au lieu de juger un
  // canvas nu. Ce n'est PAS un repere abstrait comme `reglages.zones` : ce sont les elements
  // eux-memes, dessines aux positions mesurees sur la capture d'Abdel, pour qu'on voie ce qui
  // recouvre quoi, ce qui reste lisible, et ou l'oeil du spectateur va reellement.
  // Purement visuel, aucun effet sur le jeu, absent par defaut.
  function pilule(x, y, w, h, te, r) {
    ctx.fillStyle = te;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r === undefined ? h / 2 : r);
    ctx.fill();
  }
  function peindreMaquetteLive() {
    ctx.save();
    const GRIS = 'rgba(255,255,255,0.20)',
      SOMBRE = 'rgba(0,0,0,0.42)',
      CLAIR = 'rgba(255,255,255,0.34)';

    // 1. le haut : voile sombre, pastille de l'hote, bouton Suivre, compteur, croix
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, W, SR_Y);
    ctx.fillStyle = CLAIR;
    ctx.beginPath();
    ctx.arc(84, 150, 42, 0, Math.PI * 2);
    ctx.fill();
    pilule(138, 126, 190, 26, CLAIR, 8); // le pseudo
    pilule(138, 160, 96, 18, GRIS, 7); // les abonnes
    pilule(404, 122, 150, 58, 'rgba(232,64,84,0.80)'); // + Suivre
    pilule(740, 124, 180, 54, SOMBRE); // les avatars et le nombre de spectateurs
    ctx.fillStyle = CLAIR;
    [768, 806].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, 151, 21, 0, Math.PI * 2);
      ctx.fill();
    });
    pilule(840, 142, 56, 18, CLAIR, 7);
    ctx.strokeStyle = CLAIR;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1002, 134);
    ctx.lineTo(1038, 170);
    ctx.moveTo(1038, 134);
    ctx.lineTo(1002, 170);
    ctx.stroke();
    // la seconde rangee : classement, galerie, recherche
    pilule(30, 216, 368, 42, SOMBRE, 12);
    pilule(414, 216, 236, 42, SOMBRE, 12);
    pilule(666, 216, 384, 42, SOMBRE, 12);

    // 2. la colonne de widgets cadeaux, a droite : c'est elle qui borne le compteur par le bas
    const Z = Z_CADEAUX;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.roundRect(Z.x, Z.y, Z.w, Z.h, 16);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const y = Z.y + 22 + i * 66;
      pilule(Z.x + 16, y, 52, 52, CLAIR, 14); // l'icone du cadeau
      pilule(Z.x + 82, y + 10, 190, 16, GRIS, 8); // le libelle
      pilule(Z.x + 82, y + 32, 120, 14, GRIS, 7);
    }

    // 3. la banniere de cadeau, puis le fil de commentaires, puis la barre de saisie
    const B = Z_BANNIERE;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.roundRect(B.x, B.y, B.w, B.h, B.h / 2);
    ctx.fill();
    ctx.fillStyle = CLAIR;
    ctx.beginPath();
    ctx.arc(B.x + 50, B.y + B.h / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    pilule(B.x + 98, B.y + 22, 210, 20, CLAIR, 8);
    pilule(B.x + 98, B.y + 54, 140, 16, GRIS, 7);
    pilule(B.x + 430, B.y + 28, 120, 40, CLAIR, 10);
    const F = Z_FIL;
    // 4 commentaires et demi a la fois, compte par Abdel sur un vrai live : le plus ancien est
    // coupe net par le haut du fil, il ne s'affiche jamais en entier. On decoupe donc a la zone
    // et on demarre la premiere bulle a cheval sur son bord, sinon la maquette ment sur la
    // hauteur reellement occupee et sur l'aspect du fil.
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      const y = F.y - 46 + i * 106,
        lg = [620, 470, 700, 530, 660][i];
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.roundRect(F.x + 20, y, lg, 86, 22);
      ctx.fill();
      ctx.fillStyle = CLAIR;
      ctx.beginPath();
      ctx.arc(F.x + 58, y + 43, 26, 0, Math.PI * 2);
      ctx.fill();
      pilule(F.x + 98, y + 20, lg * 0.34, 16, CLAIR, 7);
      pilule(F.x + 98, y + 50, lg * 0.62, 16, GRIS, 7);
    }
    ctx.restore();
    const S = Z_SAISIE;
    pilule(S.x + 24, S.y, 560, S.h, 'rgba(0,0,0,0.42)', 28);
    pilule(S.x + 52, S.y + 38, 260, 22, GRIS, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    [648, 744, 840, 936].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, S.y + S.h / 2, 44, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = CLAIR;
    [648, 744, 840, 936].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, S.y + S.h / 2, 20, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  let dtRendu = 0.016;
  function peindreDuel(dt) {
    if (!manche) return;
    const x = X0 - 14,
      y = Y0 - 14,
      w = COLS * CELL + 28,
      h = ROWS * CELL + 28,
      r = 18;
    const per = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
    // lisser les anneaux
    for (let i = 0; i < corps.length; i++) {
      const vise = Math.min(1, (corps[i].serpent.length || 0) / LONG_CIBLE_DUEL);
      corps[i].anneau += (vise - corps[i].anneau) * Math.min(1, (dt || 0.016) * 3.5); // montee plus soyeuse (Abdel : « more smooth »)
    }
    // Tenue : pendant les TENUE_DUEL secondes ou un camp tient son anneau plein, son demi-anneau
    // bat de plus en plus vite et s'epaissit, et un compte a rebours 5-4-3-2-1 s'affiche au haut-centre
    // dans sa couleur. C'est l'instant ou l'autre camp doit couper : il faut qu'on le voie.
    const tenueDe = (i) =>
      corps[i] && manche.etat === 'en cours' ? Math.min(TENUE_DUEL, corps[i].tenue || 0) : 0;
    // Respiration lente (2 Hz max) et sans saut de largeur : la version battante a 8-26 rad/s
    // scintillait (Abdel : « there a flicker of the jauge bar on the cooldown its not pleasing »).
    const battement = (tn) => (tn > 0 ? 0.5 + 0.5 * Math.sin(t * 4) : 0);
    ctx.save();
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // piste vide
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
    // Or : tiret FINIT au haut-centre (anti-horaire sur le chemin horaire = offset inverse)
    // Jauges de longueur sur la bordure : « deglutition », tempo vif 1 s, validee par Abdel apres
    // maquettes (K2, puis mouvement soyeux, puis rendu net). La jauge est le corps du serpent : a
    // chaque baie mangee, un renflement lisse part de l'origine (haut-centre), glisse jusqu'a la
    // pointe et s'y fond pendant que la ligne s'allonge. Recette du mouvement, a ne pas simplifier :
    //  - position du renflement en smootherstep (depart et arrivee sans a-coup) ;
    //  - amplitude qui nait en fondu (22 % du trajet) et se resorbe (26 derniers %) ;
    //  - la longueur ne grandit qu'a 72 % du trajet, donc le renflement se fond dans la pointe ;
    //  - la longueur suit un ressort amorti critique (aucun depassement, aucune oscillation) ;
    //  - temps reel (dtRendu). Rendu seul : rien ici ne touche au jeu.
    // Le renflement est borne a 7,7 px de demi-epaisseur : le rail du timer est a 12 px (trait 7 px).
    const DUREE_GORGEE = 1.0,
      lisse = (v) => {
        v = Math.max(0, Math.min(1, v));
        return v * v * v * (v * (6 * v - 15) + 10);
      };
    for (let i = 0; i < corps.length && i < 2; i++) {
      const c = corps[i],
        horaire = i === 1,
        rgb = i === 0 ? '242,197,124' : '180,212,222',
        clair = i === 0 ? '255,238,206' : '228,243,249';
      const L = c.serpent.length || 0,
        pxParAnneau = per / 2 / LONG_CIBLE_DUEL;
      if (c.jL === undefined) {
        c.jL = 0;
        c.jV = 0;
        c.jEv = [];
        c.jLong = L;
      }
      if (L > c.jLong && manche.etat === 'en cours')
        c.jEv.push({ q: 0, fait: false, gain: (L - c.jLong) * pxParAnneau });
      c.jLong = L;
      let attente = 0;
      for (let k = c.jEv.length - 1; k >= 0; k--) {
        const e = c.jEv[k];
        e.q += dtRendu / DUREE_GORGEE;
        if (!e.fait && e.q >= 0.72) e.fait = true;
        if (e.q >= 1) {
          c.jEv.splice(k, 1);
          continue;
        }
        if (!e.fait) attente += e.gain;
      }
      const cible = Math.max(0, Math.min(per / 2, L * pxParAnneau) - attente),
        wr = 6.5;
      c.jV += (wr * wr * (cible - c.jL) - 2 * wr * c.jV) * dtRendu;
      c.jL += c.jV * dtRendu;
      if (c.jL < 0) {
        c.jL = 0;
        c.jV = 0;
      }
      const Lb = Math.max(c.jL, c.jEv.length ? 16 : 0);
      if (Lb < 1) continue;
      const tn = tenueDe(i),
        bt = battement(tn),
        fond = (tn > 0 ? 6 : 3.1) + 0.15 * Math.sin(t * 1.3 + i * 1.7);
      const gorgees = c.jEv.map((e) => ({
        pos: lisse(e.q) * Lb,
        a: lisse(e.q / 0.22) * (1 - lisse((e.q - 0.74) / 0.26)),
      }));
      const demi = (d) => {
        let h2 = fond;
        for (const g of gorgees) h2 += 4.6 * g.a * Math.exp(-Math.pow((d - g.pos) / 19, 2));
        return h2;
      };
      const pR = (d) => pointRail(x, y, w, h, r, horaire ? d : (per - d) % per);
      // le corps : un contour exterieur, un contour interieur, deux bouts arrondis a la bonne epaisseur
      // Perf : un seul point de rail par echantillon (pas de 4 px), la tangente vient des voisins
      const N = Math.max(6, Math.ceil(Lb / 4)),
        ext = [],
        inte = [],
        dos = [],
        bouts = [null, null],
        axe = [];
      for (let k = 0; k <= N; k++) axe.push(pR((Lb * k) / N));
      for (let k = 0; k <= N; k++) {
        const d = (Lb * k) / N,
          a = axe[Math.max(0, k - 1)],
          b2 = axe[Math.min(N, k + 1)],
          m = axe[k];
        let tx = b2.x - a.x,
          ty = b2.y - a.y;
        const nn = Math.hypot(tx, ty) || 1;
        tx /= nn;
        ty /= nn;
        const sg = horaire ? 1 : -1,
          nx = ty * sg,
          ny = -tx * sg,
          h2 = demi(d); // (nx,ny) pointe vers l'exterieur du plateau
        ext.push({ x: m.x + nx * h2, y: m.y + ny * h2 });
        inte.push({ x: m.x - nx * h2, y: m.y - ny * h2 });
        dos.push({ x: m.x + nx * (h2 - 1.8), y: m.y + ny * (h2 - 1.8) });
        if (k === 0) bouts[0] = { m, tx: -tx, ty: -ty, nx: -nx, ny: -ny, h: h2 };
        if (k === N) bouts[1] = { m, tx, ty, nx, ny, h: h2 };
      }
      // demi-cercle de l'exterieur vers l'interieur, en passant par le sens de la tangente
      const bout = (e) => {
        for (let q = 1; q < 6; q++) {
          const an = (Math.PI * q) / 6,
            ct = Math.sin(an),
            cn = Math.cos(an);
          ctx.lineTo(e.m.x + (e.tx * ct + e.nx * cn) * e.h, e.m.y + (e.ty * ct + e.ny * cn) * e.h);
        }
      };
      ctx.beginPath();
      ctx.moveTo(ext[0].x, ext[0].y);
      for (let k = 1; k <= N; k++) ctx.lineTo(ext[k].x, ext[k].y);
      bout(bouts[1]);
      for (let k = N; k >= 0; k--) ctx.lineTo(inte[k].x, inte[k].y);
      bout(bouts[0]);
      ctx.closePath();
      // Perf : halo imite par un contour large et translucide ; le vrai flou ne sert que pendant la tenue
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.13)';
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.2)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(' + rgb + ',0.96)';
      if (tn > 0) {
        ctx.shadowColor = 'rgba(' + rgb + ',' + (0.45 + 0.35 * bt) + ')';
        ctx.shadowBlur = 10 + 16 * bt;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.clip();
      // filet de lumiere qui suit le dos
      ctx.strokeStyle = 'rgba(' + clair + ',0.45)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let k = 2; k <= N - 2; k++) {
        if (k === 2) ctx.moveTo(dos[k].x, dos[k].y);
        else ctx.lineTo(dos[k].x, dos[k].y);
      }
      ctx.stroke();
      // la baie qui voyage a l'interieur : une lueur douce, jamais une tache nette
      for (const g of gorgees) {
        if (g.a < 0.02) continue;
        const m = pR(g.pos);
        const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 12);
        gr.addColorStop(0, 'rgba(' + clair + ',' + 0.95 * g.a + ')');
        gr.addColorStop(0.5, 'rgba(' + clair + ',' + 0.5 * g.a + ')');
        gr.addColorStop(1, 'rgba(' + clair + ',0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (manche.etat === 'en cours') {
      const dureeM = reglages.dureeDuel || reglages.duree,
        reste = Math.max(0, 1 - manche.t / dureeM);
      const ex = x - 12,
        ey = y - 12,
        ew = w + 24,
        eh = h + 24,
        er = r + 12,
        eper = 2 * (ew + eh) - 8 * er + 2 * Math.PI * er;
      // Visibilite (Abdel : « the red timer is still not visible enough », sans lisere noir) : trait de
      // 7 px au lieu de 4, rouge plus vif, rail vide plus marque.
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(228,64,58,0.26)';
      ctx.beginPath();
      ctx.roundRect(ex, ey, ew, eh, er);
      ctx.stroke();
      if (reste > 0.001) {
        const len = eper * reste,
          urgent = manche.t > dureeM - 15;
        // Perf : un shadowBlur sur un trait qui fait le tour du plateau force le navigateur a flouter
        // toute la surface du plateau a chaque image (mesure : 3,5 ms contre 0,25 ms sans flou). Le halo
        // est donc imite par deux traits plus larges et translucides sous le trait franc.
        const vif = urgent ? 0.65 + 0.35 * Math.sin(t * 6) : 0.95;
        ctx.setLineDash([len, eper - len]);
        ctx.lineDashOffset = -(ew / 2 - er);
        [
          [urgent ? 19 : 15, 0.09],
          [urgent ? 13 : 11, 0.15],
          [7, vif],
        ].forEach(([lw2, al]) => {
          ctx.lineWidth = lw2;
          ctx.strokeStyle = 'rgba(240,78,62,' + al + ')';
          ctx.beginPath();
          ctx.roundRect(ex, ey, ew, eh, er);
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.lineWidth = 7;
        // Meche du timer, proposition K validee par Abdel (« braise et poussieres », sans lisere noir,
        // critere : subtil, satisfaisant, dans le ton du jeu). Les derniers centimetres du trait se
        // rechauffent (rouge, ambre, blanc chaud), une braise respire lentement a la pointe, et de
        // rares grains ambres montent puis s'eteignent. Rendu seul : rien ici ne touche au jeu.
        const pr = (s) => pointRail(ex, ey, ew, eh, er, Math.max(0, s)),
          tip = pr(len);
        for (let i = 12; i >= 0; i--) {
          const q = pr(len - i * 7),
            f = 1 - i / 12;
          ctx.fillStyle =
            'rgba(255,' +
            Math.round(120 + 110 * f) +
            ',' +
            Math.round(70 + 120 * f * f) +
            ',' +
            0.85 * f * f +
            ')';
          ctx.beginPath();
          ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        const souffle = 0.5 + 0.5 * Math.sin(t * 2.6);
        ctx.shadowColor = 'rgba(255,150,70,0.9)';
        ctx.shadowBlur = 16 + 16 * souffle;
        ctx.fillStyle =
          'rgb(255,' + Math.round(200 + 40 * souffle) + ',' + Math.round(150 + 60 * souffle) + ')';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 6.5 + 2 * souffle, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (Math.random() < Math.min(1, dtRendu * 2.7))
          fumeeTimer.push({
            x: tip.x + (Math.random() - 0.5) * 12,
            y: tip.y,
            vx: (Math.random() - 0.5) * 16,
            vy: -25 - Math.random() * 18,
            l: 0,
            m: 2.2 + Math.random(),
          });
        for (let i = fumeeTimer.length - 1; i >= 0; i--) {
          const g = fumeeTimer[i];
          g.l += dtRendu;
          if (g.l >= g.m) {
            fumeeTimer.splice(i, 1);
            continue;
          }
          g.x += (g.vx + Math.sin(g.l * 2.2) * 14) * dtRendu;
          g.y += g.vy * dtRendu;
          ctx.fillStyle = 'rgba(255,205,150,' + 0.7 * Math.sin((Math.PI * g.l) / g.m) + ')';
          ctx.beginPath();
          ctx.arc(g.x, g.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else fumeeTimer.length = 0;
      ctx.lineWidth = 6;
    }
    // compte a rebours de la tenue, au haut-centre, dans la couleur du camp qui tient
    for (let i = 0; i < corps.length; i++) {
      const tn = tenueDe(i);
      if (tn <= 0) continue;
      const reste = Math.max(1, Math.ceil(TENUE_DUEL - tn));
      const frac = TENUE_DUEL - tn - (reste - 1); // 1 -> 0 au fil de la seconde
      const teinte = i === 0 ? OR : OMBRE,
        rgb = i === 0 ? '242,197,124' : '180,212,222';
      const cx = W / 2,
        cy = Y0 - 14,
        ech = 1 + 0.35 * (1 - frac); // le chiffre gonfle en fin de seconde
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(ech, ech);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 92px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(12,17,14,0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = teinte;
      ctx.fillText(String(reste), 0, 4);
      ctx.restore();
    }
    // flash rouge de recul par camp
    for (let i = 0; i < corps.length; i++) {
      const rt = corps[i].reculT || 0;
      if (rt > 0) {
        ctx.save();
        ctx.globalAlpha = 0.14 * (rt / 0.9);
        ctx.fillStyle = 'rgba(228,64,58,1)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // icones du rail duel (memes traces que coeur/ecusson de peindreGrade, qui y sont locales)
  function coeurDuel(icx, icy, s) {
    // coeur classique et symetrique : deux lobes ronds, une pointe (le trace de peindreGrade se deformait a 24 px)
    ctx.beginPath();
    ctx.moveTo(icx, icy + s * 0.85);
    ctx.bezierCurveTo(
      icx - s * 1.15,
      icy - s * 0.05,
      icx - s * 0.6,
      icy - s * 0.95,
      icx,
      icy - s * 0.35,
    );
    ctx.bezierCurveTo(
      icx + s * 0.6,
      icy - s * 0.95,
      icx + s * 1.15,
      icy - s * 0.05,
      icx,
      icy + s * 0.85,
    );
    ctx.closePath();
  }
  function ecussonDuel(icx, icy, s) {
    ctx.beginPath();
    ctx.moveTo(icx, icy - s);
    ctx.lineTo(icx + s * 0.8, icy - s * 0.6);
    ctx.lineTo(icx + s * 0.8, icy + s * 0.1);
    ctx.bezierCurveTo(icx + s * 0.8, icy + s * 0.7, icx, icy + s, icx, icy + s);
    ctx.bezierCurveTo(icx, icy + s, icx - s * 0.8, icy + s * 0.7, icx - s * 0.8, icy + s * 0.1);
    ctx.lineTo(icx - s * 0.8, icy - s * 0.6);
    ctx.closePath();
  }
  function peindreStatutsDuel() {
    if (!manche || manche.etat !== 'en cours') return;
    // memes coordonnees que peindreGrade
    const RCX_G = X0 - 82,
      RCX_D = X0 + COLS * CELL + 82;
    const RY0 = Y0 + 7;
    const JY_BOT = RY0 + 26 + 4 * 52 + 16 + 20 + 220;
    const JY_TOP = JY_BOT - 220,
      JW = 40,
      JH = 220;
    const camps = [
      { c: corps[0], cx: RCX_G, rgb: '242,197,124', teinte: OR },
      { c: corps[1], cx: RCX_D, rgb: '180,212,222', teinte: OMBRE },
    ];
    ctx.save();
    camps.forEach(({ c, cx, rgb, teinte }) => {
      if (!c) return;
      const surge = Math.min(1, (c.surgeT || 0) / TEMPO_DUR); // la jauge se vide sur 10 s (le tempo paye)
      const invinc = (c.invincT || 0) > 0;
      const coup = (c.coupT || 0) > 0;
      // fond
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.roundRect(cx - JW / 2, JY_TOP, JW, JH, JW / 2);
      ctx.fill();
      // barre de poussee de tempo
      if (surge > 0.002) {
        const fillH = Math.round(JH * surge);
        ctx.fillStyle = coup ? 'rgba(228,64,58,0.92)' : 'rgba(' + rgb + ',0.88)';
        ctx.shadowColor = 'rgba(' + rgb + ',0.55)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(cx - JW / 2, JY_BOT - fillH, JW, fillH, JW / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // lueur invincibilite
      if (invinc) {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 8);
        ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = 'rgba(' + rgb + ',0.7)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(cx - JW / 2, JY_TOP, JW, JH, JW / 2);
        ctx.stroke();
        ctx.restore();
      }
      // Danger : serpent adulte sous SURSIS_DUEL anneaux. Triangle rouge a point d'exclamation au-dessus de
      // la jauge, qui bat (Abdel : « icon on the side to indicate to team that its dangerous instead of jauge in red »).
      // Visible des que le serpent est sous 5 anneaux hors eclosion (naissance a 5 : sous 5 = il a ete coupe).
      // Abdel : « i dont see the warning icon » : la condition 'adulte' le cachait presque toujours.
      if (!c.couvee && c.serpent.length > 0 && c.serpent.length < SURSIS_DUEL) {
        const dy = JY_TOP - 44,
          ds = 22,
          al = 0.6 + 0.4 * Math.sin(t * 6);
        ctx.save();
        ctx.globalAlpha = al;
        ctx.fillStyle = 'rgba(228,64,58,1)';
        ctx.shadowColor = 'rgba(228,64,58,0.9)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(cx, dy - ds);
        ctx.lineTo(cx + ds * 0.95, dy + ds * 0.7);
        ctx.lineTo(cx - ds * 0.95, dy + ds * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, dy + 4);
        ctx.restore();
      }
      // boucliers et vies offerts : ecussons puis coeurs en colonne sous la jauge, dans la teinte du camp.
      // Une pare (pareT) fait clignoter la colonne en blanc.
      {
        const pare = (c.pareT || 0) > 0;
        let iy = JY_BOT + 48;
        const s = 24; // icones grandes et nettes (Abdel : trop petites, pas explicites)
        ctx.save();
        if ((c.bouclierT || 0) > 0) {
          // ecusson plein + anneau de compte a rebours qui se vide (fraction du temps restant sur 15 s)
          const fr = Math.min(1, c.bouclierT / BOUCLIER_DUR);
          ctx.fillStyle = pare ? 'rgba(255,255,255,0.95)' : 'rgba(' + rgb + ',0.9)';
          ctx.shadowColor = 'rgba(' + rgb + ',0.6)';
          ctx.shadowBlur = 10;
          ecussonDuel(cx, iy, s);
          ctx.fill();
          ctx.shadowBlur = 0;
          // contour blanc et croix interieure : un ecusson qu'on lit a la taille d'un pouce
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ecussonDuel(cx, iy, s);
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(12,17,14,0.7)';
          ctx.beginPath();
          ctx.moveTo(cx, iy - s * 0.55);
          ctx.lineTo(cx, iy + s * 0.5);
          ctx.moveTo(cx - s * 0.45, iy - s * 0.1);
          ctx.lineTo(cx + s * 0.45, iy - s * 0.1);
          ctx.stroke();
          // anneau de compte a rebours : fond gris, arc qui se vide dans le sens horaire
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath();
          ctx.arc(cx, iy, s + 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = pare ? 'rgba(255,255,255,0.95)' : 'rgba(' + rgb + ',0.95)';
          ctx.shadowColor = 'rgba(' + rgb + ',0.7)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(cx, iy, s + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fr);
          ctx.stroke();
          ctx.shadowBlur = 0;
          // secondes restantes, en petit sous l'anneau
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = '700 20px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(Math.ceil(c.bouclierT) + 's', cx, iy + s + 30);
          iy += s * 2 + 58;
        }
        // vies offertes : un coeur par vie, meme taille et meme traitement que l'ecusson (Abdel :
        // « life icons when gifted are also shown on the side »), lisibles a la taille d'un pouce
        // sans plafond : jusqu'a 4 coeurs en colonne, au-dela un seul coeur et le compte 'x N'
        const nV = c.vies || 0,
          nDess = nV > 4 ? 1 : nV;
        for (let k = 0; k < nDess; k++) {
          if (k === 0) iy += 6;
          // rouge pour les deux camps (Abdel : « they are red and same ui style as shield »)
          ctx.fillStyle = pare ? 'rgba(255,255,255,0.95)' : 'rgba(228,64,58,0.95)';
          ctx.shadowColor = 'rgba(228,64,58,0.7)';
          ctx.shadowBlur = 14;
          coeurDuel(cx, iy, s);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          coeurDuel(cx, iy, s);
          ctx.stroke();
          if (nV > 4) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '700 22px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('x' + nV, cx, iy + s * 1.4);
          }
          iy += s * 2.2;
        }
        ctx.restore();
      }
      // Eclair de tempo (Abdel : gris inactif, couleur du camp actif, lisible) : pastille sombre dans la
      // barre, eclair 20 px dessus. Inactif : gris. Actif : couleur du camp, lueur, battement.
      {
        const actifT = (c.surgeT || 0) > 0,
          ex = cx,
          ey = JY_TOP + 40,
          es = 20;
        ctx.save();
        ctx.fillStyle = 'rgba(8,12,10,0.88)';
        ctx.beginPath();
        ctx.arc(ex, ey, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = actifT ? 'rgba(' + rgb + ',0.9)' : 'rgba(255,255,255,0.22)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex + es * 0.35, ey - es);
        ctx.lineTo(ex - es * 0.55, ey + es * 0.15);
        ctx.lineTo(ex - es * 0.05, ey + es * 0.15);
        ctx.lineTo(ex - es * 0.35, ey + es);
        ctx.lineTo(ex + es * 0.55, ey - es * 0.15);
        ctx.lineTo(ex + es * 0.05, ey - es * 0.15);
        ctx.closePath();
        if (actifT) {
          ctx.shadowColor = 'rgba(' + rgb + ',1)';
          ctx.shadowBlur = 18;
          ctx.fillStyle = teinte;
          ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 10);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
        }
        ctx.fill();
        ctx.restore();
      }
      // eclair de coupe : barre blanche breve
      if (coup) {
        ctx.save();
        ctx.globalAlpha = 0.7 * (c.coupT / 0.9);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.roundRect(cx - JW / 2, JY_TOP, JW, JH, JW / 2);
        ctx.fill();
        ctx.restore();
      }
    });
    ctx.restore();
  }

  // Point du rail du timer a la distance s du haut-centre, dans le sens horaire (le sens ou le trait
  // rouge est dessine). Meme geometrie que ctx.roundRect(x,y,w,h,r).
  let fumeeTimer = [];
  let retourCadeaux = [[], []],
    bandeauCadeau = [null, null]; // [camp][ligne] = {t, pseudo, n} ; bandeau = {t, texte}
  function noterCadeau(i, valeur, pseudo, n, avatar) {
    const k =
      valeur >= VIE_COUT
        ? 4
        : valeur >= BOUCLIER_COUT
          ? 3
          : valeur >= COUPE_COUT
            ? 2
            : valeur >= TEMPO_COUT
              ? 1
              : 0;
    const r = retourCadeaux[i][k] || (retourCadeaux[i][k] = { t: -9, pseudo: '', n: 0 });
    r.t = t;
    r.pseudo = String(pseudo || '');
    r.n += Math.max(1, n || 1);
    const c = CADEAUX_DUEL[i === 0 ? 'or' : 'ombre'][k];
    const premier = !!(r.pseudo && !dejaDonne[r.pseudo]);
    if (r.pseudo) {
      dejaDonne[r.pseudo] = 1;
      const dm =
        donsManche[r.pseudo] ||
        (donsManche[r.pseudo] = { camp: i === 0 ? 'or' : 'ombre', total: 0 });
      dm.total += (valeur || 0) * Math.max(1, n || 1);
      dm.camp = i === 0 ? 'or' : 'ombre';
    }
    if (r.pseudo && donsManche[r.pseudo] && avatar) donsManche[r.pseudo].avatar = avatar;
    if (c)
      annoncer({
        genre: 'cadeau',
        pseudo: r.pseudo,
        avatar,
        texte: dire(premier ? 'premier' : 'cadeau', {
          c: nomCamp(i === 0 ? 'or' : 'ombre'),
          q: DONS[k] || c.effet,
        }),
        camp: i === 0 ? 'or' : 'ombre',
        effet: EFFET_LABEL[c.effet],
      });
    bandeauCadeau[i] = {
      t,
      texte:
        (r.pseudo && reglages.nomsDonateurs !== false ? r.pseudo + '  >  ' : '') +
        (c ? c.effet : ''),
    };
  }
  let ipsLisse = 60,
    pireDt = 0,
    pireT = 0,
    pireAffiche = 0;
  function pointRail(x, y, w, h, r, s) {
    const droit = w / 2 - r,
      q = (Math.PI * r) / 2,
      cote = h - 2 * r,
      bas = w - 2 * r;
    const arc = (cx, cy, a0, u) => ({
      x: cx + r * Math.cos(a0 + (u * Math.PI) / 2),
      y: cy + r * Math.sin(a0 + (u * Math.PI) / 2),
    });
    if (s < droit) return { x: x + w / 2 + s, y };
    s -= droit;
    if (s < q) return arc(x + w - r, y + r, -Math.PI / 2, s / q);
    s -= q;
    if (s < cote) return { x: x + w, y: y + r + s };
    s -= cote;
    if (s < q) return arc(x + w - r, y + h - r, 0, s / q);
    s -= q;
    if (s < bas) return { x: x + w - r - s, y: y + h };
    s -= bas;
    if (s < q) return arc(x + r, y + h - r, Math.PI / 2, s / q);
    s -= q;
    if (s < cote) return { x, y: y + h - r - s };
    s -= cote;
    if (s < q) return arc(x + r, y + r, Math.PI, s / q);
    s -= q;
    return { x: x + r + Math.min(s, droit), y };
  }
  function peindreManche() {
    if (!manche) return;
    if (duel()) {
      peindreDuel(dtRendu);
      return;
    } // l'ecran de fin du duel est peint en dernier, dans dessiner : il passe devant TOUT
    const us = Math.min(1, manche.cielSun / manche.hautSun),
      um = Math.min(1, manche.cielMoon / manche.hautMoon);
    // teinte de scene : celui qui mene la course colore le monde
    const pente = us - um;
    ctx.save();
    ctx.globalAlpha = 0.13 * Math.abs(pente);
    ctx.fillStyle = pente >= 0 ? OR : BLEU;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    if (manche.etat !== 'en cours') peindreFin();
  }

  // Fin de manche : la scene se voile, le camp gagnant s'affiche par la lumiere, sans un mot
  // le voile de fin, peint une seule fois au quart de la taille puis etire : un degrade radial plein ecran
  // recalcule a chaque image couterait cher pour rien
  let voileFinC = null;
  function voileFin() {
    if (voileFinC) return voileFinC;
    const c = document.createElement('canvas');
    c.width = 270;
    c.height = 480;
    const g = c.getContext('2d');
    const gv = g.createRadialGradient(135, 200, 30, 135, 200, 346);
    gv.addColorStop(0, 'rgba(5,8,6,0.50)');
    gv.addColorStop(0.55, 'rgba(5,8,6,0.68)');
    gv.addColorStop(1, 'rgba(5,8,6,0.82)');
    g.fillStyle = gv;
    g.fillRect(0, 0, 270, 480);
    voileFinC = c;
    return c;
  }
  function peindreFin() {
    const u = Math.min(1, manche.fin / 1.2),
      v = manche.vainqueur,
      sun = v === 'sun' || v === 'serpent' || v === 'or';
    ctx.save();
    // voile : montee douce (smootherstep sur 1,6 s), plus clair au centre ou se tient le serpent, plus dense aux bords
    {
      const uv = Math.min(1, manche.fin / 1.6),
        kv = uv * uv * uv * (uv * (6 * uv - 15) + 10);
      // en 16:9 le voile couvre aussi les cotes (Abdel : « just the center is active and not the full image »)
      if (duel()) {
        ctx.globalAlpha = kv;
        if (OX) ctx.drawImage(voileFin(), -OX, 0, WF, H);
        else ctx.drawImage(voileFin(), 0, 0, W, H);
      } // en 16:9 le meme voile radial s'etire sur tout le cadre, sans raccord
      else {
        ctx.globalAlpha = 0.55 * u;
        ctx.fillStyle = '#050806';
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.globalAlpha = 1;
    // Le serpent de fin remplace l'astre : il salue quand il gagne, il baisse la tete quand il perd.
    const cx = W / 2,
      cy = Y0 + (ROWS * CELL) / 2,
      R = 320;
    // En duel, un camp gagne toujours : le serpent de fin est heureux et porte la couleur du vainqueur
    // (Abdel : « the winning snake color need to match the color of the winning team »).
    const o = { etat: sun ? 'heureux' : 'triste', t: manche.fin, cx: cx, cy: cy, R: R, u: u };
    const kCl = classementActif() ? doux01((manche.fin - 2.0) / 0.9) : 0;
    const grandMvp = /^M/.test(reglages.classement || '');
    if (kCl > 0) {
      o.R = R * (1 - (grandMvp ? 0.48 : 0.34) * kCl);
      o.cy = cy - (grandMvp ? 250 : 190) * kCl;
    }
    if (duel() && v === 'nul') {
      // Match nul : les deux serpents face a face, chacun sa couleur, mot DRAW (maquette A1 validee par Abdel).
      if (window.FinSerpent && window.FinSerpent.peindreNul) {
        window.FinSerpent.peindreNul(ctx, {
          ...o,
          R: R * 1.05,
          or: { teinte: OR, rgb: '242,197,124' },
          ombre: { teinte: OMBRE, rgb: '180,212,222' },
        });
      }
      if (kCl > 0) peindreClassement(kCl);
      ctx.restore();
      return;
    } else if (duel()) {
      o.etat = 'heureux';
      o.teinte = v === 'ombre' ? OMBRE : OR;
      o.rgb = v === 'ombre' ? '180,212,222' : '242,197,124';
    }
    if (window.FinSerpent) window.FinSerpent.peindre(ctx, o);
    if (kCl > 0) peindreClassement(kCl);
    ctx.restore();
  }

  // Classement des donateurs de la manche, sur l'ecran de fin (prototype, Abdel 2026-09-21). Memes plaques
  // que la legende des cadeaux, pseudo dans la couleur de son camp, total en pieces. Rendu seul.
  function topDons(camp) {
    return Object.keys(donsManche)
      .map((p) => ({
        pseudo: p,
        camp: donsManche[p].camp,
        total: donsManche[p].total,
        avatar: donsManche[p].avatar,
      }))
      .filter((d) => d.total > 0 && (!camp || d.camp === camp))
      .sort((a, b) => b.total - a.total);
  }
  function classementActif() {
    const m = reglages.classement;
    return duel() && m && m !== 'aucun' && topDons().length > 0;
  }
  function ligneClassement(x, y, w, h, d, rang, app, miroir, grand) {
    if (app <= 0.01) return;
    const teinte = d.camp === 'or' ? OR : OMBRE,
      rgb = d.camp === 'or' ? '242,197,124' : '180,212,222';
    ctx.save();
    ctx.globalAlpha = app;
    ctx.translate(0, (1 - app) * 22);
    ctx.fillStyle = 'rgba(8,12,10,0.78)';
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, h * 0.3);
    ctx.fill();
    if (rang === 1) {
      ctx.fillStyle = 'rgba(' + rgb + ',0.10)';
      ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (rang === 1 ? 0.6 : 0.3) + ')';
    ctx.stroke();
    const rx = miroir ? x + w - h / 2 - 6 : x + h / 2 + 6,
      R = h * 0.3;
    ctx.fillStyle = rang === 1 ? teinte : 'rgba(' + rgb + ',0.22)';
    ctx.beginPath();
    ctx.arc(rx, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rang === 1 ? '#0c110e' : teinte;
    ctx.font = '900 ' + Math.round(R * 1.1) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(rang), rx, y + 1);
    // photo de profil du donateur, entre le rang et le nom (initiale si TikFinity n'en fournit pas)
    const montre = reglages.nomsDonateurs !== false,
      AV = h * 0.66,
      sg = miroir ? -1 : 1,
      pcx = rx + sg * (R + 12 + AV / 2),
      ph = montre ? photoProfil(d.avatar) : null;
    if (montre) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pcx, y, AV / 2, 0, Math.PI * 2);
      ctx.closePath();
      if (ph) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(ph, pcx - AV / 2, y - AV / 2, AV, AV);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(' + rgb + ',0.20)';
        ctx.fill();
        ctx.fillStyle = teinte;
        ctx.font = '800 ' + Math.round(AV * 0.5) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          d.pseudo
            .replace(/[^A-Za-z0-9]/g, '')
            .charAt(0)
            .toUpperCase() || '?',
          pcx,
          y + 1,
        );
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.8)';
      ctx.beginPath();
      ctx.arc(pcx, y, AV / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const decal = montre ? AV + 12 : 0;
    const nom =
      reglages.nomsDonateurs !== false ? d.pseudo.slice(0, grand ? 20 : 14) : 'supporter ' + rang;
    ctx.fillStyle = teinte;
    ctx.font = (grand ? '700 34px' : '700 27px') + ' system-ui, sans-serif';
    ctx.textAlign = miroir ? 'right' : 'left';
    // le nom ne mord jamais sur le total : il se resserre, puis se coupe
    {
      const place =
        w - (h / 2 + 6 + R + 16 + decal) - 22 - String(d.total).length * (grand ? 20 : 16) - 14;
      let cT = grand ? 34 : 27,
        txt = nom;
      while (cT > 18 && ctx.measureText(txt).width > place) {
        cT--;
        ctx.font = '700 ' + cT + 'px system-ui, sans-serif';
      }
      while (txt.length > 3 && ctx.measureText(txt).width > place) txt = txt.slice(0, -2) + '…';
      ctx.fillText(txt, miroir ? rx - R - 16 - decal : rx + R + 16 + decal, y + 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = (grand ? '500 32px' : '500 26px') + ' "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = miroir ? 'left' : 'right';
    ctx.fillText(String(d.total), miroir ? x + 22 : x + w - 22, y + 1);
    ctx.restore();
  }
  // --- Mise en avant du MVP (Abdel, 2026-09-21 : « crucial, it is used to flatter the viewer, MVP mis en
  // avant with like a crown »). Photo de profil en grand, couronne doree, nom et total ; M1 rayons, M2 le vrai
  // serpent tourne autour de lui, M3 podium a trois marches.
  const elast = (x) => {
    x = Math.max(0, Math.min(1, x));
    return x === 0
      ? 0
      : x === 1
        ? 1
        : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
  };
  function peindreAvatar(cx, cy, r, d, ech) {
    const teinte = d.camp === 'or' ? OR : OMBRE,
      rgb = d.camp === 'or' ? '242,197,124' : '180,212,222',
      montre = reglages.nomsDonateurs !== false,
      ph = montre ? photoProfil(d.avatar) : null,
      R = r * ech;
    if (R <= 0.5) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.closePath();
    if (ph) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(ph, cx - R, cy - R, 2 * R, 2 * R);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(14,20,17,0.95)';
      ctx.fill();
      ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
      ctx.fill();
      ctx.fillStyle = teinte;
      ctx.font = '800 ' + Math.round(R * 0.95) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        montre
          ? d.pseudo
              .replace(/[^A-Za-z0-9]/g, '')
              .charAt(0)
              .toUpperCase() || '?'
          : '?',
        cx,
        cy + R * 0.06,
      );
    }
    ctx.lineWidth = Math.max(2.5, R * 0.07);
    ctx.strokeStyle = teinte;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  function couronne(cx, cy, l, chute) {
    // cy = base de la couronne ; elle tombe d'en haut et rebondit
    const h = l * 0.62,
      dy = -(1 - elast(chute)) * 90;
    if (chute <= 0) return;
    ctx.save();
    ctx.translate(cx, cy + dy);
    ctx.rotate(-0.08);
    ctx.globalAlpha = Math.min(1, chute * 4);
    ctx.fillStyle = OR;
    ctx.strokeStyle = '#8a6a2f';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-l / 2, 0);
    ctx.lineTo(-l / 2 - l * 0.06, -h * 0.78);
    ctx.lineTo(-l * 0.24, -h * 0.36);
    ctx.lineTo(0, -h);
    ctx.lineTo(l * 0.24, -h * 0.36);
    ctx.lineTo(l / 2 + l * 0.06, -h * 0.78);
    ctx.lineTo(l / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff3d6';
    [
      [-l / 2 - l * 0.06, -h * 0.78],
      [0, -h],
      [l / 2 + l * 0.06, -h * 0.78],
    ].forEach((q) => {
      ctx.beginPath();
      ctx.arc(q[0], q[1], l * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.fillStyle = '#8a6a2f';
    ctx.fillRect(-l / 2, -h * 0.16, l, h * 0.07);
    ctx.fillStyle = '#e0574a';
    ctx.beginPath();
    ctx.arc(0, -h * 0.36, l * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function nomEtTotal(cx, y, d, corpsN, app) {
    if (app <= 0.01) return;
    const teinte = d.camp === 'or' ? OR : OMBRE,
      nom = reglages.nomsDonateurs !== false ? d.pseudo.slice(0, 18) : 'top supporter';
    ctx.save();
    ctx.globalAlpha = app;
    ctx.translate(0, (1 - app) * 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let c = corpsN;
    ctx.font = '800 ' + c + 'px system-ui, sans-serif';
    while (c > 20 && ctx.measureText(nom).width > 560) {
      c--;
      ctx.font = '800 ' + c + 'px system-ui, sans-serif';
    }
    ctx.fillStyle = teinte;
    ctx.fillText(nom, cx, y);
    ctx.font = '500 ' + Math.round(corpsN * 0.62) + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(d.total + ' coins', cx, y + corpsN * 0.95);
    ctx.restore();
  }
  function etincellesMvp(cx, cy, r0, r1, age, n, rgb) {
    for (let i = 0; i < n; i++) {
      const ph = (age * 0.45 + i / n) % 1,
        ang = i * 2.399 + age * 0.3,
        rr = r0 + (r1 - r0) * ph,
        a = Math.sin(ph * Math.PI);
      ctx.fillStyle = 'rgba(' + rgb + ',' + (0.85 * a).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(ang) * rr,
        cy + Math.sin(ang) * rr * 0.9,
        1.6 + 2.2 * a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  function peindreMvp(mode, age, titre, app) {
    const l = topDons(),
      m = l[0],
      cx = W / 2,
      rgb = m.camp === 'or' ? '242,197,124' : '180,212,222',
      teinte = m.camp === 'or' ? OR : OMBRE;
    if (mode === 'M3') {
      // podium : trois marches, le premier au centre, plus haut, couronne
      titre('TOP SUPPORTERS', 760);
      const base = L.finBase,
        marches = [
          { d: l[0], x: cx, hh: 190, r: 60, rang: 1 },
          { d: l[1], x: cx - 196, hh: 132, r: 46, rang: 2 },
          { d: l[2], x: cx + 196, hh: 100, r: 42, rang: 3 },
        ];
      marches.forEach((q, i) => {
        if (!q.d) return;
        const a = doux01((age - 0.4 - (i === 0 ? 0.5 : i === 1 ? 0 : 0.25)) / 0.6),
          tq = q.d.camp === 'or' ? '242,197,124' : '180,212,222',
          hh = q.hh * a;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8,12,10,0.80)';
        ctx.beginPath();
        ctx.roundRect(q.x - 92, base - hh, 184, hh, [18, 18, 6, 6]);
        ctx.fill();
        ctx.fillStyle = 'rgba(' + tq + ',' + (q.rang === 1 ? 0.12 : 0.06) + ')';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(' + tq + ',' + (q.rang === 1 ? 0.6 : 0.3) + ')';
        ctx.stroke();
        ctx.fillStyle = 'rgba(' + tq + ',0.16)';
        ctx.font = '900 ' + Math.round(Math.min(90, q.hh * 0.6)) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(q.rang), q.x, base - hh / 2 + 4);
        ctx.restore();
        const ay = base - hh - q.r - 14;
        peindreAvatar(q.x, ay, q.r, q.d, elast(a));
        if (q.rang === 1) {
          etincellesMvp(q.x, ay, q.r + 8, q.r + 54, age, 12, '255,238,206');
          couronne(q.x + 2, ay - q.r + 8, q.r * 1.25, (age - 1.5) / 0.7);
        }
        const nom = reglages.nomsDonateurs !== false ? q.d.pseudo.slice(0, 11) : '#' + q.rang;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = q.d.camp === 'or' ? OR : OMBRE;
        let c = q.rang === 1 ? 26 : 22;
        ctx.font = '700 ' + c + 'px system-ui, sans-serif';
        while (c > 15 && ctx.measureText(nom).width > 168) {
          c--;
          ctx.font = '700 ' + c + 'px system-ui, sans-serif';
        }
        ctx.fillText(nom, q.x, base - hh + 24);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '500 20px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText(String(q.d.total), q.x, base - hh + 52);
        ctx.restore();
      });
      return;
    }
    titre('MVP OF THE ROUND', 748);
    const ay = 900,
      AR = 84,
      a0 = (age - 0.5) / 0.7;
    if (mode === 'M1') {
      // rayons doux qui tournent derriere la photo
      ctx.save();
      ctx.translate(cx, ay);
      ctx.rotate(age * 0.35);
      ctx.globalAlpha = 0.5 * doux01(a0);
      for (let i = 0; i < 14; i++) {
        ctx.rotate((Math.PI * 2) / 14);
        ctx.fillStyle = 'rgba(' + rgb + ',' + (i % 2 ? 0.1 : 0.17) + ')';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-13, -AR - 78);
        ctx.lineTo(13, -AR - 78);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (mode === 'M2' && a0 > 0) {
      // le vrai serpent, a la couleur du camp du MVP, tourne autour de sa photo
      const rr = AR + 30,
        tete = -Math.PI / 2 + age * 1.5,
        long = Math.min(1, a0) * 4.6,
        pts = [];
      for (let u = 0; u <= long; u += 0.07)
        pts.push({ x: cx + Math.cos(tete - u) * rr, y: ay + Math.sin(tete - u) * rr });
      miniSerpent(pts, teinte, 0.5);
    }
    peindreAvatar(cx, ay, AR, m, elast(a0));
    etincellesMvp(cx, ay, AR + 10, AR + (mode === 'M2' ? 70 : 90), age, 16, '255,238,206');
    couronne(cx + 3, ay - AR + 12, AR * 1.15, (age - 1.2) / 0.7);
    nomEtTotal(cx, ay + AR + (mode === 'M2' ? 66 : 50), m, 44, doux01((age - 1.0) / 0.5));
    l.slice(1, 3).forEach((d, i) =>
      ligneClassement(
        i === 0 ? cx - 310 : cx + 8,
        1150,
        302,
        70,
        d,
        i + 2,
        app(i + 3),
        false,
        false,
      ),
    );
  }
  // Le panneau du classement (Abdel : « not separated and isolated well enough with the background, it feels like
  // just floating ») : une vraie carte opaque, bordee de la couleur du premier, avec un filet clair en haut et une
  // ombre portee faite de contours fondus (pas de flou), qui pose le classement devant le plateau.
  function panneauClassement(y0, y1, rgb, a) {
    if (a <= 0.01) return;
    const x0 = W / 2 - 352,
      w = 704,
      h = y1 - y0,
      rr = 34;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 26);
    for (let i = 5; i >= 1; i--) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.07).toFixed(2) + ')';
      ctx.beginPath();
      ctx.roundRect(x0 - i * 5, y0 - i * 4 + 10, w + i * 10, h + i * 8, rr + i * 5);
      ctx.fill();
    }
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(22,30,26,0.97)');
    g.addColorStop(1, 'rgba(9,13,11,0.97)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, rr);
    ctx.fill();
    ctx.fillStyle = 'rgba(' + rgb + ',0.05)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.42)';
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, rr);
    ctx.clip();
    const hl = ctx.createLinearGradient(0, y0, 0, y0 + 90);
    hl.addColorStop(0, 'rgba(255,255,255,0.07)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x0, y0, w, 90);
    ctx.restore();
    ctx.restore();
  }
  function peindreClassement(k) {
    const mode = reglages.classement,
      age = manche.fin - 2.0,
      cx = W / 2,
      app = (i) => doux01((age - 0.5 - i * 0.22) / 0.5);
    const titre = (txt, y) => {
      ctx.save();
      ctx.globalAlpha = doux01((age - 0.3) / 0.5) * 0.85;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      try {
        ctx.letterSpacing = '4px';
      } catch (e) {}
      ctx.fillText(txt, cx, y);
      ctx.restore();
    };
    {
      const pr = topDons()[0],
        prgb = pr && pr.camp === 'ombre' ? '180,212,222' : '242,197,124';
      panneauClassement(
        /^M/.test(mode) ? 706 : 832,
        /^M/.test(mode) ? 1222 : mode === 'C3' ? 1150 : 1236,
        prgb,
        doux01((age - 0.05) / 0.6),
      );
    }
    if (/^M/.test(mode)) {
      peindreMvp(mode, age, titre, app);
      return;
    }
    if (mode === 'C1') {
      titre('TOP SUPPORTERS', 872);
      topDons()
        .slice(0, 3)
        .forEach((d, i) =>
          ligneClassement(
            cx - 300,
            940 + i * 96,
            600,
            i === 0 ? 88 : 78,
            d,
            i + 1,
            app(i),
            false,
            i === 0,
          ),
        );
    }
    if (mode === 'C2') {
      titre('TOP SUPPORTERS', 872);
      ['or', 'ombre'].forEach((camp, c) =>
        topDons(camp)
          .slice(0, 3)
          .forEach((d, i) =>
            ligneClassement(
              c === 0 ? cx - 392 : cx + 12,
              940 + i * 92,
              380,
              78,
              d,
              i + 1,
              app(i),
              c === 1,
              false,
            ),
          ),
      );
    }
    if (mode === 'C3') {
      const l = topDons();
      titre('MVP OF THE ROUND', 884);
      ligneClassement(cx - 310, 968, 620, 104, l[0], 1, app(0), false, true);
      l.slice(1, 3).forEach((d, i) =>
        ligneClassement(
          i === 0 ? cx - 310 : cx + 8,
          1086,
          302,
          70,
          d,
          i + 2,
          app(i + 1),
          false,
          false,
        ),
      );
    }
  }

  // Anime la naissance du serpent : un oeuf se pose, se fend et eclate.
  // Appeler a chaque image avec u de 0 a 1. Purement visuel, aucun effet de bord.
  // La naissance : l'oeuf respire, il se fend, il retient son souffle, puis il eclate
  // et le serpent en sort. Tout est en fonctions douces, rien ne demarre ni ne s'arrete net.
  const doux = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const sortant = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const bruit = (i, d) => {
    const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  function peindreCoquille(u) {
    const p = px(couvee.x, couvee.y),
      t = couvee.t;
    const RX = CELL * 0.5,
      RY = CELL * 0.66;
    const S = SORTIE; // instant de la rupture, en fraction de l'animation
    const av = Math.min(1, u / S); // avant la rupture
    const ap = Math.max(0, (u - S) / (1 + TRAINE / ECLOSION - S)); // apres, jusqu'a l'effacement complet

    ctx.save();
    ctx.translate(p.x, p.y);

    if (u < S) {
      // 1. il respire et il tremble, de plus en plus, puis il se fige juste avant de ceder
      const souffle = doux(av / 0.82); // montee de l'agitation
      const retenue = doux(Math.max(0, (av - 0.82) / 0.18)); // le temps suspendu avant la rupture
      const vif = 1 - retenue;
      const frq = 16 + 26 * souffle;
      const bal = Math.sin(t * frq) * 3.6 * souffle * vif;
      const roul = Math.sin(t * frq * 0.5) * 0.09 * souffle * vif;
      // ecrase et etire : il se tasse quand il tremble, il s'allonge quand il retient
      const ec = 1 + 0.07 * Math.sin(t * frq * 2) * souffle * vif + 0.1 * retenue;
      const el = 1 - 0.05 * Math.sin(t * frq * 2) * souffle * vif - 0.06 * retenue;
      const rx = RX * el,
        ry = RY * ec;

      ctx.translate(bal, 0);
      ctx.rotate(roul);
      // l'ombre, qui se resserre quand il se dresse
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = 'rgba(5,8,6,0.65)';
      ctx.beginPath();
      ctx.ellipse(0, RY * 0.94, rx * (0.95 - 0.2 * retenue), RY * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // le halo, qui grandit puis se ramasse sur l'oeuf avant la rupture
      const halo = souffle * (1 - 0.55 * retenue);
      if (halo > 0.01) {
        const R = ry * (1.35 + 0.7 * halo),
          g = ctx.createRadialGradient(0, 0, ry * 0.5, 0, 0, R);
        g.addColorStop(0, 'rgba(246,243,234,' + (0.16 * halo + 0.22 * retenue) + ')');
        g.addColorStop(1, 'rgba(246,243,234,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
      }

      oeuf(rx, ry, 1);

      // les fentes : elles s'allongent depuis le sommet, de plus en plus nombreuses
      const f = doux(Math.max(0, (av - 0.28) / 0.62));
      if (f > 0.01) {
        ctx.save();
        ctx.strokeStyle = 'rgba(66,72,64,' + (0.55 + 0.4 * f) + ')';
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const dep = (k - 1) * rx * 0.42,
            part = Math.min(1, Math.max(0, (f - k * 0.16) / 0.5));
          if (part <= 0) continue;
          ctx.beginPath();
          ctx.moveTo(dep, -ry * 0.55);
          const n = 5;
          for (let i = 1; i <= n; i++) {
            const q = (i / n) * part;
            ctx.lineTo(
              dep + (bruit(k * 7 + i, 1) - 0.5) * rx * 0.55 * q,
              -ry * 0.55 + ry * 1.25 * q,
            );
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // 2. la rupture : la lumiere jaillit, les morceaux partent en arc et retombent
      const e = sortant(ap * 1.35),
        f = 1 - doux(Math.max(0, (ap - 0.45) / 0.55));

      // l'eclair, bref, puis l'anneau qui s'ouvre et s'efface
      const fl = Math.max(0, 1 - ap * 5.5);
      if (fl > 0.01) {
        const R = RY * (1 + 2.6 * (1 - fl)),
          g = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
        g.addColorStop(0, 'rgba(255,250,236,' + 0.9 * fl + ')');
        g.addColorStop(0.4, 'rgba(242,197,124,' + 0.55 * fl + ')');
        g.addColorStop(1, 'rgba(242,197,124,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
      }
      const ao = sortant(ap * 2.2),
        av2 = Math.max(0, 1 - ap * 2.6);
      if (av2 > 0.01) {
        ctx.strokeStyle = 'rgba(255,247,228,' + 0.6 * av2 + ')';
        ctx.lineWidth = 3 * av2 + 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, RY * (0.6 + 2.4 * ao), 0, Math.PI * 2);
        ctx.stroke();
      }

      // huit morceaux de coquille, chacun sur son arc, qui tournent et retombent
      const T = ap * 1.5;
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (bruit(i, 3) - 0.5) * 2.6 + (i - 3.5) * 0.34;
        const vit = CELL * (1.5 + bruit(i, 5) * 1.7),
          tour = (bruit(i, 7) - 0.5) * 9;
        const x = Math.cos(a) * vit * T,
          y = Math.sin(a) * vit * T + CELL * 3.4 * T * T;
        const al = f * (0.85 + 0.15 * bruit(i, 9));
        if (al <= 0.01) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tour * T);
        ctx.globalAlpha = al;
        ctx.fillStyle = COQUILLE;
        ctx.shadowColor = 'rgba(246,243,234,0.5)';
        ctx.shadowBlur = 10;
        const w = RX * (0.3 + 0.22 * bruit(i, 11)),
          h = RY * (0.26 + 0.2 * bruit(i, 13));
        ctx.beginPath();
        ctx.moveTo(-w, h * 0.5);
        ctx.quadraticCurveTo(-w * 0.5, -h, w * 0.6, -h * 0.4);
        ctx.quadraticCurveTo(w, h * 0.2, 0, h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // les deux moities, qui s'ouvrent comme un couvercle avant de partir
      [1, -1].forEach((sg) => {
        if (f <= 0.01) return;
        ctx.save();
        ctx.translate(sg * RX * 1.5 * e, (sg < 0 ? 1 : -1) * RY * 1.3 * e + CELL * 2.2 * T * T);
        ctx.rotate(sg * e * 1.5);
        ctx.globalAlpha = f;
        oeuf(RX, RY, sg > 0 ? 0.5 : -0.5);
        ctx.restore();
      });
    }
    ctx.restore();

    // une moitie d'oeuf, ou l'oeuf entier : part vaut 1 pour tout, 0.5 le haut, -0.5 le bas
    function oeuf(rx, ry, part) {
      const pts = [];
      for (let i = 0; i <= 52; i++) {
        const a = (i / 52) * Math.PI * 2,
          c = Math.cos(a),
          si = Math.sin(a);
        const k = 1 - 0.17 * Math.max(0, -si); // sommet plus etroit que la base
        const x = c * rx * k,
          y = si * ry;
        if (part === 1 || (part > 0 ? y <= 0.5 : y >= -0.5)) pts.push([x, y]);
      }
      if (!pts.length) return;
      ctx.beginPath();
      pts.forEach((q, i) => {
        if (i) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
      });
      ctx.closePath();
      const g = ctx.createLinearGradient(-rx, -ry, rx * 0.7, ry);
      g.addColorStop(0, '#FFFFFC');
      g.addColorStop(0.55, COQUILLE);
      g.addColorStop(1, '#D9D5C8');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(246,243,234,0.45)';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(120,128,118,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // un reflet doux en haut a gauche, c'est ce qui fait qu'on y croit
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-rx * 0.34, -ry * 0.34, rx * 0.28, ry * 0.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Une baie mangee ne projette rien : elle s'allume sur place et se retire lentement.
  const LUEUR = { offerte: '242,197,124', nature: '207,227,198' };
  function peindreHalos() {
    if (!halos.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    halos.forEach((h) => {
      const u = h.t / h.duree;
      // montee vive sur le premier cinquieme, puis une longue decrue douce
      const i = u < 0.2 ? u / 0.2 : Math.pow(1 - (u - 0.2) / 0.8, 1.9);
      const R = CELL * (0.55 + 1.25 * u),
        c =
          h.teinte === 'offerte-or'
            ? '242,197,124'
            : h.teinte === 'offerte-ombre'
              ? '180,212,222'
              : h.teinte === 'offerte' && duel()
                ? '155,226,138'
                : LUEUR[h.teinte] || LUEUR.nature;
      const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, R);
      g.addColorStop(0, 'rgba(' + c + ',' + 0.4 * i + ')');
      g.addColorStop(0.35, 'rgba(' + c + ',' + 0.18 * i + ')');
      g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
      ctx.fill();
      // un coeur net au tout debut, le temps que l'oeil accroche
      if (u < 0.35) {
        const j = 1 - u / 0.35;
        ctx.fillStyle = 'rgba(' + c + ',' + 0.35 * j * j + ')';
        ctx.beginPath();
        ctx.arc(h.x, h.y, 7 * j + 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function peindreEtincelles() {
    ctx.save();
    etincelles.forEach((e) => {
      const u = 1 - e.t / e.duree,
        r = e.r === undefined ? 1 : e.r,
        a = e.a === undefined ? 1 : e.a;
      ctx.globalAlpha = u * u * u * 0.9 * a;
      ctx.fillStyle =
        e.teinte === 'offerte'
          ? teinteBaie()
          : e.teinte === 'offerte-or'
            ? OR
            : e.teinte === 'offerte-ombre'
              ? OMBRE
              : e.teinte === 'rodeur'
                ? ROUGE
                : e.teinte === 'coquille'
                  ? COQUILLE
                  : e.teinte === 'poussiere'
                    ? '#6b7383'
                    : '#cfe3c6';
      ctx.beginPath();
      ctx.arc(
        e.x,
        e.y,
        (e.teinte.indexOf('offerte') === 0 ? 3.5 * u + 1 : 2.5 * u + 0.8) * r,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
    ctx.restore();
  }

  // La tension, ce qui resserre l'image. L'avancement de la manche ne dit rien du risque :
  // on peut etre a une baie de gagner en pleine ouverture, ou coince des la deuxieme. Trois
  // choses la nourrissent : l'espace encore atteignable depuis la tete, la longueur du serpent,
  // et les cases mortes qui la touchent. Elle monte vite, elle redescend lentement.
  let tension = 0,
    tensionCible = 0,
    tensionT = 0;
  function mesurerTension() {
    if (!serpent.length) return 0;
    const tete = serpent[0],
      mur = new Set();
    for (let i = 0; i < serpent.length - 1; i++) mur.add(serpent[i].x + ',' + serpent[i].y);
    if (duel()) {
      const a = autre();
      if (a) a.serpent.forEach((s) => mur.add(s.x + ',' + s.y));
    }
    rochers.forEach((r) => {
      if (r.t >= ALERTE) mur.add(r.x + ',' + r.y);
    });
    roncesDures().forEach((g) => mur.add(g.x + ',' + g.y));
    const VOISINS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    // 1. on remplit tout ce qui est atteignable depuis la tete, le plateau est petit
    const vus = new Set([tete.x + ',' + tete.y]);
    let file = [tete],
      n = 0;
    while (file.length) {
      const suiv = [];
      for (const c of file) {
        for (const d of VOISINS) {
          const x = c.x + d[0],
            y = c.y + d[1],
            k = x + ',' + y;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS || vus.has(k) || mur.has(k)) continue;
          vus.add(k);
          n++;
          suiv.push({ x, y });
        }
      }
      file = suiv;
    }
    const libres = Math.max(1, COLS * ROWS - mur.size);
    // ce qui est coupe : le serpent s'est enferme dans une poche du plateau
    const coupe = 1 - Math.min(1, n / libres);
    // ce qui est etroit : meme sans poche, il ne reste plus de quoi manoeuvrer
    const etroit = 1 - Math.min(1, n / (serpent.length * 2 + 16));
    // la longueur seule, qui pese meme quand tout est ouvert
    const longueur = Math.min(1, serpent.length / (COLS * ROWS * 0.3));
    // ce qui touche deja la tete : mur, corps ou rocher pose
    let morts = 0;
    for (const d of VOISINS) {
      const x = tete.x + d[0],
        y = tete.y + d[1];
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || mur.has(x + ',' + y)) morts++;
    }
    const colle = Math.min(1, morts / 3);
    // les pierres posees : chacune retire une case et ferme une ligne de fuite
    const pierres = Math.min(
      1,
      rochers.filter((r) => r.t >= ALERTE).length / Math.max(1, palier.maxRochers),
    );
    return Math.max(
      0,
      Math.min(1, 0.3 * coupe + 0.25 * etroit + 0.28 * longueur + 0.1 * colle + 0.07 * pierres),
    );
  }

  // Calque de debug IA (super admin). Par serpent, dans la couleur de son camp : trajet vers la baie
  // visee, rayons de vue (losanges de Manhattan 12 attaque, 10 defense), pas candidats notes, couronne
  // adverse evitee, etiquette posture/raison/poche, flash garde (vert) ou change (rouge) a chaque case.
  function peindreDebugIA() {
    for (let i = 0; i < corps.length; i++) {
      charger(i);
      const g = memoireIA.debug,
        h = serpent[0];
      if (!g || !h) {
        ranger();
        continue;
      }
      const rgb = i === 0 ? '242,197,124' : '180,212,222',
        c = (a) => 'rgba(' + rgb + ',' + a + ')',
        p = px(h.x, h.y);
      ctx.save();
      // 2. rayons de vue
      const losange = (r, alpha, tiret) => {
        ctx.setLineDash(tiret);
        ctx.strokeStyle = c(alpha);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * CELL);
        ctx.lineTo(p.x + r * CELL, p.y);
        ctx.lineTo(p.x, p.y + r * CELL);
        ctx.lineTo(p.x - r * CELL, p.y);
        ctx.closePath();
        ctx.stroke();
      };
      ctx.beginPath();
      ctx.rect(X0, Y0, COLS * CELL, ROWS * CELL);
      ctx.clip();
      // Super IA : territoire de Voronoi teinte par camp (vu par Or, peint une fois), et la reponse
      // que ce serpent PREDIT chez l'adversaire (pointille blanc partant de la tete adverse)
      if (g.superIA) {
        const S = g.superIA,
          advC = corps[1 - i];
        if (i === 0 && S.vor)
          for (let n = 0; n < S.vor.length; n++) {
            const l = S.vor[n];
            if (l !== 1 && l !== 2) continue;
            const vx = n % COLS,
              vy = (n - vx) / COLS;
            ctx.fillStyle = l === 1 ? 'rgba(242,197,124,0.10)' : 'rgba(180,212,222,0.10)';
            ctx.fillRect(X0 + vx * CELL + 2, Y0 + vy * CELL + 2, CELL - 4, CELL - 4);
          }
        if (S.adv && S.adv.length && advC && advC.serpent[0]) {
          const o0 = px(advC.serpent[0].x, advC.serpent[0].y);
          ctx.setLineDash([5, 6]);
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(o0.x, o0.y);
          S.adv.forEach((q) => {
            const o = px(q.x, q.y);
            ctx.lineTo(o.x, o.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Ligne de direction facon Rocket League : trait plein = pas en cours (dir), trait pointille
      // blanc = intent decide par l'IA pour la prochaine case (dirProchaine), s'il differe.
      // Trajectoire anticipee facon indicateur de balle Rocket League : simulation greedy des 10
      // prochains pas. A chaque case, on prend la direction qui minimise la distance a la cible (baie
      // visee par l'IA, ou tete adverse s'il n'y en a pas), en evitant le corps. Le premier pas
      // respecte dirProchaine (l'intent decide). Resultat : une ligne courbe reelle, pas un rail.
      const pts = [{ x: p.x, y: p.y }];
      const autreC = duel() ? corps[1 - actif] : null;
      const cibleAnt = g.cible || (autreC && autreC.serpent[0]);
      let hx = h.x,
        hy = h.y,
        dx = dir.x,
        dy = dir.y;
      const occ = new Set(serpent.map((s) => s.y * COLS + s.x));
      // Super IA : la ligne est la VRAIE variante principale calculee par la recherche, pas une estimation
      const pvSuper = !!(g.superIA && g.route && g.route.length);
      if (pvSuper)
        g.route.forEach((q) => {
          const o = px(q.x, q.y);
          pts.push({ x: o.x, y: o.y });
        });
      for (let k = 0; k < 10 && !pvSuper; k++) {
        // premier pas : on impose dirProchaine ; ensuite : la direction qui rapproche le plus de la cible
        let best = null;
        if (k === 0) {
          best = { x: dirProchaine.x, y: dirProchaine.y };
          const nx = hx + best.x,
            ny = hy + best.y;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || occ.has(ny * COLS + nx)) best = null;
        }
        if (!best) {
          let bestD = 1e9;
          for (const cand of [
            { x: dx, y: dy },
            { x: -dy, y: dx },
            { x: dy, y: -dx },
          ]) {
            const nx = hx + cand.x,
              ny = hy + cand.y;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            if (occ.has(ny * COLS + nx)) continue;
            const d = cibleAnt ? Math.abs(cibleAnt.x - nx) + Math.abs(cibleAnt.y - ny) : k;
            if (d < bestD) {
              bestD = d;
              best = cand;
            }
          }
        }
        if (!best) break;
        hx += best.x;
        hy += best.y;
        dx = best.x;
        dy = best.y;
        occ.add(hy * COLS + hx);
        const o = px(hx, hy);
        pts.push({ x: o.x, y: o.y });
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = c(0.9);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();
      // pointe a l'extremite
      const a = pts[pts.length - 2] || pts[0],
        b = pts[pts.length - 1];
      const ddx = b.x - a.x,
        ddy = b.y - a.y,
        nn = Math.max(1, Math.hypot(ddx, ddy)),
        ux = ddx / nn,
        uy = ddy / nn,
        tp = 14;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ux * tp - uy * tp * 0.6, b.y - uy * tp + ux * tp * 0.6);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ux * tp + uy * tp * 0.6, b.y - uy * tp - ux * tp * 0.6);
      ctx.stroke();
      // petits points aux cases anticipees
      ctx.fillStyle = c(0.85);
      for (let k = 1; k < pts.length; k++) {
        ctx.beginPath();
        ctx.arc(pts[k].x, pts[k].y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!g.superIA)
        losange(g.porteeAttaque || 12, g.posture === 'attaque' ? 0.55 : 0.22, [10, 8]);
      if (!g.superIA) losange(g.porteeDefense || 10, g.posture === 'defense' ? 0.55 : 0.22, [3, 6]);
      // 4. couronne adverse evitee
      ctx.setLineDash([]);
      (memoireIA.dbgEviter || []).forEach((q) => {
        const o = px(q.x, q.y),
          r = CELL / 2 - 3;
        ctx.fillStyle = 'rgba(255,90,90,0.10)';
        ctx.fillRect(o.x - r, o.y - r, 2 * r, 2 * r);
        ctx.strokeStyle = 'rgba(255,90,90,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = -2; k <= 2; k++) {
          ctx.moveTo(o.x - r + Math.max(0, k) * r, o.y + r - Math.max(0, -k) * r);
          ctx.lineTo(o.x + r + Math.min(0, k) * r, o.y - r - Math.min(0, -k) * r);
        }
        ctx.stroke();
      });
      // 1. baie visee : cerclee (le trajet est deja peint plus haut, en trajectoire anticipee)
      if (g.cible) {
        const o = px(g.cible.x, g.cible.y);
        ctx.strokeStyle = c(0.95);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(o.x, o.y, CELL * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 3. pas candidats : fleche notee, croix si refuse
      const notes = Object.keys(g.scores)
        .map((k) => g.scores[k])
        .filter((v) => typeof v === 'number');
      const mx = notes.length ? Math.max(...notes) : 0,
        mn = notes.length ? Math.min(...notes) : 0;
      Object.keys(g.scores).forEach((cle) => {
        const v = g.scores[cle],
          [dx, dy] = cle.split(',').map(Number),
          o = { x: p.x + dx * CELL * 0.95, y: p.y + dy * CELL * 0.95 };
        const choisi = g.choix && g.choix.x === dx && g.choix.y === dy;
        if (typeof v === 'number' || v === 'ok') {
          const f = typeof v === 'number' ? (mx > mn ? (v - mn) / (mx - mn) : 1) : 0.5;
          ctx.strokeStyle = choisi ? 'rgba(255,255,255,0.95)' : c(0.3 + 0.5 * f);
          ctx.lineWidth = choisi ? 5 : 1.5 + 3 * f;
          ctx.beginPath();
          ctx.moveTo(p.x + dx * CELL * 0.35, p.y + dy * CELL * 0.35);
          ctx.lineTo(o.x, o.y);
          ctx.lineTo(o.x - dx * 9 - dy * 7, o.y - dy * 9 - dx * 7);
          ctx.moveTo(o.x, o.y);
          ctx.lineTo(o.x - dx * 9 + dy * 7, o.y - dy * 9 + dx * 7);
          ctx.stroke();
          if (typeof v === 'number') {
            ctx.font = 'bold 13px sans-serif';
            ctx.fillStyle = c(0.95);
            ctx.textAlign = 'center';
            ctx.fillText(v.toFixed(1), o.x + dx * 14, o.y + dy * 14 + 4);
          }
        } else {
          ctx.strokeStyle = 'rgba(255,80,80,0.85)';
          ctx.lineWidth = 3;
          const r = 7;
          ctx.beginPath();
          ctx.moveTo(o.x - r, o.y - r);
          ctx.lineTo(o.x + r, o.y + r);
          ctx.moveTo(o.x + r, o.y - r);
          ctx.lineTo(o.x - r, o.y + r);
          ctx.stroke();
        }
      });
      // 6. flash au franchissement : garde (vert) ou change (rouge)
      const fl = memoireIA.dbgFlash;
      if (fl && t - fl.t < 0.35) {
        const o = px(fl.x, fl.y),
          u = (t - fl.t) / 0.35;
        ctx.strokeStyle = fl.change
          ? 'rgba(255,70,70,' + (1 - u) + ')'
          : 'rgba(110,255,140,' + 0.8 * (1 - u) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(o.x, o.y, CELL * (0.45 + 0.4 * u), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      // Super IA : barre d'evaluation facon echecs au-dessus du plateau (part d'Or a gauche), une seule fois
      if (g.superIA && i === 0) {
        const S = g.superIA,
          bx = X0,
          by = Y0 - 34,
          bw = COLS * CELL,
          part = Math.max(0.04, Math.min(0.96, 0.5 + S.valeur / 300));
        ctx.save();
        ctx.fillStyle = 'rgba(180,212,222,0.85)';
        ctx.fillRect(bx, by, bw, 10);
        ctx.fillStyle = 'rgba(242,197,124,0.95)';
        ctx.fillRect(bx, by, bw * part, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(bx + bw / 2 - 1, by - 3, 2, 16);
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
          'Super IA   prof ' +
            S.prof +
            '   ' +
            S.noeuds +
            ' noeuds   eval Or ' +
            (S.valeur > 0 ? '+' : '') +
            S.valeur.toFixed(0) +
            '   territoire ' +
            S.terrMoi +
            ' / ' +
            S.terrLui,
          bx,
          by - 8,
        );
        ctx.restore();
      }
      // 5. etiquette (hors clip, au-dessus de la tete)
      const txt =
        (g.posture || 'neutre') +
        ' | ' +
        (g.raison || '?') +
        ' | poche ' +
        (g.poche != null ? g.poche : '?') +
        (g.piege != null ? ' | adv ' + g.piege : '');
      ctx.save();
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(txt).width + 14,
        ey = p.y - CELL * 1.1;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(p.x - w / 2, ey - 15, w, 21);
      ctx.fillStyle = c(1);
      ctx.fillText(txt, p.x, ey);
      ctx.restore();
      ranger();
    }
    charger(0);
  }

  // Mode fluide : on masque la propriete shadowBlur du canevas principal (elle devient sans effet), et on la
  // rend quand le mode est coupe. Une seule bascule, aucun des 47 endroits qui posent un flou n'est touche.
  let fluideActif = false;
  function reglerFluide() {
    const veut = !!reglages.fluide;
    if (veut === fluideActif || !ctx) return;
    if (veut)
      Object.defineProperty(ctx, 'shadowBlur', {
        set() {},
        get() {
          return 0;
        },
        configurable: true,
      });
    else delete ctx.shadowBlur;
    fluideActif = veut;
  }
  function dessiner(dt) {
    reglerFluide();
    const a = amb(),
      tete = trace.length ? trace[0] : { x: W / 2, y: H / 2 };
    const e = {
      t,
      dt,
      W,
      H,
      cell: CELL,
      x0: X0,
      y0: Y0,
      cols: COLS,
      rows: ROWS,
      tete,
      monde: 0,
      mondeSorte: null,
      silence: 0,
      heure: reglages.heure,
      meteo: reglages.meteo,
      meteoNet: !!(manche && manche.etat === 'en cours' && manche.t < 0.3 && reglages.ambianceAuto),
      avance:
        reglages.avanceForcee !== undefined
          ? reglages.avanceForcee
          : manche && duel()
            ? Math.min(1, (manche.t || 0) / Math.max(1, reglages.dureeDuel || reglages.duree))
            : 0,
      progression: 0,
      tension: tension,
      reduit: !!(
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ),
    };
    if (!a) {
      ctx.fillStyle = '#141e17';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    // En 16:9 l'ambiance couvre tout le cadre (les cotes compris) : on lui passe la largeur totale et on la
    // decale de la marge ; le jeu et le HUD, eux, restent dessines dans la composition verticale intacte.
    const enCadre = (f) => {
      if (!OX) return f(e);
      const sW = e.W,
        sX = e.x0,
        sT = e.tete;
      e.W = WF;
      e.x0 = X0 + OX;
      e.tete = { x: sT.x + OX, y: sT.y };
      ctx.save();
      ctx.translate(-OX, 0);
      try {
        return f(e);
      } finally {
        ctx.restore();
        e.W = sW;
        e.x0 = sX;
        e.tete = sT;
      }
    };
    enCadre((e2) => a.peindreFond(ctx, e2));
    ctx.save();
    peindreCourse();
    peindreOffrandes();
    peindreRochers();
    peindreRonces();

    for (let _i = 0; _i < corps.length; _i++) {
      charger(_i);
      a.peindreSerpent(ctx, trace, CELL, {
        ...e,
        teinte: duel() ? corps[actif].teinte : undefined,
      });
      if (duel() && corps[actif].bouclierT > 0 && trace.length) {
        // bouclier actif : bulle autour de la tete, qui respire, et qui s'affine sur les 3 dernieres secondes
        const h = trace[0],
          bt = corps[actif].bouclierT,
          fin = Math.min(1, bt / 3);
        const rgb = actif === 0 ? '242,197,124' : '180,212,222';
        const R = CELL * (0.62 + 0.04 * Math.sin(t * 5));
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.45 * fin;
        const g = ctx.createRadialGradient(h.x, h.y, R * 0.55, h.x, h.y, R);
        g.addColorStop(0, 'rgba(' + rgb + ',0)');
        g.addColorStop(0.8, 'rgba(' + rgb + ',0.35)');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * fin) + ')';
        ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(h.x, h.y, R * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (couvee) peindreCoquille(couvee.t / ECLOSION);
      ranger();
    }
    charger(0);
    if (reglages.debugIA && duel()) peindreDebugIA();
    // Mesure de fluidite (calque Debug IA seulement) : images par seconde lissees et pire image des 2 dernieres secondes
    ipsLisse += ((dt > 0 ? 1 / dt : 60) - ipsLisse) * 0.05;
    pireT += dt;
    if (dt > pireDt) pireDt = dt;
    if (pireT > 2) {
      pireAffiche = pireDt;
      pireDt = 0;
      pireT = 0;
    }
    if (reglages.debugIA) {
      ctx.save();
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(20, 20, 330, 34);
      ctx.fillStyle = ipsLisse < 50 ? '#ff6a5a' : '#9be28a';
      ctx.fillText(
        Math.round(ipsLisse) + ' ips   pire image ' + Math.round(pireAffiche * 1000) + ' ms',
        28,
        45,
      );
      ctx.restore();
    }
    peindreHalos();
    peindreEtincelles();
    ctx.restore();
    dtRendu = dt;
    peindreManche();
    enCadre((e2) => a.peindreAvant(ctx, e2));
    peindreScore();
    const avecCadeaux = reglages.plateforme !== 'neutre';
    if (duel()) {
      if (avecCadeaux) peindreStatutsDuel();
    }
    // affichageCadeaux : 'defile' (bandeaux qui defilent, avec le pattern visible/cache), 'complet' (ancienne legende), 'aucun' (rien)
    if (avecCadeaux) {
      const mA = reglages.affichageCadeaux || 'complet';
      if (mA === 'defile') peindreDefileCadeaux();
      else if (mA === 'complet') peindreLegendeDuel();
    }
    // Ecran de fin du duel, peint APRES le score et la legende (Abdel : « your grey veil just apply to gift and do
    // not consider the whole screen, make it smoother ») : un seul voile, plein ecran, et le classement devant tout.
    if (duel() && manche && manche.etat !== 'en cours') peindreFin();
    peindreBandeau();
    if (reglages.maquette) peindreMaquetteLive();
    enCadre((e2) => a.maj(dt, e2));
    if (reglages.zones) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      // ce que l'interface TikTok recouvre, aux positions MESUREES sur la capture d'Abdel
      ctx.fillStyle = '#f0f';
      ctx.fillRect(0, 0, W, SR_Y);
      ctx.fillRect(0, SR_Y + SR_H, W, H - SR_Y - SR_H);
      ctx.fillStyle = '#ff0';
      [Z_CADEAUX, Z_BANNIERE, Z_FIL, Z_SAISIE].forEach((z) => ctx.fillRect(z.x, z.y, z.w, z.h));
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 3;
      ctx.strokeRect(SR_X + 2, SR_Y, SR_W - 4, SR_H);
      ctx.restore();
    }
  }

  let dernier = 0;
  function boucle(ts) {
    const now = ts / 1000,
      dt = Math.min(now - dernier, 0.1);
    dernier = now;
    const n = reglages.temps;
    for (let i = 0; i < n; i++) avancer(dt);
    // trace calculee par corps ; invariant corps[0] charge a l'issue
    // ranger() recopie la variable de module `trace` dans le corps : c'est donc elle qu'on remplit
    for (let _i = 0; _i < corps.length; _i++) {
      charger(_i);
      trace = tracer();
      ranger();
    }
    charger(0);
    trace = corps[0] ? corps[0].trace : [];
    try {
      dessiner(dt);
    } catch (er) {
      erreurs++;
      derniereErreur = 'rendu: ' + er.message + ' | ' + premiereLigne(er);
    }
    requestAnimationFrame(boucle);
  }

  function basculerSon() {
    armerSon();
    sonActif = !sonActif;
    return sonActif;
  }

  window.VipereBase = {
    reglages,
    naitre,
    avancer,
    basculerSon,
    nouvelleManche,
    tension: () => tension,
    // Scène courante (super admin) : lecture, lancement par nom, arrêt immédiat.
    scene: () =>
      scene && {
        nom: scene.nom,
        restant: Math.max(0, scene.restant),
        duree: SCENES[scene.nom] && SCENES[scene.nom].duree,
        or: scene.or || {},
        ombre: scene.ombre || {},
      },
    lancerScene: (nom, duree) => {
      const d = SCENES[nom];
      if (!d) return;
      scene = { nom, restant: duree || d.duree, or: d.or || {}, ombre: d.ombre || {} };
    },
    stopScene: () => {
      finirScene();
    },
    finirTest: (camp) => {
      if (duel()) finir(camp || 'or', 'test');
    },
    sonActif: () => sonActif,
    palier: () => ({
      id: palier.id,
      cadence: Math.round(cadence),
      hautSun: manche ? Math.round(manche.hautSun) : palier.cielSun,
      hautMoon: manche ? Math.round(manche.hautMoon) : palier.cielMoon,
    }),
    manche: () =>
      manche && {
        etat: manche.etat,
        t: manche.t,
        sun: manche.sun,
        moon: manche.moonEv,
        vainqueur: manche.vainqueur,
        cielSun: manche.cielSun,
        cielMoon: manche.cielMoon,
        recolte: manche.recolte,
        cible: manche.cible,
      },
    manches: () => manches,
    score: () => ({ serpent: scoreSerpent, viewers: scoreViewers }),
    remettreScore: () => {
      scoreSerpent = 0;
      scoreViewers = 0;
      pulseS = 9;
      pulseV = 9;
    },
    tremble: () => ({ retouches, gardes }),
    mesures: () => ({
      longueur: serpent.length,
      bouchees,
      morts,
      erreurs,
      derniereErreur,
      t,
      virages,
      escaliers,
      evitables,
      longueursMort,
      offertes,
      mangeesOffertes,
      poses,
      morsures,
      baies: baies.length + graines.length,
    }),
    duel: () =>
      duel()
        ? {
            t: manche && manche.t,
            vainqueur: manche && manche.vainqueur,
            or: corps[0]
              ? {
                  longueur: corps[0].serpent.length,
                  posture: (corps[0].memoireIA && corps[0].memoireIA.postureActive) || 'neutre',
                  raison: corps[0].memoireIA && corps[0].memoireIA.raison,
                  tenue: corps[0].tenue || 0,
                  bouclierT: corps[0].bouclierT,
                  vies: corps[0].vies,
                  surgeT: corps[0].surgeT,
                  invincT: corps[0].invincT,
                  coupT: corps[0].coupT,
                  reculT: corps[0].reculT,
                }
              : null,
            ombre: corps[1]
              ? {
                  longueur: corps[1].serpent.length,
                  posture: (corps[1].memoireIA && corps[1].memoireIA.postureActive) || 'neutre',
                  raison: corps[1].memoireIA && corps[1].memoireIA.raison,
                  tenue: corps[1].tenue || 0,
                  bouclierT: corps[1].bouclierT,
                  vies: corps[1].vies,
                  surgeT: corps[1].surgeT,
                  invincT: corps[1].invincT,
                  coupT: corps[1].coupT,
                  reculT: corps[1].reculT,
                }
              : null,
          }
        : null,
    // reglage de la course pour les harnais d'equilibrage
    reglerCiel: (id, sun, moon) => {
      const p = PALIERS.find((x) => x.id === id);
      if (!p) return;
      if (sun) p.cielSun = sun;
      if (moon) p.cielMoon = moon;
    },
    reglerCible: (id, c) => {
      const p = PALIERS.find((x) => x.id === id);
      if (p) p.cible = c;
    },
    reglerLong: (v) => {
      longForce = v;
    },
    reglerRochers: (id, v) => {
      const p = PALIERS.find((x) => x.id === id);
      if (p) p.maxRochers = v;
    },
    reglerCoup: (id, v) => {
      const p = PALIERS.find((x) => x.id === id);
      if (p) p.coup = v;
    },
    // flair par camp en duel (regie, harnais) : s'applique aux corps courants et aux prochains
    reglerFlair: (camp, v) => {
      FLAIR_DUEL[camp] = v;
      corps.forEach((c) => {
        if (c.camp === camp) c.flair = v;
      });
    },
    reglerTenue: (s) => {
      TENUE_DUEL = Math.max(0.5, +s || 5);
    },
    moments: () => Object.assign({}, moments),
    razMoments: () => {
      moments = { tenues: 0, sursis: 0, parades: 0, manches: 0 };
    },
    reglerChasse: (camp, v) => {
      CHASSE_DUEL[camp] = v;
      corps.forEach((c) => {
        if (c.camp === camp) c.chasse = v;
      });
    },
    reglerHeure: (h) => {
      reglages.heure = ((h % 1) + 1) % 1;
    },
    rodeur: () =>
      rodeur && { x: rodeur.x, y: rodeur.y, faim: rodeur.faim, vitesse: rodeurVitesse() },
    couvee: () => couvee && { t: couvee.t, duree: ECLOSION },
    planterRonce: () => planterRonce('sonde'),
    interne: () => ({
      serpent,
      fruit,
      dir,
      rochers: rochers.map((r) => ({ x: r.x, y: r.y, t: r.t })),
      ronces: ronces.map((R) => ({ t: R.t, seg: R.seg.map((g) => ({ x: g.x, y: g.y, t: g.t })) })),
      alerte: ALERTE,
      vitesse: VITESSE,
      ronceAlerte: RONCE_ALERTE,
      ronceMax: RONCE_MAX,
      baies: baies.map((b) => ({ x: b.x, y: b.y, camp: b.camp || null })),
      graines: graines.map((g) => ({ x: g.x, y: g.y })),
      corps: corps.map((c) => ({
        camp: c.camp,
        longueur: c.serpent.length,
        tete: c.serpent[0] || null,
        serpent: c.serpent.map((s) => ({ x: s.x, y: s.y })),
        dir: { ...c.dir },
        invincT: c.invincT,
        mortCause: c.mortCause || null,
        debug: c.memoireIA.debug || null,
      })),
    }),
  };

  function demarrer() {
    canvas = document.getElementById('scene');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    // rendu net : la surface suit la taille affichee et la densite de l'ecran
    const ajuster = () => {
      const r = canvas.getBoundingClientRect(),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = r.width > 0 ? Math.round(r.width * dpr) : W;
      canvas.width = w;
      canvas.height = Math.round((w * H) / WF);
      const s = canvas.width / WF;
      ctx.setTransform(s, 0, 0, s, OX * s, 0);
    };
    ajuster();
    window.addEventListener('resize', ajuster);
    ajusterCanvas = ajuster;
    ['pointerdown', 'keydown'].forEach((ev) =>
      window.addEventListener(ev, armerSon, { once: false, passive: true }),
    );
    if (window.ResizeObserver)
      try {
        new ResizeObserver(ajuster).observe(canvas);
      } catch (e) {}
    document.addEventListener('keydown', (ev) => {
      const m = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      const d = m[ev.key];
      if (d && !reglages.ia && !(d.x === -dir.x && d.y === -dir.y)) {
        dirProchaine = d;
        ev.preventDefault();
      }
    });
    nouvelleManche();
    dernier = performance.now() / 1000;
    requestAnimationFrame(boucle);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
    else demarrer();
  }
})();
