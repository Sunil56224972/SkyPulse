import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "stats.js";
import { Earth } from "./Earth.js";
import { Flight } from "./Flight.js";
import { InstancedPlanes } from "./InstancedPlanes.js";
import { ParticlePlanes } from "./ParticlePlanes.js";
import { MergedFlightPaths } from "./MergedFlightPaths.js";
import { Stars } from "./Stars.js";
import { Controls } from "./Controls.js";
import {
  getSunVector3,
  getCurrentUtcTimeHours,
  hoursToTimeString,
  animateCameraToPosition,
  vector3ToLatLng
} from "./Utils.js";
import { LiveFlightFetcher } from "./LiveFlightFetcher.js";

let liveFlightFetcher = new LiveFlightFetcher();
let flightData = []; // will be populated from live API

let scene,
  camera,
  renderer,
  controls,
  earth,
  flights,
  guiControls,
  instancedPlanes,
  particlePlanes,
  currentPlaneRenderer,
  mergedFlightPaths,
  stats,
  stars,
  ambientLight,
  directionalLight;
let clock = new THREE.Clock();

function createLoadingScreen() {
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-screen';
  loadingDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000000;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 50px;
    height: 50px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid #58a6ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;

  // Add CSS animation for spinner
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  loadingDiv.appendChild(spinner);
  document.body.appendChild(loadingDiv);
}

function checkReadyToRemoveLoadingScreen() {
  if (window.earthTextureLoaded && window.minTimeElapsed) {
    setInitialCameraPosition();
  }
}

function hideUIElementsDuringLoading() {
  // Hide GUI controls (will be created later but start hidden)
  const guiContainer = document.querySelector('.dg.ac');
  if (guiContainer) {
    guiContainer.style.display = 'none';
  }

  // Hide coordinates in footer (but keep GitHub attribution visible)
  const coordinatesElement = document.getElementById('coordinates');
  if (coordinatesElement) {
    coordinatesElement.style.display = 'none';
  }
}

function showUIElementsAfterLoading() {
  // Show GUI controls
  const guiContainer = document.querySelector('.dg.ac');
  if (guiContainer) {
    guiContainer.style.display = 'block';
  }

  // Show FPS meter
  if (stats && stats.dom) {
    stats.dom.style.display = 'block';
  }

  // Show coordinates in footer
  const coordinatesElement = document.getElementById('coordinates');
  if (coordinatesElement) {
    coordinatesElement.style.display = 'block';
  }
}

function removeLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.5s ease-out';
    setTimeout(() => {
      loadingScreen.remove();
      // Show all UI elements after loading screen is removed
      showUIElementsAfterLoading();
    }, 500);
  }
}

async function init() {
  // Show loading screen first
  createLoadingScreen();

  // Hide UI elements during loading
  hideUIElementsDuringLoading();

  // Setup GUI controls first
  setupGUI();

  // Create scene
  scene = new THREE.Scene();

  // Create camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    20000
  );
  // Initialize loading state
  window.earthTextureLoaded = false;
  window.minTimeElapsed = false;

  // Position camera to show day/night terminator line with delay to show loading screen
  setTimeout(() => {
    window.minTimeElapsed = true;
    checkReadyToRemoveLoadingScreen();
  }, 2000); // Show loading screen for at least 2 seconds

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000);
  document.body.appendChild(renderer.domElement);

  // Create footer with attribution
  createFooter();

  // Initialize Stats
  stats = new Stats();
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  stats.dom.style.position = "absolute";
  stats.dom.style.left = "0px";
  stats.dom.style.top = "0px";
  stats.dom.style.display = "none"; // Start hidden during loading
  document.body.appendChild(stats.dom);

  // Add lighting
  ambientLight = new THREE.AmbientLight(0x404040, guiControls.nightBrightness);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, guiControls.dayBrightness);

  // Initialize sun position based on real time
  updateSunPosition();

  scene.add(directionalLight);

  // Create and add stars (background starfield)
  stars = new Stars(5000, 10000, 20000);
  stars.addToScene(scene);

  // Create and add Earth with texture loading callback
  earth = new Earth(3000, () => {
    window.earthTextureLoaded = true;
    checkReadyToRemoveLoadingScreen();
  });
  earth.addToScene(scene);

  // --- Fetch real-time flight data from AviationStack API ---
  flightData = await liveFlightFetcher.fetchFlights();
  if (flightData.length === 0) {
    console.warn("[LiveFlight] No live flights returned, using fallback global routes.");
    flightData = [
      // Transatlantic
      { departure: { lat: 40.6413, lng: -73.7781 }, arrival: { lat: 51.4700, lng: -0.4543 }, speed: 500 },
      { departure: { lat: 42.3656, lng: -71.0096 }, arrival: { lat: 49.0097, lng: 2.5479 }, speed: 510 },
      { departure: { lat: 33.6407, lng: -84.4277 }, arrival: { lat: 50.0379, lng: 8.5622 }, speed: 520 },
      { departure: { lat: 41.9742, lng: -87.9073 }, arrival: { lat: 51.4700, lng: -0.4543 }, speed: 490 },
      { departure: { lat: 25.7959, lng: -80.2870 }, arrival: { lat: 40.4983, lng: -3.5676 }, speed: 530 },
      // Transpacific
      { departure: { lat: 33.9425, lng: -118.4081 }, arrival: { lat: 35.5494, lng: 139.7798 }, speed: 550 },
      { departure: { lat: 37.6213, lng: -122.3790 }, arrival: { lat: 37.4602, lng: 126.4407 }, speed: 540 },
      { departure: { lat: 47.4502, lng: -122.3088 }, arrival: { lat: 25.0797, lng: 121.2342 }, speed: 530 },
      // Europe internal
      { departure: { lat: 51.4700, lng: -0.4543 }, arrival: { lat: 41.2971, lng: 2.0785 }, speed: 450 },
      { departure: { lat: 49.0097, lng: 2.5479 }, arrival: { lat: 41.8003, lng: 12.2389 }, speed: 460 },
      { departure: { lat: 52.3105, lng: 4.7683 }, arrival: { lat: 37.9364, lng: 23.9445 }, speed: 470 },
      { departure: { lat: 50.0379, lng: 8.5622 }, arrival: { lat: 41.2753, lng: 28.7519 }, speed: 480 },
      { departure: { lat: 48.1103, lng: 16.5697 }, arrival: { lat: 38.7756, lng: -9.1354 }, speed: 440 },
      // Middle East hub
      { departure: { lat: 25.2532, lng: 55.3657 }, arrival: { lat: 51.4700, lng: -0.4543 }, speed: 520 },
      { departure: { lat: 25.2532, lng: 55.3657 }, arrival: { lat: 1.3644, lng: 103.9915 }, speed: 510 },
      { departure: { lat: 25.2532, lng: 55.3657 }, arrival: { lat: -33.9461, lng: 151.1772 }, speed: 540 },
      { departure: { lat: 25.2731, lng: 51.6081 }, arrival: { lat: 40.6413, lng: -73.7781 }, speed: 530 },
      { departure: { lat: 25.2532, lng: 55.3657 }, arrival: { lat: 19.0896, lng: 72.8656 }, speed: 460 },
      // Asia internal
      { departure: { lat: 1.3644, lng: 103.9915 }, arrival: { lat: 22.3080, lng: 113.9185 }, speed: 480 },
      { departure: { lat: 13.6900, lng: 100.7501 }, arrival: { lat: 35.5494, lng: 139.7798 }, speed: 500 },
      { departure: { lat: 22.3080, lng: 113.9185 }, arrival: { lat: 37.4602, lng: 126.4407 }, speed: 470 },
      { departure: { lat: 28.5562, lng: 77.1000 }, arrival: { lat: 1.3644, lng: 103.9915 }, speed: 490 },
      { departure: { lat: 31.1443, lng: 121.8083 }, arrival: { lat: 13.6900, lng: 100.7501 }, speed: 460 },
      { departure: { lat: 40.0799, lng: 116.6031 }, arrival: { lat: 35.7647, lng: 140.3864 }, speed: 480 },
      // Oceania
      { departure: { lat: -33.9461, lng: 151.1772 }, arrival: { lat: 2.7456, lng: 101.7099 }, speed: 510 },
      { departure: { lat: -37.6690, lng: 144.8410 }, arrival: { lat: 1.3644, lng: 103.9915 }, speed: 500 },
      { departure: { lat: -37.0082, lng: 174.7850 }, arrival: { lat: -33.9461, lng: 151.1772 }, speed: 430 },
      // Africa
      { departure: { lat: -26.1392, lng: 28.2460 }, arrival: { lat: 25.2532, lng: 55.3657 }, speed: 520 },
      { departure: { lat: 30.1219, lng: 31.4056 }, arrival: { lat: 51.4700, lng: -0.4543 }, speed: 510 },
      { departure: { lat: -1.3192, lng: 36.9278 }, arrival: { lat: 52.3105, lng: 4.7683 }, speed: 500 },
      { departure: { lat: 8.9779, lng: 38.7993 }, arrival: { lat: 25.2532, lng: 55.3657 }, speed: 490 },
      { departure: { lat: 33.3675, lng: -7.5898 }, arrival: { lat: 49.0097, lng: 2.5479 }, speed: 450 },
      // South America
      { departure: { lat: -23.4356, lng: -46.4731 }, arrival: { lat: 25.7959, lng: -80.2870 }, speed: 530 },
      { departure: { lat: -34.8222, lng: -58.5358 }, arrival: { lat: 40.4983, lng: -3.5676 }, speed: 540 },
      { departure: { lat: 4.7016, lng: -74.1469 }, arrival: { lat: 25.7959, lng: -80.2870 }, speed: 460 },
      { departure: { lat: -33.3930, lng: -70.7858 }, arrival: { lat: -23.4356, lng: -46.4731 }, speed: 450 },
      { departure: { lat: -12.0219, lng: -77.1143 }, arrival: { lat: 4.7016, lng: -74.1469 }, speed: 440 },
      // India routes
      { departure: { lat: 19.0896, lng: 72.8656 }, arrival: { lat: 51.4700, lng: -0.4543 }, speed: 520 },
      { departure: { lat: 28.5562, lng: 77.1000 }, arrival: { lat: 25.2532, lng: 55.3657 }, speed: 470 },
      { departure: { lat: 13.1979, lng: 77.7063 }, arrival: { lat: 1.3644, lng: 103.9915 }, speed: 480 },
      { departure: { lat: 12.9941, lng: 80.1709 }, arrival: { lat: 2.7456, lng: 101.7099 }, speed: 460 },
      // North America internal
      { departure: { lat: 33.9425, lng: -118.4081 }, arrival: { lat: 40.6413, lng: -73.7781 }, speed: 500 },
      { departure: { lat: 43.6777, lng: -79.6248 }, arrival: { lat: 49.1967, lng: -123.1815 }, speed: 480 },
      { departure: { lat: 19.4363, lng: -99.0721 }, arrival: { lat: 33.9425, lng: -118.4081 }, speed: 460 },
      { departure: { lat: 21.0365, lng: -86.8771 }, arrival: { lat: 43.6777, lng: -79.6248 }, speed: 470 },
      // Russia & Central Asia
      { departure: { lat: 55.9726, lng: 37.4146 }, arrival: { lat: 25.2532, lng: 55.3657 }, speed: 500 },
      { departure: { lat: 55.9726, lng: 37.4146 }, arrival: { lat: 40.0799, lng: 116.6031 }, speed: 530 },
      // Long haul misc
      { departure: { lat: -33.9461, lng: 151.1772 }, arrival: { lat: 25.2532, lng: 55.3657 }, speed: 540 },
      { departure: { lat: 1.3644, lng: 103.9915 }, arrival: { lat: 51.4700, lng: -0.4543 }, speed: 550 },
      { departure: { lat: 22.3080, lng: 113.9185 }, arrival: { lat: 33.9425, lng: -118.4081 }, speed: 560 },
    ];
  }
  // Start auto-refresh so the data stays live
  liveFlightFetcher.startAutoRefresh();

  // Update the GUI flight count slider now that we know how many flights we have
  if (window.guiControlsInstance) {
    window.guiControlsInstance.updateMaxFlightCount(flightData.length);
    guiControls = window.guiControlsInstance.getControls();
  }

  // Create instanced planes manager with much smaller base size (10x smaller than original)
  instancedPlanes = new InstancedPlanes(flightData.length, 10);
  instancedPlanes.addToScene(scene);
  // Scale by 1.0 so that size=1 gives normal base size (2x bigger than before)
  instancedPlanes.setGlobalScale(guiControls.planeSize * 1.0);
  instancedPlanes.setColorization(guiControls.colorizeePlanes);

  // Create particle planes manager
  particlePlanes = new ParticlePlanes(flightData.length, earth.getRadius());
  particlePlanes.addToScene(scene);
  particlePlanes.setGlobalScale(guiControls.planeSize * 2.0);
  particlePlanes.setColorization(guiControls.colorizeePlanes);

  // Set initial plane renderer based on controls
  currentPlaneRenderer = guiControls.planeRenderType === "particles" ? particlePlanes : instancedPlanes;

  // Hide the non-active renderer
  if (guiControls.planeRenderType === "particles") {
    instancedPlanes.getMesh().visible = false;
    particlePlanes.getMesh().visible = true;
  } else {
    instancedPlanes.getMesh().visible = true;
    particlePlanes.getMesh().visible = false;
  }

  // Create merged flight paths manager
  mergedFlightPaths = new MergedFlightPaths();
  mergedFlightPaths.initialize(flightData.length);
  mergedFlightPaths.addToScene(scene);

  // Create all flights from data with instance IDs
  const allFlights = flightData.map((flightOptions, index) => {
    const flight = new Flight(
      flightOptions,
      earth,
      currentPlaneRenderer,
      index,
      mergedFlightPaths
    );
    return flight;
  });

  // Show only the initial number of flights
  flights = allFlights.slice(0, guiControls.flightCount);
  flights.forEach((flight) => {
    flight.addToScene(scene);
  });

  // Set active count for current plane renderer and flight paths
  currentPlaneRenderer.setActiveCount(guiControls.flightCount);
  mergedFlightPaths.setVisibleFlightCount(guiControls.flightCount);

  // Store all flights for later use
  window.allFlights = allFlights;

  // Initialize OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 3200; // Prevent zooming into Earth surface (Earth radius is 3000)
  controls.maxDistance = 20000;

  // Handle window resize
  window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createFooter() {
  const footer = document.createElement('div');
  footer.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    pointer-events: none;
  `;

  footer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; pointer-events: auto;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; fill: white;">
        <path d="M173.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM252.8 8c-138.7 0-244.8 105.3-244.8 244 0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1 100-33.2 167.8-128.1 167.8-239 0-138.7-112.5-244-251.2-244zM105.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
      </svg>
      <span>Made by</span>
      <a href="https://github.com/Sunil56224972" target="_blank" rel="noopener noreferrer"
         style="color: #58a6ff; text-decoration: none; font-weight: 500;">
        Sunil56224972
      </a>
    </div>
    <div id="coordinates" style="pointer-events: none; font-family: monospace; font-size: 12px; opacity: 0.8; display: none;">
      Lat: 0.00°, Lng: 0.00°
    </div>
  `;

  document.body.appendChild(footer);
}

function updateCoordinateDisplay() {
  const coordinatesElement = document.getElementById('coordinates');
  if (coordinatesElement && camera && earth) {
    // Get the direction from camera to center (0,0,0)
    const direction = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
    // Scale to earth surface
    const earthSurfacePoint = direction.multiplyScalar(earth.getRadius());
    // Convert to lat/lng
    const coords = vector3ToLatLng(earthSurfacePoint, earth.getRadius());
    // Update display with 2 decimal places
    coordinatesElement.textContent = `Lat: ${coords.lat.toFixed(2)}°, Lng: ${coords.lng.toFixed(2)}°`;
  }
}

function setupGUI() {
  const controls = new Controls();

  const callbacks = {
    onPlaneSizeChange: (value) => {
      if (currentPlaneRenderer) {
        // Apply 2.0 scaling factor for particle planes and 1.0 for instanced planes (2x bigger than before)
        const scaleFactor = currentPlaneRenderer.isParticleRenderer ? 2.0 : 1.0;
        currentPlaneRenderer.setGlobalScale(value * scaleFactor);
      }
    },
    onPlaneRenderTypeChange: switchPlaneRenderer,
    onFlightCountChange: updateFlightCount,
    onShowFlightPathsChange: toggleFlightPaths,
    onShowPlanesChange: togglePlanes,
    onColorizePlanesChange: togglePlaneColorization,
    onDayNightEffectChange: toggleDayNightEffect,
    onAtmosphereEffectChange: toggleAtmosphereEffect,
    onResetSunPosition: () => {
      directionalLight.position.set(0, 1000, 1000);
    },
    onDayBrightnessChange: updateLighting,
    onNightBrightnessChange: updateLighting
  };

  controls.setup(callbacks, flightData.length);
  guiControls = controls.getControls();

  // Store controls instance globally for access in other functions
  window.guiControlsInstance = controls;

  // Hide GUI controls initially during loading
  const guiContainer = document.querySelector('.dg.ac');
  if (guiContainer) {
    guiContainer.style.display = 'none';
  }
}

function switchPlaneRenderer(renderType) {
  // Update the render type in controls
  guiControls.planeRenderType = renderType;

  // Hide current renderer
  if (currentPlaneRenderer && currentPlaneRenderer.getMesh()) {
    currentPlaneRenderer.getMesh().visible = false;
  }

  // Switch to new renderer
  if (renderType === "particles") {
    currentPlaneRenderer = particlePlanes;
  } else {
    currentPlaneRenderer = instancedPlanes;
  }

  // Show new renderer
  if (currentPlaneRenderer && currentPlaneRenderer.getMesh()) {
    currentPlaneRenderer.getMesh().visible = guiControls.showPlanes;
  }

  // Update flights to use new renderer
  if (window.allFlights) {
    window.allFlights.forEach((flight) => {
      flight.setPlaneRenderer(currentPlaneRenderer);
    });
  }

  // Apply current settings to new renderer
  if (currentPlaneRenderer) {
    currentPlaneRenderer.setActiveCount(guiControls.flightCount);
    // Apply appropriate scaling factor based on renderer type (2x bigger than before)
    const scaleFactor = currentPlaneRenderer.isParticleRenderer ? 2.0 : 1.0;
    currentPlaneRenderer.setGlobalScale(guiControls.planeSize * scaleFactor);
    currentPlaneRenderer.setColorization(guiControls.colorizeePlanes);
  }
}

function updateFlightCount(count) {
  // Update flights array to new count
  flights = window.allFlights.slice(0, count);

  // Update current plane renderer active count
  if (currentPlaneRenderer) {
    currentPlaneRenderer.setActiveCount(count);
  }

  // Update merged flight paths visible count
  if (mergedFlightPaths) {
    mergedFlightPaths.setVisibleFlightCount(count);
  }
}

function toggleDayNightEffect(enabled) {
  if (enabled) {
    updateLighting();
  } else {
    // Disable day/night effect - make lighting uniform and bright
    directionalLight.intensity = 0.5;
    ambientLight.intensity = 1.2;
  }
}

function updateLighting() {
  if (guiControls.dayNightEffect) {
    // Use brightness controls for realistic day/night lighting
    directionalLight.intensity = guiControls.dayBrightness;
    ambientLight.intensity = guiControls.nightBrightness;
  }
}

function toggleAtmosphereEffect(enabled) {
  if (earth && earth.atmosphere) {
    earth.atmosphere.mesh.visible = enabled;
  }
}

function toggleFlightPaths(enabled) {
  if (mergedFlightPaths) {
    mergedFlightPaths.setCurvesVisible(enabled);
  }
}

function togglePlanes(enabled) {
  if (currentPlaneRenderer && currentPlaneRenderer.getMesh()) {
    currentPlaneRenderer.getMesh().visible = enabled;
  }
}

function togglePlaneColorization(enabled) {
  if (currentPlaneRenderer) {
    currentPlaneRenderer.setColorization(enabled);
  }
}

function setInitialCameraPosition() {
  // Get current sun position to determine day/night terminator
  const utcTime = getCurrentUtcTimeHours();
  const sunPos = getSunVector3(3000, utcTime);

  // Position camera at the sun position, then pan 90 degrees to the right
  const cameraDistance = 6000;
  const sunDirection = sunPos.clone().normalize();

  // Rotate the sun direction 70 degrees to the right (around Y-axis)
  const angle = (70 * Math.PI) / 180; // Convert 70 degrees to radians
  const rotatedDirection = new THREE.Vector3();
  rotatedDirection.x = sunDirection.x * Math.cos(angle) + sunDirection.z * Math.sin(angle);
  rotatedDirection.y = sunDirection.y;
  rotatedDirection.z = -sunDirection.x * Math.sin(angle) + sunDirection.z * Math.cos(angle);

  const targetPosition = rotatedDirection.multiplyScalar(cameraDistance);

  // Set a closer starting position to avoid the dramatic zoom effect
  const startPosition = targetPosition.clone().multiplyScalar(1.2); // Start only 20% further out
  camera.position.copy(startPosition);

  // Animate camera to target position with 1 second delay
  animateCameraToPosition(camera, startPosition, targetPosition, 2000, 1000);

  // Remove loading screen after camera positioning starts
  removeLoadingScreen();
}

function updateSunPosition() {
  if (directionalLight) {
    if (guiControls.realTimeSun) {
      // Continuously update UTC time for real-time mode
      const currentUtcTime = getCurrentUtcTimeHours();
      guiControls.simulatedTime = currentUtcTime;
      guiControls.timeDisplay = hoursToTimeString(currentUtcTime);

      // Force update GUI controls to reflect real-time changes
      if (window.guiControlsInstance && window.guiControlsInstance.controllers) {
        // Update the time display field
        if (window.guiControlsInstance.controllers.timeDisplay) {
          window.guiControlsInstance.controllers.timeDisplay.updateDisplay();
        }
        // Update the time slider
        if (window.guiControlsInstance.controllers.timeSlider) {
          window.guiControlsInstance.controllers.timeSlider.updateDisplay();
        }
      }

      const sunPosition = getSunVector3(earth ? earth.getRadius() : 3000, guiControls.simulatedTime);
      directionalLight.position.copy(sunPosition);
    } else if (guiControls.dayNightEffect) {
      // Use simulated time for manual time control (already in UTC)
      const sunPosition = getSunVector3(earth ? earth.getRadius() : 3000, guiControls.simulatedTime);
      directionalLight.position.copy(sunPosition);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  stats.begin();

  const delta = clock.getDelta();

  // Update controls
  controls.update();

  // Update stars animation
  if (stars) {
    stars.update(delta);
  }

  // Update flight animations with speed multiplier (only if planes are visible)
  if (flights && guiControls.showPlanes) {
    const adjustedDelta = delta * guiControls.animationSpeed;
    let needsMatrixUpdate = false;
    let needsPlaneTypeUpdate = false;

    flights.forEach((flight) => {
      flight.update(adjustedDelta);
      // Track if we need updates for batching
      if (currentPlaneRenderer && !currentPlaneRenderer.isParticleRenderer) {
        needsMatrixUpdate = true;
      }
    });

    // Batch update instance matrices for instanced planes only once per frame
    if (needsMatrixUpdate && currentPlaneRenderer && !currentPlaneRenderer.isParticleRenderer) {
      currentPlaneRenderer.forceMatrixUpdate();
    }
  }

  // Update particle planes if active
  if (currentPlaneRenderer === particlePlanes && particlePlanes) {
    particlePlanes.update(delta);
  }

  // Apply batched updates for flight paths (only once per frame)
  if (mergedFlightPaths) {
    mergedFlightPaths.applyBatchedUpdates();
  }

  // Update sun position every frame if real-time sun is enabled
  updateSunPosition();

  // Update coordinate display
  updateCoordinateDisplay();

  renderer.render(scene, camera);

  stats.end();
}

// Initialize and start the application
init();
animate();
