const map = L.map("map").setView([-6.2, 106.8], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const osrmBaseUrl = "https://router.project-osrm.org";

let waypoints = [];
let tripLayer = null;

// Get DOM elements
const profileSelect = document.getElementById("profile");
const clearBtn = document.getElementById("clear");
const matrixBtn = document.getElementById("btn-matrix");
const tripBtn = document.getElementById("btn-trip");
const stopsList = document.getElementById("stops-list");
const matrixContainer = document.getElementById("matrix-container");
const tripOrderList = document.getElementById("trip-order");
const infoDiv = document.getElementById("info");

// Custom Marker Numbered
function createMarkerIcon(num) {
  return L.divIcon({
    html: `<div class="marker-dot">${num}</div>`,
    className: "custom-marker",
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });
}

// Add waypoint on map click
map.on("click", (e) => {
  addWaypoint(e.latlng);
});

function addWaypoint(latlng) {
  const index = waypoints.length;

  const marker = L.marker(latlng, {
    draggable: true,
    icon: createMarkerIcon(index + 1)
  })
    .addTo(map)
    .bindPopup(`Stop ${index + 1}`)
    .openPopup();

  marker.on("dragend", () => {
    const pos = marker.getLatLng();
    waypoints[index].lat = pos.lat;
    waypoints[index].lng = pos.lng;
    renderStopsList();
  });

  waypoints.push({
    lat: latlng.lat,
    lng: latlng.lng,
    marker
  });

  renderStopsList();
}

function clearAll() {
  waypoints.forEach((w) => map.removeLayer(w.marker));
  waypoints = [];

  if (tripLayer) {
    map.removeLayer(tripLayer);
    tripLayer = null;
  }

  matrixContainer.innerHTML = "";
  stopsList.innerHTML = "";
  tripOrderList.innerHTML = "";
  infoDiv.innerHTML = "";
}

clearBtn.addEventListener("click", clearAll);

function renderStopsList() {
  stopsList.innerHTML = "";

  waypoints.forEach((wp, idx) => {
    wp.marker.setIcon(createMarkerIcon(idx + 1));

    const li = document.createElement("li");
    li.className = "stop-item";
    li.textContent = `Stop ${idx + 1}: (${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)})`;

    stopsList.appendChild(li);
  });
}

function formatDurationMinutes(seconds) {
  return (seconds / 60).toFixed(1);
}

function formatDistanceKm(meters) {
  return (meters / 1000).toFixed(2);
}

// Compute OD Matrix
matrixBtn.addEventListener("click", async () => {
  if (waypoints.length < 2) {
    infoDiv.textContent = "Minimal 2 titik untuk matrix.";
    return;
  }

  infoDiv.textContent = "Computing OD matrix...";
  matrixContainer.innerHTML = "";
  tripOrderList.innerHTML = "";

  if (tripLayer) {
    map.removeLayer(tripLayer);
    tripLayer = null;
  }

  const profile = profileSelect.value;
  const coords = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

  const url = `${osrmBaseUrl}/table/v1/${profile}/${coords}?annotations=duration`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok") {
      infoDiv.textContent = `Error OSRM: ${data.message}`;
      return;
    }

    renderMatrix(data.durations);
    infoDiv.textContent = "OD matrix computed.";
  } catch (e) {
    infoDiv.textContent = "Fetch matrix gagal.";
  }
});

function renderMatrix(durations) {
  const n = durations.length;
  let html = `<table class="matrix-table"><tr><th></th>`;

  for (let j = 0; j < n; j++) html += `<th>${j + 1}</th>`;
  html += "</tr>";

  for (let i = 0; i < n; i++) {
    html += `<tr><th>${i + 1}</th>`;
    for (let j = 0; j < n; j++) {
      const v = durations[i][j];
      html += `<td>${v ? formatDurationMinutes(v) : "-"}</td>`;
    }
    html += "</tr>";
  }

  html += "</table>";
  matrixContainer.innerHTML = html;
}

// Trip Optimization (TSP)
tripBtn.addEventListener("click", async () => {
  if (waypoints.length < 3) {
    infoDiv.textContent = "Minimal 3 titik untuk trip.";
    return;
  }

  infoDiv.textContent = "Processing trip...";

  tripOrderList.innerHTML = "";
  matrixContainer.innerHTML = "";

  if (tripLayer) {
    map.removeLayer(tripLayer);
    tripLayer = null;
  }

  const profile = profileSelect.value;
  const coords = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

  const url = `${osrmBaseUrl}/trip/v1/${profile}/${coords}?roundtrip=true&source=first&destination=last&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok") {
      infoDiv.textContent = "Error trip: " + data.message;
      return;
    }

    const trip = data.trips[0];

    const line = trip.geometry.coordinates.map((c) => [c[1], c[0]]);
    tripLayer = L.polyline(line, { color: "#1976d2", weight: 5 }).addTo(map);

    map.fitBounds(tripLayer.getBounds(), { padding: [40, 40] });

    infoDiv.innerHTML = `
      Trip berhasil!<br/>
      Jarak total: ${formatDistanceKm(trip.distance)} km<br/>
      Durasi total: ${(trip.duration / 3600).toFixed(2)} jam
    `;

    renderTripOrder(data.waypoints);
  } catch (e) {
    infoDiv.textContent = "Gagal mengambil data trip.";
  }
});

function renderTripOrder(wps) {
  tripOrderList.innerHTML = "";

  const sorted = [...wps].sort((a, b) => a.waypoint_index - b.waypoint_index);

  sorted.forEach((wp, idx) => {
    const li = document.createElement("li");

    li.textContent = `Visit Stop ${wp.waypoint_index + 1} (${wp.location[1].toFixed(
      5
    )}, ${wp.location[0].toFixed(5)})`;

    tripOrderList.appendChild(li);
  });
}
