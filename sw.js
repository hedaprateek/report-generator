/* =====================================================================
   Service worker — the suite keeps working with no internet.

   The libraries are now served from this site rather than a CDN, so the only
   thing still standing between a teacher and an offline classroom was the
   network fetch for the pages themselves. This caches everything on first
   visit and serves from that cache afterwards.

   Strategy, and why:
     · pages        network-first  — an academy should get today's version when
                                     online, and yesterday's rather than an
                                     error when not
     · assets       cache-first    — libraries and stylesheets are versioned by
                                     filename and never change in place, so
                                     hitting the network for them is waste
     · never cached the xlsx templates? They ARE cached: a teacher downloading
       a blank template on a dead connection is exactly the case this is for.

   Bump CACHE when anything ships, or returning devices keep the old copy.
   ===================================================================== */
const CACHE="tesa-suite-v1";

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

  e.respondWith((async()=>{
    const hit=await caches.match(req);
    if(hit)return hit;
    try{
      const fresh=await fetch(req);
      const c=await caches.open(CACHE);
      c.put(req,fresh.clone());
      return fresh;
    }catch(err){return Response.error();}
  })());
});
