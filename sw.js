/* =====================================================================
   Service worker — the suite keeps working with no internet.

   The libraries are now served from this site rather than a CDN, so the only
   thing still standing between a teacher and an offline classroom was the
   network fetch for the pages themselves. This caches everything on first
   visit and serves from that cache afterwards.

   Strategy, and why:
     · pages    network-first          — today's version when online, yesterday's
                                         rather than an error when not
     · assets   stale-while-revalidate — serve the cached copy instantly, then
                                         refresh it in the background so the next
                                         load is current
     · the xlsx templates are cached too: a teacher downloading a blank template
       on a dead connection is exactly the case this exists for

   Assets were originally cache-first with a "remember to bump CACHE when you
   ship" comment. That is a trap — the first release that forgot (this one, with
   i18n.js) left every returning device pinned to the old file and looking like
   the deploy had failed. Nothing here should depend on a human remembering a
   version number, so revalidation is now automatic and CACHE only exists to
   discard a genuinely incompatible generation.
   ===================================================================== */
const CACHE="tesa-suite-v2";

/* Everything needed to open any tool from cold with no network. Listed
   explicitly rather than cached lazily so the FIRST offline use works, not
   just the second. */
const PRECACHE=[
  "./","./index.html","./parent.html",

  "./segments/pre-primary-reports.html","./segments/primary-reports.html",
  "./segments/secondary-reports.html","./segments/junior-college-reports.html",
  "./segments/college-reports.html",

  "./tools/marks-entry.html","./tools/student-master.html","./tools/fees-and-dues.html",
  "./tools/certificates.html","./tools/id-cards.html","./tools/timetable.html",
  "./tools/at-risk-radar.html","./tools/results-pack.html","./tools/student-file.html",
  "./tools/parent-file.html","./tools/test-builder.html","./tools/test-evaluator.html",
  "./tools/omr-designer.html","./tools/omr-scanner.html","./tools/sports-scoreboard.html",
  "./tools/backup-restore.html",

  "./assets/css/a11y.css","./assets/css/responsive.css",
  "./assets/js/a11y.js","./assets/js/backup.js","./assets/js/data-grid.js",
  "./assets/js/live-relay.js","./assets/js/office-common.js","./assets/js/omr-vision.js",
  "./assets/js/parent-link.js","./assets/js/parent-report.js","./assets/js/pdf-safe.js",
  "./assets/js/question-parser.js","./assets/js/report-page.js","./assets/js/revision-plan.js",
  "./assets/js/student-master.js","./assets/js/test-codec.js","./assets/js/vendor-footer.js",
  "./assets/js/workbook-pool.js","./assets/js/offline.js","./assets/js/i18n.js",
  "./assets/js/report-sections.js","./assets/js/projects.js","./assets/js/health-block.js",

  "./assets/vendor/xlsx.full.min.js","./assets/vendor/html2pdf.bundle.min.js",
  "./assets/vendor/html2canvas.min.js","./assets/vendor/jspdf.umd.min.js",

  "./assets/images/tesa-emblem.png","./assets/images/tesa-logo-full.png",
  "./manifest.webmanifest",

  // The blank workbooks. A teacher who needs a fresh template on a dead
  // connection is precisely the case this exists for, so they are cached too.
  "./assets/templates/master/TESA_Master_Pre_Primary.xlsx",
  "./assets/templates/master/TESA_Master_Primary.xlsx",
  "./assets/templates/master/TESA_Master_Secondary.xlsx",
  "./assets/templates/master/TESA_Master_Junior_College.xlsx",
  "./assets/templates/master/TESA_Master_College.xlsx",
  "./assets/templates/pre-primary/Pre_Primary_Evaluation_Template.xlsx",
  "./assets/templates/primary/Primary_Progress_Template.xlsx",
  "./assets/templates/secondary/Student_Progress_Template.xlsx",
  "./assets/templates/junior-college/Student_Progress_Template.xlsx",
  "./assets/templates/college/College_Progress_Template.xlsx",
  "./assets/templates/office/Fees_Template.xlsx",
  "./assets/templates/office/Office_Roster_Template.xlsx",
  "./assets/templates/office/Questions_Template.xlsx",
  "./assets/templates/office/Timetable_Template.xlsx"
];

self.addEventListener("install",e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    // addAll fails the whole install if ANY file 404s; add individually so one
    // renamed asset cannot leave the academy with no offline copy at all
    await Promise.all(PRECACHE.map(u=>c.add(u).catch(()=>{})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;

  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;   // the live-scores relay must go to the network
  // never cache the worker or the manifest: a stale copy of either is how a
  // site gets permanently stuck on an old version
  if(/\/sw\.js$|\/manifest\.webmanifest$/.test(url.pathname))return;

  const isPage=req.mode==="navigate"||
               (req.headers.get("accept")||"").includes("text/html");

  if(isPage){
    e.respondWith((async()=>{
      try{
        const fresh=await fetch(req);
        const c=await caches.open(CACHE);
        c.put(req,fresh.clone());
        return fresh;
      }catch(err){
        const hit=await caches.match(req);
        // a deep link opened offline still lands somewhere useful
        return hit||await caches.match("./index.html")||Response.error();
      }
    })());
    return;
  }

  /* Stale-while-revalidate: answer from cache immediately so the tool opens
     instantly and works offline, but always ask the network in the background
     and store what comes back. A shipped change therefore reaches a returning
     device on its next load, with no version bump and nothing to remember. */
  e.respondWith((async()=>{
    const cached=await caches.match(req);
    const network=fetch(req).then(async res=>{
      if(res&&res.ok){
        const c=await caches.open(CACHE);
        c.put(req,res.clone());
      }
      return res;
    }).catch(()=>null);

    if(cached){
      e.waitUntil(network);        // refresh without making the page wait
      return cached;
    }
    const fresh=await network;
    return fresh||Response.error();
  })());
});
