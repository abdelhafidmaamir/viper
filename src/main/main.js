/* Vipere Duel, lanceur Electron : deux fenetres, jeu (a capturer dans LIVE Studio) et regie.
   Les pages sont servies par un petit serveur HTTP local (127.0.0.1) embarque dans ce processus :
   meme origine pour les deux fenetres, donc BroadcastChannel fonctionne, et le WebSocket vers
   TikFinity (ws://localhost:21213/) part d'une page http, jamais bloque.
   Les fichiers du jeu vivent dans jeu/ a cote de ce script (copies par construire.js). */
'use strict';
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, '..', 'renderer');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css',
};

function servir(rep, res) {
  /* jamais de sortie du dossier jeu */
  const propre = path.normalize(rep).replace(/^([.][.][\\/])+/, '');
  const fichier = path.join(DOSSIER, propre === '\\' || propre === '/' ? 'game.html' : propre);
  if (!fichier.startsWith(DOSSIER)) return res.writeHead(403).end();
  fs.readFile(fichier, (err, corps) => {
    if (err) return res.writeHead(404).end('introuvable');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(corps);
  });
}

let port = 0;
const serveur = http.createServer((req, res) =>
  servir(decodeURIComponent((req.url || '/').split('?')[0]), res),
);

function creerFenetres() {
  /* fenetre JEU : 9/16, sans menu, taille libre (LIVE Studio capture la fenetre, pas l'ecran) */
  /* backgroundThrottling:false : la fenetre jeu doit tourner a plein regime meme recouverte par la regie ou
     par LIVE Studio (elle est capturee, pas regardee). Sans ca, Chromium ralentit ou fige l'animation d'une
     fenetre masquee, ce qui donne des images perdues a l'antenne. */
  /* VIPERE_FORMAT=horizontal : fenetre 16:9 et format horizontal applique des la premiere manche (flux YouTube
     detente). Sans la variable : 9:16 comme avant. Le bouton de la regie bascule aussi, a la manche suivante. */
  const horizontal = process.env.VIPERE_FORMAT === 'horizontal';
  const jeu = new BrowserWindow({
    width: horizontal ? 960 : 540,
    height: horizontal ? 540 : 960,
    useContentSize: true,
    title: 'Vipere Duel, jeu',
    autoHideMenuBar: true,
    backgroundColor: '#0c110e',
    webPreferences: { backgroundThrottling: false },
  });
  jeu.loadURL('http://127.0.0.1:' + port + '/game.html');
  const mesureSeule = !!(
    process.env.VIPERE_MESURE ||
    process.env.VIPERE_PROFIL ||
    process.env.VIPERE_PERF_METEO ||
    process.env.VIPERE_COMPTE
  );
  if (mesureSeule) {
    jeu.setAlwaysOnTop(true);
    jeu.setContentSize(1080, 1920);
    jeu.webContents.once('did-finish-load', () => {
      jeu.show();
      jeu.focus();
      jeu.moveTop();
    });
  }
  if (horizontal)
    jeu.webContents.once('did-finish-load', () => {
      jeu.webContents
        .executeJavaScript(
          "(()=>{const B=window.VipereBase;if(B){B.reglages.format='horizontal';B.nouvelleManche();}})()",
        )
        .catch(() => {});
    });
  /* Mesure de fluidite DANS l'exe (Abdel : « mesure on the exe, not navigateur »). Lance avec la variable
     d'environnement VIPERE_MESURE=fichier.json : la fenetre jeu fait tourner un duel avec le public simule
     en foule, mesure les vraies images (requestAnimationFrame) et compte les degrades crees par image et
     par endroit du code, ecrit le resultat dans le fichier, puis l'exe se ferme. */
  /* Captures d'ecran des prototypes de retour visuel des cadeaux, sur la vraie legende : lancer avec
     VIPERE_CAPTURE=dossier. Une image par mode (G1 a G4), prise une demi-seconde apres une salve de cadeaux. */
  if (process.env.VIPERE_CAPTURE) {
    jeu.setContentSize(720, 1280);
    jeu.webContents.once('did-finish-load', async () => {
      const fs = require('fs'),
        dossier = process.env.VIPERE_CAPTURE,
        pause = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        await pause(2500);
        if (process.env.VIPERE_CAPTURE_SEUL === 'format') {
          jeu.setContentSize(1280, 720);
          await pause(400);
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.format='horizontal';B.reglages.affichageCadeaux='defile';B.reglages.defileCache=0;B.reglages.ambianceAuto=false;B.reglages.plateforme='" +
              (process.env.VIPERE_NEUTRE ? 'neutre' : 'tiktok') +
              "';B.reglages.meteo='" +
              (process.env.VIPERE_METEO1 || 'pluie') +
              "';B.nouvelleManche();B.reglerHeure(" +
              parseFloat(process.env.VIPERE_HEURE1 || '0.5') +
              ');})()',
          );
          await pause(4500);
          await jeu.webContents.executeJavaScript(
            "window.recevoirEvenement({type:'cadeau',n:1,valeur:30,nom:'bagel',camp:'or',pseudo:'karim.or'})",
          );
          await pause(900);
          fs.writeFileSync(
            path.join(dossier, 'format-h-' + (process.env.VIPERE_METEO1 || 'pluie') + '.png'),
            (await jeu.webContents.capturePage()).toPNG(),
          );
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.meteo='" +
              (process.env.VIPERE_METEO2 || 'neige') +
              "';B.reglerHeure(" +
              parseFloat(process.env.VIPERE_HEURE2 || '0.22') +
              ');})()',
          );
          await pause(5000);
          await jeu.webContents.executeJavaScript(
            "window.recevoirEvenement({type:'cadeau',n:1,valeur:100,nom:'hand heart',camp:'ombre',pseudo:'zoe_moon'})",
          );
          await pause(900);
          fs.writeFileSync(
            path.join(dossier, 'format-h-' + (process.env.VIPERE_METEO2 || 'neige') + '.png'),
            (await jeu.webContents.capturePage()).toPNG(),
          );
          if (process.env.VIPERE_FIN) {
            // ecran de fin (voile + classement) en 16:9
            await jeu.webContents.executeJavaScript(
              "(()=>{const B=window.VipereBase;[['or',100,'teddy','karim.or'],['ombre',30,'capybara','zoe_moon'],['or',10,'rose 10','soleil92']].forEach(g=>window.recevoirEvenement({type:'cadeau',n:1,valeur:g[1],nom:g[2],camp:g[0],pseudo:g[3]}));setTimeout(()=>B.finirTest&&B.finirTest('ombre'),800);})()",
            );
            await pause(4200);
            fs.writeFileSync(
              path.join(dossier, 'format-h-fin.png'),
              (await jeu.webContents.capturePage()).toPNG(),
            );
          }
          app.quit();
          return;
        }
        if (process.env.VIPERE_CAPTURE_SEUL === 'defile') {
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.affichageCadeaux='defile';B.nouvelleManche();})()",
          );
          await pause(4000);
          for (let k = 0; k < 3; k++) {
            await pause(600);
            fs.writeFileSync(
              path.join(dossier, 'defile-' + k + '.png'),
              (await jeu.webContents.capturePage()).toPNG(),
            );
          }
          app.quit();
          return;
        }
        for (const mode of process.env.VIPERE_CAPTURE_SEUL ? [] : ['G1', 'G2', 'G3', 'G4']) {
          await jeu.webContents.executeJavaScript(
            `(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.retourCadeau='${mode}';B.nouvelleManche();})()`,
          );
          await pause(1800);
          await jeu.webContents
            .executeJavaScript(`(()=>{const e=(camp,v,nom,ps,n)=>window.recevoirEvenement({type:'cadeau',n:n||1,valeur:v,nom:nom,camp:camp,pseudo:ps});
            e('or',1,'rose','lea_gold',3);e('or',30,'bagel','karim.or');e('ombre',1,'rosa','nox',2);e('ombre',100,'hand heart','zoe_moon');})()`);
          await pause(250);
          await jeu.webContents.executeJavaScript(
            `(()=>{window.recevoirEvenement({type:'cadeau',n:1,valeur:10,nom:'rose 10',camp:'or',pseudo:'soleil92'});window.recevoirEvenement({type:'cadeau',n:1,valeur:10,nom:'dyno',camp:'ombre',pseudo:'kenji.night'});})()`,
          );
          await pause(350);
          const r = await jeu.webContents.executeJavaScript(
            `(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()`,
          );
          const zone = {
            x: Math.round(r.x),
            y: Math.round(r.y + r.h * 0.645),
            width: Math.round(r.w),
            height: Math.round(r.h * 0.3),
          };
          const img = await jeu.webContents.capturePage(zone);
          fs.writeFileSync(path.join(dossier, 'retour-cadeaux-' + mode + '.png'), img.toPNG());
        }
        /* bandeau d'activite : une capture par prototype et par instant (tour en cours, pose) */
        for (const mode of ['classement', 'heures', 'biomes', 'meteos'].includes(
          process.env.VIPERE_CAPTURE_SEUL,
        )
          ? []
          : ['P1']) {
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.bandeau='" +
              mode +
              "';B.nouvelleManche();})()",
          );
          await pause(7000);
          for (const [nom, ev, att] of [
            [
              'premier-shield',
              "{type:'cadeau',n:1,valeur:30,nom:'bagel',camp:'or',pseudo:'karim.or'}",
              700,
            ],
            [
              'cadeau-speed',
              "{type:'cadeau',n:1,valeur:10,nom:'dyno',camp:'ombre',pseudo:'zoe_moon'}",
              700,
            ],
            [
              'cadeau-life',
              "{type:'cadeau',n:1,valeur:100,nom:'teddy',camp:'or',pseudo:'karim.or'}",
              700,
            ],
            ['arrivee', "{type:'arrivee',pseudo:'lea_gold'}", 1900],
          ]) {
            await jeu.webContents.executeJavaScript('window.recevoirEvenement(' + ev + ')');
            await pause(att);
            const r = await jeu.webContents.executeJavaScript(
              "(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()",
            );
            const img = await jeu.webContents.capturePage({
              x: Math.round(r.x),
              y: Math.round(r.y + r.h * 0.05),
              width: Math.round(r.w),
              height: Math.round(r.h * 0.13),
            });
            fs.writeFileSync(
              path.join(dossier, 'bandeau-' + mode + '-' + nom + '.png'),
              img.toPNG(),
            );
            await pause(4200);
          }
        }
        /* classement de fin de manche : une capture par prototype */
        /* heures de la foret : une capture plein ecran par heure, pour juger les ambiances par manche */
        if (process.env.VIPERE_CAPTURE_SEUL === 'heures') {
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.cycle=0;B.nouvelleManche();})()",
          );
          await pause(9000);
          for (const h of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
            await jeu.webContents.executeJavaScript('window.VipereBase.reglerHeure(' + h + ')');
            await pause(1200);
            const r = await jeu.webContents.executeJavaScript(
              "(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()",
            );
            fs.writeFileSync(
              path.join(dossier, 'heure-' + String(h).replace('.', '_') + '.png'),
              (
                await jeu.webContents.capturePage({
                  x: Math.round(r.x),
                  y: Math.round(r.y),
                  width: Math.round(r.w),
                  height: Math.round(r.h),
                })
              )
                .resize({ width: 360 })
                .toPNG(),
            );
          }
        }
        /* meteos de la foret : une capture plein ecran par meteo, a une heure qui la sert */
        if (process.env.VIPERE_CAPTURE_SEUL === 'meteos') {
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.cycle=0;B.nouvelleManche();})()",
          );
          await pause(8000);
          for (const [m, h, av] of [['braises', 0.78, 0.8]]) {
            await jeu.webContents.executeJavaScript(
              "(()=>{const B=window.VipereBase;B.reglages.meteo='" +
                m +
                "';B.reglerHeure(" +
                h +
                ');B.reglages.avanceForcee=' +
                av +
                ';})()',
            );
            await pause(4600);
            if (m === 'orage') {
              for (let q = 0; q < 140; q++) {
                const I = await jeu.webContents.executeJavaScript(
                  '(()=>{const t=window.VipereBase.mesures().t,k=Math.floor(t/11),al=(i,d)=>{const v=Math.sin(i*12.9898+d*78.233)*43758.5453;return v-Math.floor(v);},tf=t-k*11-1-al(k,5)*6;return tf>0.02&&tf<0.12;})()',
                );
                if (I) break;
                await pause(90);
              }
            }
            const r = await jeu.webContents.executeJavaScript(
              "(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()",
            );
            fs.writeFileSync(
              path.join(dossier, 'sol-' + m + '.png'),
              (
                await jeu.webContents.capturePage({
                  x: Math.round(r.x),
                  y: Math.round(r.y),
                  width: Math.round(r.w),
                  height: Math.round(r.h),
                })
              )
                .resize({ width: 540 })
                .toPNG(),
            );
          }
          fs.writeFileSync(
            path.join(dossier, 'meteo-diag.txt'),
            JSON.stringify(
              await jeu.webContents.executeJavaScript(
                '(()=>{const m=window.VipereBase.mesures();return {err:m.derniereErreur,erreurs:m.erreurs};})()',
              ),
            ),
          );
        }
        /* biomes : les anciennes ambiances, injectees pour la capture seulement, a la place de la foret */
        if (process.env.VIPERE_CAPTURE_SEUL === 'biomes') {
          for (const b of ['abysses', 'zen', 'bassin']) {
            const src = fs.readFileSync(path.join(__dirname, '..', 'amb-' + b + '.js'), 'utf8');
            let note = 'ok';
            try {
              await jeu.webContents.executeJavaScript(src + ';0');
              await jeu.webContents.executeJavaScript(
                "(()=>{const A=window.AMBIANCES;A.forEach(a=>{if(a.id==='foret')a.id='foret-off';});const n=A.find(a=>a.id==='" +
                  b +
                  "');const f=A.find(a=>a.id==='foret-off'||a.id0==='foret');if(!n)throw new Error('absente');n.id0=n.id;n.id='foret';A.forEach(a=>{if(a!==n&&a.id==='foret')a.id='x';});const B=window.VipereBase;B.reglages.mode='duel';B.nouvelleManche();})()",
              );
              await pause(9000);
              const r = await jeu.webContents.executeJavaScript(
                "(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()",
              );
              fs.writeFileSync(
                path.join(dossier, 'biome-' + b + '.png'),
                (
                  await jeu.webContents.capturePage({
                    x: Math.round(r.x),
                    y: Math.round(r.y),
                    width: Math.round(r.w),
                    height: Math.round(r.h),
                  })
                )
                  .resize({ width: 360 })
                  .toPNG(),
              );
              note = JSON.stringify(
                await jeu.webContents.executeJavaScript(
                  '(()=>{const m=window.VipereBase.mesures();return {err:m.derniereErreur,erreurs:m.erreurs};})()',
                ),
              );
            } catch (e) {
              note = String((e && e.message) || e);
            }
            fs.writeFileSync(path.join(dossier, 'biome-' + b + '.txt'), note);
            await jeu.webContents.executeJavaScript(
              "(()=>{const n=window.AMBIANCES.find(a=>a.id==='foret');if(n)n.id='fait';})()",
            );
          }
        }
        for (const mode of ['heures', 'biomes', 'meteos', 'bandeau'].includes(
          process.env.VIPERE_CAPTURE_SEUL,
        )
          ? []
          : ['M1', 'M2', 'M3']) {
          await jeu.webContents.executeJavaScript(
            "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.classement='" +
              mode +
              "';B.nouvelleManche();})()",
          );
          await pause(13000);
          await jeu.webContents.executeJavaScript(
            "[['or',100,'teddy bear','karim.or'],['or',30,'bagel','lea_gold'],['ombre',20,'perfume','nox'],['ombre',100,'hand heart','zoe_moon'],['ombre',30,'capybara','zoe_moon']].forEach(g=>window.recevoirEvenement({type:'cadeau',n:1,valeur:g[1],nom:g[2],camp:g[0],pseudo:g[3]}));window.VipereBase.finirTest('ombre')",
          );
          const tFin = Date.now();
          for (const q of [1, 2, 3]) {
            await pause(1500);
            const r0 = await jeu.webContents.executeJavaScript(
              "(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()",
            );
            fs.writeFileSync(
              path.join(dossier, 'suite-' + mode + '-' + q + '.png'),
              (
                await jeu.webContents.capturePage({
                  x: Math.round(r0.x),
                  y: Math.round(r0.y),
                  width: Math.round(r0.w),
                  height: Math.round(r0.h),
                })
              )
                .resize({ width: 360 })
                .toPNG(),
            );
          }
          await pause(700);
          const r = await jeu.webContents.executeJavaScript(
            "(()=>{const b=document.getElementById('scene').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()",
          );
          const img = await jeu.webContents.capturePage({
            x: Math.round(r.x),
            y: Math.round(r.y + r.h * 0.04),
            width: Math.round(r.w),
            height: Math.round(r.h * 0.94),
          });
          fs.writeFileSync(path.join(dossier, 'classement-' + mode + '.png'), img.toPNG());
          fs.writeFileSync(
            path.join(dossier, 'diag-' + mode + '.json'),
            String(Date.now() - tFin) +
              ' ms apres finir ' +
              JSON.stringify(
                await jeu.webContents.executeJavaScript(
                  '(()=>{const B=window.VipereBase,m=B.mesures(),d=B.duel();return {err:m.derniereErreur,erreurs:m.erreurs,t:m.t,duelT:d&&d.t,vainqueur:d&&d.vainqueur,quand:Date.now()};})()',
                ),
              ),
          );
        }
      } catch (e) {
        fs.writeFileSync(path.join(dossier, 'capture-erreur.txt'), String((e && e.stack) || e));
      }
      app.quit();
    });
  }
  /* Cout de chaque meteo : VIPERE_PERF_METEO=fichier.json. Duel avec public simule, serpents longs, sol a 80 % de la
     manche. Par meteo : intervalles entre images (requestAnimationFrame) et temps processeur passe dans l'ambiance. */
  if (process.env.VIPERE_PERF_METEO) {
    jeu.webContents.once('did-finish-load', () => {
      const script = `(async()=>{try{
        const attendre=ms=>new Promise(r=>setTimeout(r,ms));
        await attendre(1500);
        const B=window.VipereBase;B.reglages.mode='duel';B.reglages.dureeDuel=900;B.reglages.ambianceAuto=false;B.reglages.cycle=0;B.reglages.avanceForcee=0.8;B.reglages.fluide=${process.env.VIPERE_PERF_FLUIDE ? 'true' : 'false'};B.nouvelleManche();
        const F=window.VipereFoule.creer();F.regler(3);
        setInterval(()=>{try{F.tick(window.VipereFoule.lireEtat(B),0.5).forEach(ev=>window.recevoirEvenement(ev));}catch(e){}},500);
        const A=window.AMBIANCES.find(a=>a.id==='foret');let cpu=0;
        ['peindreFond','peindreAvant'].forEach(n=>{const f=A[n];A[n]=function(){const t0=performance.now();const r=f.apply(this,arguments);cpu+=performance.now()-t0;return r;};});
        const mesurer=ms=>new Promise(res=>{const d=[];let av=performance.now();const t0=av;cpu=0;function f(n){d.push(n-av);av=n;if(n-t0<ms)requestAnimationFrame(f);else{d.shift();const tri=d.slice().sort((a,b)=>a-b),moy=d.reduce((a,b)=>a+b,0)/d.length;
          res({ips:+(1000/moy).toFixed(1),p95_ms:+tri[Math.floor(tri.length*0.95)].toFixed(1),p99_ms:+tri[Math.floor(tri.length*0.99)].toFixed(1),max_ms:+tri[tri.length-1].toFixed(1),images_lentes_pct:+(100*d.filter(x=>x>20).length/d.length).toFixed(2),cpu_ambiance_ms_par_image:+(cpu/d.length).toFixed(2)});}}requestAnimationFrame(f);});
        await attendre(25000);
        const out={};
        for(const [m,h] of [['pluie',0.5],['neige',0.36],['automne',0.78],['printemps',0.36],['ete',0.5],['orage',0.02],['braises',0.78],['aurore',0.02],['etoiles',0.02],['lucioles',0.02],['brume',0.22],['pluie',0.5]]){
          B.reglages.meteo=m;B.reglerHeure(h);await attendre(4500);out[m+(out[m]?' (recontrole)':'')]=await mesurer(7000);}
        const d=B.duel();
        return {fenetre:innerWidth+'x'+innerHeight,densite:devicePixelRatio,longueurs:[d&&d.or&&d.or.longueur,d&&d.ombre&&d.ombre.longueur],meteos:out};
      }catch(e){return {erreur:String(e&&e.message||e)};}})()`;
      jeu.webContents
        .executeJavaScript(script)
        .then((r) => {
          require('fs').writeFileSync(process.env.VIPERE_PERF_METEO, JSON.stringify(r, null, 1));
          app.quit();
        })
        .catch((e) => {
          require('fs').writeFileSync(
            process.env.VIPERE_PERF_METEO,
            JSON.stringify({ erreur: String((e && e.message) || e) }),
          );
          app.quit();
        });
    });
  }
  /* Profil CPU du rendu (VIPERE_PROFIL=fichier.cpuprofile) : profileur d'echantillonnage de Chromium branche sur la
     fenetre jeu, manche reelle avec public simule en foule, plateau charge (attente), puis 12 s d'echantillons. */
  if (process.env.VIPERE_PROFIL) {
    jeu.webContents.once('did-finish-load', async () => {
      const fs = require('fs'),
        pause = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        await pause(1500);
        await jeu.webContents
          .executeJavaScript(`(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.dureeDuel=600;B.reglages.ambianceAuto=false;B.reglages.meteo='${process.env.VIPERE_PROFIL_METEO || 'pluie'}';B.nouvelleManche();
          const F=window.VipereFoule.creer();F.regler(3);window.__minuteur=setInterval(()=>{try{F.tick(window.VipereFoule.lireEtat(B),0.5).forEach(ev=>window.recevoirEvenement(ev));}catch(e){}},500);})()`);
        await pause(+(process.env.VIPERE_PROFIL_ATTENTE || 25) * 1000);
        const dbg = jeu.webContents.debugger;
        dbg.attach('1.3');
        await dbg.sendCommand('Profiler.enable');
        await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 250 });
        await dbg.sendCommand('Profiler.start');
        await pause(12000);
        const { profile } = await dbg.sendCommand('Profiler.stop');
        dbg.detach();
        // images par seconde reelles juste apres le profil, pour prouver que la fenetre n'etait pas ralentie
        const ips = await jeu.webContents
          .executeJavaScript(
            "new Promise(res=>{const d=[];let av=performance.now(),t0=av;function f(n){d.push(n-av);av=n;if(n-t0<4000)requestAnimationFrame(f);else{d.shift();const tri=d.slice().sort((a,b)=>a-b);res({ips:+(1000*d.length/(n-t0)).toFixed(1),mediane_ms:+tri[tri.length>>1].toFixed(1),p95_ms:+tri[Math.floor(tri.length*0.95)].toFixed(1),fenetre:innerWidth+'x'+innerHeight,canevas:document.getElementById('scene').width+'x'+document.getElementById('scene').height});}}requestAnimationFrame(f);})",
          )
          .catch((e) => ({ erreur: String(e) }));
        fs.writeFileSync(process.env.VIPERE_PROFIL, JSON.stringify(profile));
        fs.writeFileSync(process.env.VIPERE_PROFIL + '.etat.json', JSON.stringify(ips));
      } catch (e) {
        fs.writeFileSync(process.env.VIPERE_PROFIL + '.erreur.txt', String((e && e.stack) || e));
      }
      app.quit();
    });
  }
  /* Comptage des appels de dessin (VIPERE_COMPTE=fichier.json) : par image et par site d'appel, sur plateau charge. */
  if (process.env.VIPERE_COMPTE) {
    jeu.webContents.once('did-finish-load', async () => {
      const fs = require('fs'),
        pause = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        await pause(1500);
        await jeu.webContents.executeJavaScript(
          "(()=>{const B=window.VipereBase;B.reglages.mode='duel';B.reglages.dureeDuel=600;B.reglages.ambianceAuto=false;B.reglages.meteo='pluie';B.nouvelleManche();const F=window.VipereFoule.creer();F.regler(3);setInterval(()=>{try{F.tick(window.VipereFoule.lireEtat(B),0.5).forEach(ev=>window.recevoirEvenement(ev));}catch(e){}},500);})()",
        );
        await pause(25000);
        const r = await jeu.webContents.executeJavaScript(`new Promise(res=>{
          const P=CanvasRenderingContext2D.prototype,noms=['drawImage','fill','stroke','fillRect','fillText','save','restore','clip','createRadialGradient','createLinearGradient','arc','roundRect','setTransform','translate'],orig={},cpt={},sites={},aire={};
          const site=()=>{const s=(new Error().stack.split(String.fromCharCode(10))[3]||'');return s.slice(s.lastIndexOf('/')+1).split(')')[0];};
          noms.forEach(n=>{orig[n]=P[n];cpt[n]=0;P[n]=function(){cpt[n]++;const k=n+'  '+site();sites[k]=(sites[k]||0)+1;if(n==='drawImage'){const a=arguments,w=a.length>=9?a[7]:a.length>=5?a[3]:(a[0].width||0),h=a.length>=9?a[8]:a.length>=5?a[4]:(a[0].height||0);aire[k]=(aire[k]||0)+Math.abs(w*h);}return orig[n].apply(this,arguments);};});
          let flous=0,flouSites={};const dsc=Object.getOwnPropertyDescriptor(P,'shadowBlur');Object.defineProperty(P,'shadowBlur',{set(v){if(v>0){flous++;const k=site();flouSites[k]=(flouSites[k]||0)+1;}dsc.set.call(this,v);},get(){return dsc.get.call(this);},configurable:true});
          let n=0;function f(){n++;if(n<90)requestAnimationFrame(f);else{noms.forEach(k=>P[k]=orig[k]);Object.defineProperty(P,'shadowBlur',dsc);
            const par={};noms.forEach(k=>par[k]=+(cpt[k]/n).toFixed(1));par.shadowBlur_pose=+(flous/n).toFixed(1);
            const top=Object.entries(sites).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([k,v])=>k+' : '+(v/n).toFixed(1)+'/image'+(aire[k]?' , aire '+Math.round(aire[k]/n/1000)+' kpx':''));
            const topFlou=Object.entries(flouSites).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>k+' : '+(v/n).toFixed(1)+'/image');
            const aireTot=Object.values(aire).reduce((a,b)=>a+b,0)/n;
            res({images:n,appels_par_image:par,aire_drawImage_kpx_par_image:Math.round(aireTot/1000),canevas:document.getElementById('scene').width+'x'+document.getElementById('scene').height,top_sites:top,flous_par_site:topFlou});}}
          requestAnimationFrame(f);})`);
        fs.writeFileSync(process.env.VIPERE_COMPTE, JSON.stringify(r, null, 1));
      } catch (e) {
        fs.writeFileSync(
          process.env.VIPERE_COMPTE,
          JSON.stringify({ erreur: String((e && e.stack) || e) }),
        );
      }
      app.quit();
    });
  }
  if (process.env.VIPERE_MESURE) {
    jeu.webContents.once('did-finish-load', () => {
      const script = `(async()=>{try{
        const attendre=ms=>new Promise(r=>setTimeout(r,ms));
        await attendre(1500);
        const B=window.VipereBase;B.reglages.mode='duel';B.reglages.dureeDuel=600;B.nouvelleManche();
        const F=window.VipereFoule.creer();F.regler(3);
        const minuteur=setInterval(()=>{try{F.tick(window.VipereFoule.lireEtat(B),0.5).forEach(ev=>window.recevoirEvenement(ev));}catch(e){}},500);
        const mesurer=ms=>new Promise(res=>{const d=[];let av=performance.now();const t0=av;function f(n){d.push(n-av);av=n;if(n-t0<ms)requestAnimationFrame(f);else{d.shift();const tri=d.slice().sort((a,b)=>a-b),moy=d.reduce((a,b)=>a+b,0)/d.length;res({images:d.length,ips:+(1000/moy).toFixed(1),mediane_ms:+tri[tri.length>>1].toFixed(1),p95_ms:+tri[Math.floor(tri.length*0.95)].toFixed(1),p99_ms:+tri[Math.floor(tri.length*0.99)].toFixed(1),pire_ms:+tri[tri.length-1].toFixed(1),au_dela_de_20ms:d.filter(x=>x>20).length});}}requestAnimationFrame(f);});
        const debut=await mesurer(8000);
        await attendre(${+(process.env.VIPERE_MESURE_ATTENTE || 30)}*1000);
        const charge=await mesurer(15000);
        // essais A/B sur plateau charge : on neutralise une famille de dessin a la fois, 4 s chacune
        const ab={};const ctxJ=document.getElementById('scene').getContext('2d');
        const essai=async(nom,poser,oter)=>{poser();const r=await mesurer(4000);oter();ab[nom]=r.ips+' ips (p95 '+r.p95_ms+' ms)';};
        await essai('normal',()=>{},()=>{});
        await essai('mode fluide du jeu (reglage)',()=>{B.reglages.fluide=true;},()=>{B.reglages.fluide=false;});
        await essai('sans flou (shadowBlur)',()=>Object.defineProperty(ctxJ,'shadowBlur',{set(){},get(){return 0;},configurable:true}),()=>{delete ctxJ.shadowBlur;});
        await essai('sans traits (stroke)',()=>{ctxJ.stroke=function(){};},()=>{delete ctxJ.stroke;});
        await essai('sans remplissages (fill)',()=>{ctxJ.fill=function(){};},()=>{delete ctxJ.fill;});
        await essai('sans images (drawImage)',()=>{ctxJ.drawImage=function(){};},()=>{delete ctxJ.drawImage;});
        await essai('sans aucun dessin de forme (stroke+fill+drawImage+fillRect+texte)',()=>{['stroke','fill','drawImage','fillRect','fillText','clip'].forEach(k=>ctxJ[k]=function(){});},()=>{['stroke','fill','drawImage','fillRect','fillText','clip'].forEach(k=>delete ctxJ[k]);});
        await essai('normal, recontrole',()=>{},()=>{});
        const P=CanvasRenderingContext2D.prototype,sites={},orig={r:P.createRadialGradient,l:P.createLinearGradient};let nb=0,flous=0;
        const compter=nom=>function(){nb++;const pl=(new Error().stack.split(String.fromCharCode(10))[2]||''),l=pl.slice(pl.lastIndexOf('/')+1).split(')')[0];sites[l]=(sites[l]||0)+1;return orig[nom].apply(this,arguments);};
        P.createRadialGradient=compter('r');P.createLinearGradient=compter('l');
        let imgs=0;await new Promise(res=>{function f(){imgs++;if(imgs<120)requestAnimationFrame(f);else res();}requestAnimationFrame(f);});
        P.createRadialGradient=orig.r;P.createLinearGradient=orig.l;clearInterval(minuteur);
        const d=B.duel(),cv=document.getElementById('scene');
        const top=Object.keys(sites).sort((a,b)=>sites[b]-sites[a]).slice(0,12).map(k=>k+' : '+(sites[k]/imgs).toFixed(1)+' par image');
        return {fenetre:innerWidth+'x'+innerHeight,densite_ecran:devicePixelRatio,canevas:cv.width+'x'+cv.height,longueurs:[d&&d.or&&d.or.longueur,d&&d.ombre&&d.ombre.longueur],essais_AB:ab,debut_de_manche:debut,plateau_charge:charge,degrades_par_image:+(nb/imgs).toFixed(1),degrades_par_endroit:top};
      }catch(e){return {erreur:String(e&&e.message||e),pile:String(e&&e.stack||'').slice(0,400)};}})()`;
      jeu.webContents
        .executeJavaScript(script)
        .then((r) => {
          require('fs').writeFileSync(process.env.VIPERE_MESURE, JSON.stringify(r, null, 1));
          app.quit();
        })
        .catch((e) => {
          require('fs').writeFileSync(
            process.env.VIPERE_MESURE,
            JSON.stringify({ erreur: String((e && e.message) || e) }),
          );
          app.quit();
        });
    });
  }
  /* Fenetre encadree, jamais sans cadre : la capture de fenetre d'OBS et de LIVE Studio rend noir
     sur une fenetre Electron sans cadre. Le cadre et la barre de titre se rognent cote OBS,
     l'antenne reste propre. */
  const regie = new BrowserWindow({
    width: 600,
    height: 900,
    title: 'Vipere Duel, regie',
    autoHideMenuBar: true,
    backgroundColor: '#0c110e',
  });
  /* la fenetre regie de l'exe est privee (jamais capturee) : la section super admin y est visible */
  regie.loadURL('http://127.0.0.1:' + port + '/control.html?admin=1');
  if (mesureSeule) regie.hide(); // en mesure, rien ne doit recouvrir la fenetre jeu
}

/* Windows : Chromium detecte qu'une fenetre est recouverte et coupe son rendu. On le desactive pour la meme raison. */
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.whenReady().then(() => {
  serveur.listen(0, '127.0.0.1', () => {
    port = serveur.address().port;
    creerFenetres();
  });
});
app.on('window-all-closed', () => {
  serveur.close();
  app.quit();
});
