(function () {
  "use strict";

  // A secondary, lighter-weight echo of the hero's 4D wireframe concept,
  // relocated into the "How it works" section as a decorative "AI Core"
  // visual. Independent of hero.js — its own small scene, own pause logic
  // (IntersectionObserver, since this section scrolls in and out of view
  // within the same long landing page the main hero also lives on).

  var stage = document.getElementById("ai-core-stage");
  var canvas = document.getElementById("ai-core-canvas");
  var fallback = document.getElementById("ai-core-fallback");
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!stage || !canvas || !fallback) return;

  function showFallback() {
    stage.classList.add("no-canvas");
    canvas.style.display = "none";
    fallback.classList.remove("hidden");
  }

  if (typeof THREE === "undefined") {
    showFallback();
    return;
  }

  var scene, camera, renderer, coreGroup;
  var rafId = null;
  var isRunning = false;
  var rotation = { x: 0.15, y: -0.3, z: 0 };

  try {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    if (!renderer) throw new Error("WebGL renderer unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();

    coreGroup = new THREE.Group();

    var radius = 1.1;
    var icoGeometry = new THREE.IcosahedronGeometry(radius, 0);
    var edges = new THREE.EdgesGeometry(icoGeometry);
    var lineMaterial = new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.8 });
    coreGroup.add(new THREE.LineSegments(edges, lineMaterial));

    var faceMaterial = new THREE.MeshBasicMaterial({
      color: 0x16a34a, transparent: true, opacity: 0.07, side: THREE.DoubleSide
    });
    coreGroup.add(new THREE.Mesh(icoGeometry, faceMaterial));

    // Glowing vertex nodes (same golden-ratio vertex formula as the hero).
    var phi = (1 + Math.sqrt(5)) / 2;
    var rawVerts = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
    ];
    var nodeGeom = new THREE.SphereGeometry(0.045, 8, 8);
    rawVerts.forEach(function (v, i) {
      var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      var color = i % 2 === 0 ? 0x4ade80 : 0x22d3ee;
      var node = new THREE.Mesh(nodeGeom, new THREE.MeshBasicMaterial({ color: color }));
      node.position.set((v[0] / len) * radius, (v[1] / len) * radius, (v[2] / len) * radius);
      coreGroup.add(node);
    });

    scene.add(coreGroup);

    var resizeObserver = new ResizeObserver(function () {
      if (!stage.clientWidth || !stage.clientHeight) return;
      camera.aspect = stage.clientWidth / stage.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    });
    resizeObserver.observe(stage);

    function renderStaticFrame() {
      renderer.render(scene, camera);
    }

    function animate() {
      if (!isRunning) return;
      rafId = requestAnimationFrame(animate);
      rotation.x += 0.004;
      rotation.y += 0.006;
      rotation.z += 0.002;
      coreGroup.rotation.set(rotation.x, rotation.y, rotation.z);
      renderer.render(scene, camera);
    }

    function start() {
      if (isRunning) return;
      isRunning = true;
      if (reducedMotion) {
        renderStaticFrame();
      } else {
        rafId = requestAnimationFrame(animate);
      }
    }

    function stop() {
      isRunning = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    // Only render while this section is actually scrolled into view.
    var visibilityObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }, { threshold: 0.1 });
    visibilityObserver.observe(stage);
  } catch (err) {
    showFallback();
  }
})();
