document.addEventListener("DOMContentLoaded", function () {
  const map = L.map('map').setView([45.5017, -73.5673], 13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  minZoom: 0,
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd'
}).addTo(map);
    
    
    L.Control.geocoder({
    defaultMarkGeocode: true,
    geocoder: L.Control.Geocoder.nominatim(),
    position: 'bottomleft'
  }).addTo(map);

  const zoomThreshold = 18;
  let clusterLayer = L.markerClusterGroup();
  let plainLayer = null;
  let rawData = null;
    
    
  // Crée les clusters
function createClusterLayer(data) {
  const geoJsonLayer = L.geoJSON(data, {
    pointToLayer: (feature, latlng) => L.marker(latlng)
  });

  clusterLayer.clearLayers(); // important si on recharge
  clusterLayer.addLayer(geoJsonLayer);
}


  // Filtre les points visibles selon les coordonnées
  function filterVisiblePoints(data, bounds) {
    return {
      type: "FeatureCollection",
      features: data.features.filter(feature => {
        const [lng, lat] = feature.geometry.coordinates;
        return bounds.contains([lat, lng]);
      })
    };
  }
    
    // crée le gradient de couleur des arbres
function getColorFromDBH(dbh, min = 5, max = 100) {
  // Clamp dbh entre min et max
  dbh = Math.max(min, Math.min(dbh, max));
  
  // Calcul du ratio (0 à 1)
  const ratio = 1 - (dbh - min) / (max - min);

  // Interpolation linéaire entre vert foncé (#006400) et vert clair (#90EE90)
  const darkGreen = [0x00, 0x64, 0x00];
  const lightGreen = [0x90, 0xEE, 0x90];

  const interpolated = darkGreen.map((start, i) =>
    Math.round(start + ratio * (lightGreen[i] - start))
  );

  return `rgb(${interpolated.join(",")})`;
}

    
  // Crée les points individuels
function createPlainLayer(data) {
  return L.geoJSON(data, {
    pointToLayer: (feature, latlng) => {
      let genus = feature.properties.genus || 'Autre';
      if (!genusSymbolMap[genus]) genus = 'Autre';

      const shapeClass = genusSymbolMap[genus];
      const dbh = feature.properties.DBH_final;
      const color = getColorFromDBH(dbh);

      const marker = L.marker(latlng, {
        icon: L.divIcon({
          html: `<div class="tree-icon ${shapeClass}" style="background-color: ${color};"></div>`,
          className: 'no-default-icon',
          iconSize: [20, 20]
        })
      });

      marker.on('click', () => {
  //  Retirer la sélection précédente
  if (selectedTreeMarker) {
    const prevEl = selectedTreeMarker.getElement();
    if (prevEl) prevEl.classList.remove('selected');
  }

  // ✅ Appliquer la sélection actuelle
  const thisEl = marker.getElement();
  if (thisEl) thisEl.classList.add('selected');

  selectedTreeMarker = marker;
        const infoBox = document.getElementById('tree-info-box');
        const infoContent = document.getElementById('tree-info-content');
        if (infoBox && infoContent) {
          infoContent.innerHTML = `
            <strong>Genre :</strong> ${feature.properties.genus}<br>
            <strong>Espèce :</strong> ${feature.properties.species || 'Non spécifiée'}<br>
            <strong>Diamètre (DBH) :</strong> ${dbh} cm<br>
            <strong>Statut :</strong> ${feature.properties.privpub || 'Non disponible'}<br>
            <strong>Occupation du sol :</strong> ${feature.properties.landuse || 'Non disponible'}
          `;
          infoBox.classList.remove('hidden');
        }
      });

      return marker;
    }
  });
}
    
let selectedTreeMarker = null;


    
document.getElementById('close-info-box').addEventListener('click', () => {
  document.getElementById('tree-info-box').classList.add('hidden');
});
    
  // Met à jour l'affichage selon le zoom
  function updateLayer() {
    const zoom = map.getZoom();
    const bounds = map.getBounds();

    if (zoom < zoomThreshold) {
      if (plainLayer && map.hasLayer(plainLayer)) {
        map.removeLayer(plainLayer);
      }
      if (!map.hasLayer(clusterLayer)) {
        map.addLayer(clusterLayer);
      }
    } else {
      if (map.hasLayer(clusterLayer)) {
        map.removeLayer(clusterLayer);
      }

      const visibleData = filterVisiblePoints(rawData, bounds);

      if (plainLayer && map.hasLayer(plainLayer)) {
        map.removeLayer(plainLayer);
      }

      plainLayer = createPlainLayer(visibleData);
      map.addLayer(plainLayer);
    }
  }

// Chargement des données GeoJSON
fetch('tree_points.geojson')
  .then(response => response.json())
  .then(data => {
    //  Filtrer uniquement les points avec un champ 'genus' non vide
    const filteredData = {
      type: "FeatureCollection",
      features: data.features.filter(f => f.properties.genus && f.properties.genus.trim() !== "")
    };

    rawData = filteredData;

    //  Extraire les genres uniques
    const uniqueGenus = [...new Set(filteredData.features.map(f => f.properties.genus))];
    assignSymbolsToGenus(uniqueGenus, filteredData);
    renderLegend(Object.entries(genusSymbolMap).slice(0, 10).map(e => e[0]));



    //  Créer le cluster et afficher
    createClusterLayer(filteredData);
    updateLayer();

    map.on('zoomend', updateLayer);
    map.on('moveend', () => {
      if (map.getZoom() >= zoomThreshold) {
        updateLayer();
      }
    });
  })
  .catch(err => console.error('Erreur chargement GeoJSON:', err));

});

    // Charge les formes des points des arbres
    const availableShapes = [
  'shape-diamond',
  'shape-circle',
  'shape-triangle',
  'shape-hexagon',
  'shape-ellipse',
  'shape-halfmoon',
  'shape-square'
];

const genusSymbolMap = {}; // { "Eucalyptus": "shape-diamond", ... }

function assignSymbolsToGenus(genusList, data) {
  const genusCount = {};

  // Compter la fréquence de chaque genre
  data.features.forEach(f => {
    const genus = f.properties.genus;
    if (genus) {
      genusCount[genus] = (genusCount[genus] || 0) + 1;
    }
  });

  // Trier les genres par fréquence décroissante
  const sortedGenus = Object.entries(genusCount)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  // Sélectionner les 10 genres les plus fréquents
  const top10Genus = sortedGenus.slice(0, 10);

  // Forme par défaut pour les genres hors top 10
  const defaultShape = 'shape-square';

  // Attribuer les formes aux genres
  sortedGenus.forEach((genus, index) => {
    if (top10Genus.includes(genus)) {
      genusSymbolMap[genus] = `shape-${index + 1}`;
    } else {
      genusSymbolMap[genus] = 'shape-11';
    }
  });
}

// légende
function renderLegend(top10Genus) {
  const genusLegend = document.getElementById('genus-legend');
  const dbhLegend = document.getElementById('dbh-legend');

  // Légende des genres
  genusLegend.innerHTML = `<strong>genre des arbres urbains</strong>`;
  top10Genus.forEach((genus, index) => {
    const shapeClass = `shape-${index + 1}`;
    genusLegend.innerHTML += `
      <div class="legend-item">
        <div class="legend-shape ${shapeClass}"></div>
        <span>${genus}</span>
      </div>
    `;
  });

  genusLegend.innerHTML += `
    <div class="legend-item">
      <div class="legend-shape shape-11"></div>
      <span>Autres genres</span>
    </div>
  `;

  // Légende du diamètre (DBH)
  dbhLegend.innerHTML = `
    <strong>diamètre de l'arbre à hauteur de poitrine</strong>
    <div class="dbh-horizontal-legend">
      <span class="dbh-label">5 cm</span>
      <div class="dbh-gradient-bar"></div>
      <span class="dbh-label">100 cm</span>
    </div>
  `;
}

// fonctions ouverture / fermeture de la barre de navigation
const navbar = document.getElementById('navbar')
function openSidebar(){
    navbar.classList.add('show')
}

function closeSidebar(){
    navbar.classList.remove('show')
}

document.querySelectorAll('nav a').forEach(link => {
    if (link.href === window.location.href) {
        link.classList.add('active-link');
    }
});

document.addEventListener("DOMContentLoaded", () => {
  const logoLink = document.getElementById('logo-link');

  if (logoLink) {
    let flipped = false;

    setInterval(() => {
      flipped = !flipped;
      logoLink.classList.toggle('flipped', flipped);
    }, 20000); // même durée que l’animation CSS
  } else {
    console.warn("L'élément #logo-link est introuvable. Assurez-vous qu’il est bien dans le HTML.");
  }
});
