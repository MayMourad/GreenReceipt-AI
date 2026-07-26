(function () {
  "use strict";

  var container = document.getElementById("hero-canvas-container");
  var canvas = document.getElementById("hero-canvas");
  var fallback = document.getElementById("hero-fallback");
  var landingView = document.getElementById("view-landing");
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!container || !canvas || !fallback) return;

  function showFallback() {
    container.classList.add("hidden");
    fallback.classList.remove("hidden");
  }

  // Feature detection: Three.js CDN must have loaded and WebGL must be usable.
  if (typeof THREE === "undefined") {
    showFallback();
    return;
  }

  var scene, camera, renderer, receiptGroup, particles, particleVelocities;
  var rafId = null;
  var isRunning = false;

  try {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(32, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    if (!renderer) throw new Error("WebGL renderer unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);

    // ---- Lighting ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var keyLight = new THREE.DirectionalLight(0xffffff, 0.65);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);
    var rimLight = new THREE.PointLight(0x2f7a49, 0.9, 12);
    rimLight.position.set(-2.4, -1.6, 2.6);
    scene.add(rimLight);

    // ---- Receipt texture (procedurally drawn, no image asset needed) ----
    var texCanvas = document.createElement("canvas");
    texCanvas.width = 512;
    texCanvas.height = 720;
    var ctx = texCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, texCanvas.width, texCanvas.height);

    ctx.fillStyle = "#1F5E37";
    ctx.font = "700 30px -apple-system, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GreenReceipt", texCanvas.width / 2, 70);
    ctx.font = "400 16px -apple-system, Arial, sans-serif";
    ctx.fillStyle = "rgba(20,24,28,0.4)";
    ctx.fillText("PURCHASE INTELLIGENCE", texCanvas.width / 2, 98);

    ctx.strokeStyle = "rgba(20,24,28,0.15)";
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(40, 130);
    ctx.lineTo(texCanvas.width - 40, 130);
    ctx.stroke();
    ctx.setLineDash([]);

    var rowY = 175;
    var rows = [
      ["Organic Spinach", "3.49"], ["Whole Milk", "4.29"], ["Chicken Breast", "8.99"],
      ["Brown Rice", "4.49"], ["Olive Oil", "9.99"], ["Sparkling Water", "6.99"],
      ["Whole Wheat Bread", "3.99"], ["Greek Yogurt", "5.49"]
    ];
    ctx.textAlign = "left";
    ctx.font = "400 17px -apple-system, Arial, sans-serif";
    rows.forEach(function (row) {
      ctx.fillStyle = "rgba(20,24,28,0.55)";
      ctx.fillText(row[0], 44, rowY);
      ctx.textAlign = "right";
      ctx.fillText("$" + row[1], texCanvas.width - 44, rowY);
      ctx.textAlign = "left";
      rowY += 42;
    });

    ctx.strokeStyle = "rgba(20,24,28,0.15)";
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(40, rowY + 10);
    ctx.lineTo(texCanvas.width - 40, rowY + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "700 22px -apple-system, Arial, sans-serif";
    ctx.fillStyle = "#14181C";
    ctx.fillText("TOTAL", 44, rowY + 50);
    ctx.textAlign = "right";
    ctx.fillText("$53.20", texCanvas.width - 44, rowY + 50);
    ctx.textAlign = "left";

    ctx.fillStyle = "#2F7A49";
    ctx.font = "700 18px -apple-system, Arial, sans-serif";
    ctx.fillText("PurchaseIQ™  82 / 100", 44, rowY + 95);

    // Faux barcode
    var bx = 44, by = texCanvas.height - 70;
    for (var i = 0; i < 46; i++) {
      var w = Math.random() > 0.7 ? 4 : 2;
      ctx.fillStyle = "rgba(20,24,28,0.8)";
      ctx.fillRect(bx, by, w, 44);
      bx += w + 3;
    }

    var texture = new THREE.CanvasTexture(texCanvas);
    texture.needsUpdate = true;

    // ---- Receipt mesh (thin extruded box so it reads as a physical object) ----
    var geometry = new THREE.BoxGeometry(2.5, 3.5, 0.05);
    var paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.02 });
    var frontMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0.02 });
    var materials = [paperMat, paperMat, paperMat, paperMat, frontMat, paperMat];

    receiptGroup = new THREE.Group();
    var receiptMesh = new THREE.Mesh(geometry, materials);
    receiptGroup.add(receiptMesh);
    receiptGroup.rotation.y = -0.18;
    receiptGroup.rotation.x = 0.05;
    scene.add(receiptGroup);

    // ---- Ambient particles (data "flowing" off the receipt) ----
    var count = 46;
    var positions = new Float32Array(count * 3);
    particleVelocities = new Float32Array(count);
    for (var p = 0; p < count; p++) {
      positions[p * 3] = (Math.random() - 0.5) * 4.4;
      positions[p * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[p * 3 + 2] = (Math.random() - 0.5) * 2.5 + 0.6;
      particleVelocities[p] = 0.003 + Math.random() * 0.006;
    }
    var particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var particleMat = new THREE.PointsMaterial({
      color: 0x8cbb9b, size: 0.045, transparent: true, opacity: 0.55, sizeAttenuation: true
    });
    particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);

    // ---- Resize handling ----
    var resizeObserver = new ResizeObserver(function () {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight, false);
    });
    resizeObserver.observe(container);

    // ---- Render loop ----
    function updateParticles() {
      var pos = particleGeom.attributes.position.array;
      for (var i = 0; i < count; i++) {
        pos[i * 3 + 1] += particleVelocities[i];
        if (pos[i * 3 + 1] > 2.6) pos[i * 3 + 1] = -2.6;
      }
      particleGeom.attributes.position.needsUpdate = true;
    }

    function renderStaticFrame() {
      renderer.render(scene, camera);
    }

    function animate(time) {
      if (!isRunning) return;
      rafId = requestAnimationFrame(animate);
      var t = time * 0.001;
      receiptGroup.rotation.y = Math.sin(t * 0.35) * 0.34 - 0.18;
      receiptGroup.rotation.x = Math.sin(t * 0.28) * 0.06 + 0.05;
      receiptGroup.position.y = Math.sin(t * 0.55) * 0.14;
      updateParticles();
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

    // Only render while the landing view is actually visible — saves GPU/battery
    // and avoids animating a hidden canvas.
    var observer = new MutationObserver(function () {
      if (landingView.classList.contains("hidden")) stop();
      else start();
    });
    observer.observe(landingView, { attributes: true, attributeFilter: ["class"] });

    if (!landingView.classList.contains("hidden")) start();
    else renderStaticFrame();
  } catch (err) {
    showFallback();
  }
})();
