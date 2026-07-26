(function () {
  "use strict";

  // Everything in this file is progressive enhancement: style.css already
  // renders all content fully visible by default, so if GSAP/ScrollTrigger
  // fail to load from the CDN, the page still looks complete — just static.
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.registerPlugin(ScrollTrigger);

  var landingView = document.getElementById("view-landing");

  // ---------- Section reveal groups ----------
  function initRevealGroup(sectionSelector) {
    var section = document.querySelector(sectionSelector);
    if (!section) return;
    var els = section.querySelectorAll(".reveal-up");
    if (!els.length) return;

    if (reducedMotion) return; // leave elements in their default visible state

    gsap.set(els, { opacity: 0, y: 22 });
    ScrollTrigger.batch(els, {
      start: "top 88%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 });
      }
    });
  }

  [".hero", ".lenses-section", ".pipeline-section", ".personas-section", ".impact-section", ".trust-section", ".final-cta-section"]
    .forEach(initRevealGroup);

  // ---------- Pipeline timeline: step activation + line draw ----------
  if (!reducedMotion) {
    var steps = document.querySelectorAll(".pipeline-step");
    steps.forEach(function (step) {
      step.classList.add("js-dim");
      ScrollTrigger.create({
        trigger: step,
        start: "top 72%",
        end: "bottom 45%",
        onEnter: function () { step.classList.add("is-active"); },
        onEnterBack: function () { step.classList.add("is-active"); }
      });
    });

    var lineFill = document.getElementById("pipeline-line-fill");
    var track = document.getElementById("pipeline-track");
    if (lineFill && track) {
      ScrollTrigger.create({
        trigger: track,
        start: "top 65%",
        end: "bottom 55%",
        scrub: 0.4,
        onUpdate: function (self) {
          lineFill.style.height = (self.progress * 100).toFixed(1) + "%";
        }
      });
    }
  }

  // ---------- Subtle parallax on hero ----------
  if (!reducedMotion) {
    var heroGlow = document.querySelector(".hero-glow");
    var heroStage = document.getElementById("hero-stage");
    if (heroGlow) {
      gsap.to(heroGlow, {
        yPercent: 18, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
      });
    }
    if (heroStage) {
      gsap.to(heroStage, {
        yPercent: -6, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true }
      });
    }
  }

  // ---------- Sticky nav CTA appears once past the hero, only while on landing ----------
  var navCta = document.getElementById("nav-cta");
  if (navCta) {
    var pastHero = false;

    function syncNavCta() {
      var landingVisible = landingView && !landingView.classList.contains("hidden");
      var show = landingVisible && pastHero;
      navCta.classList.toggle("hidden", !show);
      navCta.classList.toggle("inline-flex", show);
    }

    ScrollTrigger.create({
      trigger: ".hero",
      start: "bottom top",
      onEnter: function () { pastHero = true; syncNavCta(); },
      onLeaveBack: function () { pastHero = false; syncNavCta(); }
    });

    navCta.addEventListener("click", function () {
      var mainCta = document.getElementById("cta-analyze");
      if (mainCta) mainCta.click();
    });

    if (landingView) {
      new MutationObserver(syncNavCta).observe(landingView, { attributes: true, attributeFilter: ["class"] });
    }
  }

  // Recalculate trigger positions once fonts/images/layout settle.
  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
  });
})();
