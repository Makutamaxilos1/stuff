<script>
  import { onMount, tick } from 'svelte';
  import { writable } from 'svelte/store';
  import { getLocationColor } from '$lib/utils/map/colorUtils';
  import { fetchLocations } from '$lib/utils/map/dataUtils';

  export const title = "Map";
  export const links = [];

  let mapContainer = null;
  let map = null;
  let locations = [];
  let error = null;
  let mapLayers = [];
  let selectedDate = -800;
  let showAllPoints = writable(false);
  let selectedBooks = writable([]);
  let selectedTags = writable([]);
  let tagColors = writable({});
  let bookColors = writable({});
  let tagShapes = writable({});
  let bookShapes = writable({});
  let tagEdgeStyles = writable({});
  let bookEdgeStyles = writable({});
  let tagThickness = writable({});
  let bookThickness = writable({});
  let openBookDropdown = writable(false);
  let openTagDropdown = writable(false);
  let openSettings = writable(null);
  let nameDisplay = writable('both');
  let geometryEdgeOpacity = writable(0.4);
  let labelTextSize = writable(0.8);
  let matchTitleColors = writable(true);
  let editingDate = writable(false);
  let dateInput = '';
  let menuOpen = writable(true);
  let screenWidth = writable(1024);
  let menuWidth = writable(240);
  let isResizing = false;
  let pointSize = writable(10);
  let openBookColorDropdown = writable({});
  let openTagColorDropdown = writable({});
  let lastTouchTime = 0;
  let allBooks = [];
  let allTags = [];
  const minMenuWidth = 200;

  const defaultColor = '#b89f00';
  const colorOptions = [
    '#ab0000',
    '#55ab00',
    '#00a5ab',
    '#000eab',
    '#ab0053',
    null
  ];

  const shapeOptions = [
    'circle',
    'square',
    'diamond',
    'triangle',
    'triangle-down',
    'dash-horizontal',
    'dash-vertical',
    'star',
    'plus',
    'x'
  ];

  const edgeStyleOptions = [
    'solid',
    'dashed',
    'dotted',
    'dash-dot'
  ];

  const thicknessOptions = [
    'thin',
    'medium',
    'thick'
  ];

  // Calculate contrasting text color based on background luminance
  function getContrastColor(hex) {
    const color = hex || '#FFFFFF';
    // Convert hex to RGB
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    // Calculate luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    // Return white for dark colors, black for light colors
    return luminance < 128 ? 'white' : 'black';
  }

  $: if ($menuOpen !== undefined) {
    console.log('menuOpen: Changed', { menuOpen: $menuOpen, timestamp: new Date().toISOString(), stack: new Error().stack });
  }

  onMount(() => {
    console.log('onMount: Initializing map component');
    $screenWidth = window.innerWidth;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/leaflet/leaflet.css';
    document.head.appendChild(link);

    const handleOutsideClick = (event) => {
      const path = event.composedPath ? event.composedPath().map(el => el.className) : [];
      const closestMatch = event.target.closest('.book-toggle, .tag-toggle, .settings-toggle, .settings-menu');
      console.log('handleOutsideClick: Called', {
        target: event.target,
        className: event.target.className,
        closestMatch: closestMatch ? closestMatch.className : null,
        path,
        menuOpen: $menuOpen,
        openBookColorDropdown: $openBookColorDropdown,
        openTagColorDropdown: $openTagColorDropdown
      });

      if ($openBookDropdown || $openTagDropdown || $openSettings || Object.keys($openBookColorDropdown).length || Object.keys($openTagColorDropdown).length) {
        const bookDropdown = document.querySelector('.book-dropdown');
        const tagDropdown = document.querySelector('.tag-dropdown');
        const settingsMenu = document.querySelector('.settings-menu');
        const colorDropdown = document.querySelector('.color-dropdown');

        if (
          !closestMatch &&
          (!bookDropdown || !bookDropdown.contains(event.target)) &&
          (!tagDropdown || !tagDropdown.contains(event.target)) &&
          (!settingsMenu || !settingsMenu.contains(event.target)) &&
          (!colorDropdown || !colorDropdown.contains(event.target))
        ) {
          console.log('handleOutsideClick: Closing dropdowns', {
            target: event.target,
            className: event.target.className,
            menuOpen: $menuOpen,
            openBookColorDropdown: $openBookColorDropdown,
            openTagColorDropdown: $openTagColorDropdown
          });
          $openBookDropdown = false;
          $openTagDropdown = false;
          $openSettings = null;
          $openBookColorDropdown = {};
          $openTagColorDropdown = {};
        } else {
          console.log('handleOutsideClick: Preserving menu state', {
            menuOpen: $menuOpen,
            openBookColorDropdown: $openBookColorDropdown,
            openTagColorDropdown: $openTagColorDropdown
          });
        }
      }
    };
    document.addEventListener('click', handleOutsideClick);

    const handleResize = () => {
      $screenWidth = window.innerWidth;
      if (map) map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e) => {
      if (isResizing) {
        requestAnimationFrame(() => {
          const x = e.clientX;
          const y = e.clientY;
          const newWidth = Math.min(
            Math.max(minMenuWidth, window.innerWidth - x - 5),
            window.innerWidth - 50
          );
          $menuWidth = newWidth;
          console.log(`Resize Debug (Mouse): Mouse Position (x: ${x}, y: ${y}), Edge Position: ${window.innerWidth - $menuWidth}, Menu Width: ${$menuWidth}`);
        });
      }
    };

    const handleTouchMove = (e) => {
      if (isResizing) {
        e.preventDefault();
        requestAnimationFrame(() => {
          const x = e.touches[0].clientX;
 agarose
          const y = e.touches[0].clientY;
          const newWidth = Math.min(
            Math.max(minMenuWidth, window.innerWidth - x - 5),
            window.innerWidth - 50
          );
          $menuWidth = newWidth;
          console.log(`Resize Debug (Touch): Touch Position (x: ${x}, y: ${y}), Edge Position: ${window.innerWidth - $menuWidth}, Menu Width: ${$menuWidth}`);
        });
      }
    };

    const handleMouseUp = () => {
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };

    const startResizing = (e) => {
      if ($menuOpen) {
        e.preventDefault();
        isResizing = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleMouseUp);
      }
    };

    document.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('resize-handle')) {
        startResizing(e);
      }
    });

    document.addEventListener('touchstart', (e) => {
      if (e.target.classList.contains('resize-handle')) {
        startResizing(e);
      }
    }, { passive: false });

    try {
      fetchLocations().then(({ locations: fetchedLocations, allBooks: fetchedBooks, allTags: fetchedTags, error: fetchError }) => {
        console.log('fetchLocations: Data fetched', { locationsCount: fetchedLocations.length, booksCount: fetchedBooks.length, tagsCount: fetchedTags.length });
        locations = fetchedLocations;
        allBooks = fetchedBooks;
        allTags = fetchedTags;
        error = fetchError;

        if (locations.length === 0 && !error) {
          error = 'No valid locations found';
        }

        tick().then(() => {
          if (mapContainer && locations.length > 0) {
            initializeMap();
          } else {
            error = error || 'Map container not initialized or no locations';
            console.error('Initialization failed:', error);
          }
        });
      }).catch(err => {
        error = `Failed to fetch locations: ${err.message}`;
        console.error('fetchLocations error:', err);
      });
    } catch (err) {
      error = `Initialization error: ${err.message}`;
      console.error('onMount error:', err);
    }

    return () => {
      if (map) {
        map.remove();
        map = null;
      }
      document.head.removeChild(link);
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  });

  function getLocationShapes(location) {
    const locationTags = location.tags || [];
    const locationBooks = location.books || [];
    const assignedShapes = [
      ...locationTags.filter(tag => $tagShapes[tag]).map(tag => $tagShapes[tag]),
      ...locationBooks.filter(book => $bookShapes[book]).map(book => $bookShapes[book])
    ];

    const uniqueShapes = [...new Set(assignedShapes)];
    return uniqueShapes.includes('circle') && uniqueShapes.length > 1
      ? uniqueShapes.filter(shape => shape !== 'circle')
      : uniqueShapes.length > 0
      ? uniqueShapes
      : ['circle'];
  }

  function getEdgeStyles(location) {
    const locationTags = location.tags || [];
    const locationBooks = location.books || [];
    const assignedEdgeStyles = [
      ...locationTags.filter(tag => $tagEdgeStyles[tag]).map(tag => $tagEdgeStyles[tag]),
      ...locationBooks.filter(book => $bookEdgeStyles[book]).map(book => $bookEdgeStyles[book])
    ];

    const uniqueEdgeStyles = [...new Set(assignedEdgeStyles)];
    return uniqueEdgeStyles.includes('solid') && uniqueEdgeStyles.length > 1
      ? uniqueEdgeStyles.filter(style => style !== 'solid')
      : uniqueEdgeStyles.length > 0
      ? uniqueEdgeStyles
      : ['solid'];
  }

  function getThickness(location) {
    const locationTags = location.tags || [];
    const locationBooks = location.books || [];
    const assignedThicknesses = [
      ...locationTags.filter(tag => $tagThickness[tag]).map(tag => $tagThickness[tag]),
      ...locationBooks.filter(book => $bookThickness[book]).map(book => $bookThickness[book])
    ];

    const thicknessPriority = { 'thin': 1, 'medium': 2, 'thick': 3 };
    const maxThickness = assignedThicknesses.reduce((max, curr) => {
      return (!max || thicknessPriority[curr] > thicknessPriority[max]) ? curr : max;
    }, 'thin');
    return maxThickness;
  }

  function getShapeSvg(shape, color) {
    const size = $pointSize;
    const halfSize = size / 2;
    const strokeWidth = 1;
    switch (shape) {
      case 'circle':
        return `<circle cx="${halfSize}" cy="${halfSize}" r="${halfSize - 1}" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
      case 'square':
        return `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
      case 'diamond':
        return `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" transform="rotate(45, ${halfSize}, ${halfSize})" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
      case 'triangle':
        return `<polygon points="${halfSize},1 ${size - 1},${size - 1} 1,${size - 1}" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
      case 'triangle-down':
        return `<polygon points="${halfSize},${size - 1} ${size - 1},1 1,1" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
      case 'dash-horizontal':
        return `<line x1="1" y1="${halfSize}" x2="${size - 1}" y2="${halfSize}" stroke="${color}" stroke-width="2" />`;
      case 'dash-vertical':
        return `<line x1="${halfSize}" y1="1" x2="${halfSize}" y2="${size - 1}" stroke="${color}" stroke-width="2" />`;
      case 'star':
        const starPoints = [
          halfSize, 1,
          halfSize + 1.5, halfSize - 1,
          size - 1, halfSize - 1,
          halfSize + 2, halfSize + 1.5,
          halfSize + 3, size - 1,
          halfSize, size - 2,
          halfSize - 3, size - 1,
          halfSize - 2, halfSize + 1.5,
          1, halfSize - 1,
          halfSize - 1.5, halfSize - 1
        ].join(',');
        return `<polygon points="${starPoints}" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
      case 'plus':
        return `<g><line x1="1" y1="${halfSize}" x2="${size - 1}" y2="${halfSize}" stroke="${color}" stroke-width="2" /><line x1="${halfSize}" y1="1" x2="${halfSize}" y2="${size - 1}" stroke="${color}" stroke-width="2" /></g>`;
      case 'x':
        return `<g><line x1="2" y1="2" x2="${size - 2}" y2="${size - 2}" stroke="${color}" stroke-width="2" /><line x1="2" y1="${size - 2}" x2="${size - 2}" y2="2" stroke="${color}" stroke-width="2" /></g>`;
      default:
        return `<circle cx="${halfSize}" cy="${halfSize}" r="${halfSize - 1}" stroke="${color}" stroke-width="${strokeWidth}" fill="${color}" />`;
    }
  }

  function getEdgeStyleSvg(edgeStyle, color) {
    switch (edgeStyle) {
      case 'solid':
        return `<line x1="0" y1="5" x2="20" y2="5" stroke="${color}" stroke-width="2" />`;
      case 'dashed':
        return `<line x1="0" y1="5" x2="20" y2="5" stroke="${color}" stroke-width="2" stroke-dasharray="4,4" />`;
      case 'dotted':
        return `<line x1="0" y1="5" x2="20" y2="5" stroke="${color}" stroke-width="2" stroke-dasharray="2,4" />`;
      case 'dash-dot':
        return `<line x1="0" y1="5" x2="20" y2="5" stroke="${color}" stroke-width="2" stroke-dasharray="4,4,2,4" />`;
      default:
        return `<line x1="0" y1="5" x2="20" y2="5" stroke="${color}" stroke-width="2" />`;
    }
  }

  function applyEdgeStyle(layer, edgeStyle) {
    switch (edgeStyle) {
      case 'dashed':
        layer.setStyle({ dashArray: '4,4' });
        break;
      case 'dotted':
        layer.setStyle({ dashArray: '2,4' });
        break;
      case 'dash-dot':
        layer.setStyle({ dashArray: '4,4,2,4' });
        break;
      case 'solid':
      default:
        layer.setStyle({ dashArray: '' });
        break;
    }
  }

  function applyThickness(layer, thickness) {
    const weight = thickness === 'thin' ? 1 : thickness === 'medium' ? 2 : 3;
    layer.setStyle({ weight });
  }

  function parseDateInput(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.toLowerCase().replace(/[\.\s]/g, '');
    const match = cleaned.match(/^(-?\d+)(bc|ad|bce|ce)?$/);
    if (!match) return null;
    let [, num, suffix] = match;
    let year = parseInt(num, 10);
    if (suffix === 'bc' || suffix === 'bce' || num.startsWith('-')) {
      year = -Math.abs(year);
    }
    if (year < -1500 || year > 500) return null;
    return year;
  }

  function handleDateInput() {
    const parsed = parseDateInput(dateInput);
    if (parsed !== null) {
      selectedDate = parsed;
    }
    $editingDate = false;
    dateInput = '';
  }

  function isVisibleAtDate(location) {
    if (!location) return false;
    if (location.type === 'point') {
      if ($showAllPoints) return true;
      return (
        location.start_time <= selectedDate &&
        (location.end_time === null || location.end_time >= selectedDate)
      );
    }
    return location.end_date === null || location.end_date >= selectedDate;
  }

  function updateLayers() {
    if (!map) return;
    const zoom = map.getZoom();
    mapLayers.forEach(({ layer, location, isLabel }) => {
      if (!isLabel) return;
      const isVisible = isVisibleAtDate(location) && (
        ($selectedBooks.length === 0 || $selectedBooks.some(book => location.books?.includes(book))) &&
        ($selectedTags.length === 0 || $selectedTags.some(tag => location.tags?.includes(tag))) &&
        (location.confidence_score >= 400 || zoom >= 10)
      );
      if (isVisible) {
        if (!map.hasLayer(layer)) {
          layer.addTo(map);
        }
      } else {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }
    });
  }

  function updateMap() {
    if (!map) return;

    console.log('updateMap: Updating map layers', { locationsCount: locations.length });
    mapLayers.forEach(({ layer }) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    mapLayers = [];

    const zoom = map.getZoom();
    locations.forEach(location => {
      if (!location) {
        console.warn('updateMap: Skipping null location');
        return;
      }

      if (!isVisibleAtDate(location)) {
        return;
      }

      if ($selectedBooks.length > 0 && !$selectedBooks.some(book => location.books?.includes(book))) {
        return;
      }

      if ($selectedTags.length > 0 && !$selectedTags.some(tag => location.tags?.includes(tag))) {
        return;
      }

      let latitude, longitude, current_points = null;

      if (location.type === 'geometry') {
        if (location.end_date && selectedDate > location.end_date) {
          return;
        }
        const validKeyframes = location.keyframes?.filter(kf => kf.date <= selectedDate) || [];
        const keyframe = validKeyframes.length > 0
          ? validKeyframes.reduce((prev, curr) => (curr.date > prev.date ? curr : prev))
          : location.keyframes?.[0];
        if (!keyframe) {
          console.warn('updateMap: No valid keyframe for geometry location', location);
          return;
        }
        current_points = keyframe.points.map(([lon, lat]) => [lat, lon]);
        const coords = keyframe.points;
        const lonSum = coords.reduce((sum, [lon]) => sum + lon, 0);
        const latSum = coords.reduce((sum, [, lat]) => sum + lat, 0);
        longitude = lonSum / coords.length;
        latitude = latSum / coords.length;
      } else {
        latitude = location.latitude;
        longitude = location.longitude;
      }

      if (isNaN(latitude) || isNaN(longitude)) {
        console.warn('updateMap: Invalid coordinates for location', location);
        return;
      }

      const { names, confidence_score, type } = location;

      const confidence = (confidence_score + 100) / 1100;
      const level = Math.min(Math.floor(confidence * 8), 7);
      const fontWeight = level >= 4 ? 'bold' : 'normal';
      const topOffset = type === 'geometry' ? 15 + level * 2.5 : 10 + level * 2.5;

      const color = getLocationColor(location, $tagColors, $bookColors, defaultColor);
      const shapes = type === 'point' ? getLocationShapes(location) : [];
      const edgeStyles = type === 'geometry' ? getEdgeStyles(location) : [];
      const thickness = type === 'geometry' ? getThickness(location) : 'thin';

      let labelText;
      if ($nameDisplay === 'english') labelText = names.english;
      else if ($nameDisplay === 'original') labelText = names.original;
      else labelText = `${names.english}, ${names.original}`;

      if (type === 'point') {
        const pointIcon = L.divIcon({
          className: 'point-marker',
          html: `<svg width="${$pointSize}" height="${$pointSize}" viewBox="0 0 ${$pointSize} ${$pointSize}">${shapes.map(shape => getShapeSvg(shape, color)).join('')}</svg>`,
          iconSize: [$pointSize, $pointSize],
          iconAnchor: [$pointSize / 2, $pointSize / 2]
        });
        const pointMarker = L.marker([latitude, longitude], {
          icon: pointIcon
        });
        mapLayers.push({ layer: pointMarker, location, isLabel: false, isPoint: true });
        pointMarker.addTo(map);
      } else if (type === 'geometry' && current_points) {
        const layer = location.region
          ? L.polygon(current_points, {
              color: color,
              fillColor: color,
              fillOpacity: 0.1,
              opacity: $geometryEdgeOpacity,
              weight: thickness === 'thin' ? 1 : thickness === 'medium' ? 2 : 3
            })
          : L.polyline(current_points, {
              color: color,
              opacity: $geometryEdgeOpacity,
              weight: thickness === 'thin' ? 1 : thickness === 'medium' ? 2 : 3
            });

        edgeStyles.forEach(edgeStyle => applyEdgeStyle(layer, edgeStyle));
        applyThickness(layer, thickness);

        mapLayers.push({ layer, location, isLabel: false, isPoint: false });
        layer.addTo(map);
      }

      const shouldShowLabel = confidence_score >= 400 || zoom >= 10;
      if (shouldShowLabel) {
        const labelIcon = L.divIcon({
          className: 'location-label',
          html: `<span style="
            font-family: 'Gentium Plus', serif;
            font-size: ${$labelTextSize}rem;
            font-weight: ${fontWeight};
            color: ${$matchTitleColors && color !== defaultColor ? color : 'var(--text-color)'};
            text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.8);
            white-space: nowrap;
            position: relative;
            top: -${topOffset}px;
          ">${labelText}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });

        const labelMarker = L.marker([latitude, longitude], {
          icon: labelIcon,
          interactive: true
        });

        const popupContent = `
          <div style="font-family: 'Gentium Plus', serif; color: var(--text-color); max-width: 200px;">
            <h3 style="margin: 0 0 5px; font-size: 1rem;">${names.english}, ${names.original}</h3>
            ${location.description ? `<p style="margin: 0 0 5px; font-size: 0.9rem;">${location.description}</p>` : ''}
            <p style="margin: 0; font-size: 0.9rem;">Books: ${location.books?.join(', ') || 'None'}</p>
            <p style="margin: 0; font-size: 0.9rem;">Tags: ${location.tags?.join(', ') || 'None'}</p>
            <p style="margin: 0; font-size: 0.9rem;">Time: ${location.type === 'point' ? `${location.start_time} to ${location.end_time || 'Present'}` : `Until ${location.end_date || 'Present'}`}</p>
          </div>
        `;
        labelMarker.bindPopup(popupContent);

        mapLayers.push({ layer: labelMarker, location, isLabel: true, isPoint: false });
        labelMarker.addTo(map);
      }
    });

    map.invalidateSize();
  }

  async function initializeMap() {
    if (!mapContainer) {
      error = 'Map container not found';
      console.error('initializeMap: No map container');
      return;
    }

    try {
      const L = await import('leaflet');

      map = L.map(mapContainer, {
        zoomControl: false,
        minZoom: 4,
        maxZoom: 18
      }).setView([31.7683, 35.2137], 8);

      try {
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap.org</a> contributors',
          maxZoom: 18
        }).addTo(map);
      } catch (e) {
        error = 'Map tiles unavailable offline; showing blank map';
        console.warn('initializeMap: Tile layer error', e);
      }

      updateMap();

      map.on('zoomend', updateLayers);
    } catch (e) {
      error = `Failed to initialize map: ${e.message}`;
      console.error('initializeMap: Error', e);
    }
  }

  $: if (map && selectedDate !== undefined) {
    updateMap();
  }

  $: if (map && $showAllPoints !== undefined) {
    updateMap();
  }

  $: if (map && $selectedBooks) {
    updateMap();
  }

  $: if (map && ($selectedTags || $tagColors || $bookColors || $tagShapes || $bookShapes || $tagEdgeStyles || $bookEdgeStyles || $tagThickness || $bookThickness)) {
    updateMap();
  }

  $: if (map && $nameDisplay) {
    updateMap();
  }

  $: if (map && $geometryEdgeOpacity) {
    updateMap();
  }

  $: if (map && $labelTextSize) {
    updateMap();
  }

  $: if (map && $matchTitleColors !== undefined) {
    updateMap();
  }

  $: if (map && $pointSize) {
    updateMap();
  }

  $: menuStyle = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${$menuOpen && $screenWidth < 500 ? 'calc(100vw - 10px)' : $menuOpen ? $menuWidth + 'px' : '90px'};
    height: 100vh;
    z-index: 1000;
    transition: width 0.3s ease;
    ${isResizing ? 'transition: none;' : ''}
    background: ${$menuOpen ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.0)'};
  `;

  $: headerStyle = `
    width: ${$menuOpen && $screenWidth < 500 ? 'calc(100% - 16px)' : $menuOpen ? ($menuWidth - 16) + 'px' : '90px'};
    padding: 4px 8px;
  `;

  $: contentStyle = `
    pointer-events: ${$menuOpen ? 'auto' : 'none'};
  `;

  function toggleBookDropdown() {
    console.log('toggleBookDropdown: Called', { openBookDropdown: $openBookDropdown });
    $openBookDropdown = !$openBookDropdown;
    if ($openTagDropdown) $openTagDropdown = false;
    $openSettings = null;
    $openBookColorDropdown = {};
    $openTagColorDropdown = {};
  }

  function toggleTagDropdown() {
    console.log('toggleTagDropdown: Called', { openTagDropdown: $openTagDropdown });
    $openTagDropdown = !$openTagDropdown;
    if ($openBookDropdown) $openBookDropdown = false;
    $openSettings = null;
    $openBookColorDropdown = {};
    $openTagColorDropdown = {};
  }

  function toggleSettings(item) {
    console.log('toggleSettings: Called', { item, openSettings: $openSettings });
    $openSettings = $openSettings === item ? null : item;
    $openBookColorDropdown = {};
    $openTagColorDropdown = {};
  }

  function toggleColorDropdown(item, isTag, e) {
    console.log('toggleColorDropdown: Before', {
      item,
      isTag,
      target: e.target,
      className: e.target.className,
      menuOpen: $menuOpen,
      openBookColorDropdown: $openBookColorDropdown,
      openTagColorDropdown: $openTagColorDropdown,
      itemType: typeof item
    });
    e.stopPropagation();
    if (typeof item !== 'string' || !item) {
      console.error('toggleColorDropdown: Invalid item', { item });
      return;
    }
    if (isTag) {
      const currentState = $openTagColorDropdown[item] || false;
      $openTagColorDropdown = { [item]: !currentState };
      $openBookColorDropdown = {};
    } else {
      const currentState = $openBookColorDropdown[item] || false;
      $openBookColorDropdown = { [item]: !currentState };
      $openTagColorDropdown = {};
    }
    console.log('toggleColorDropdown: After', {
      menuOpen: $menuOpen,
      openBookColorDropdown: $openBookColorDropdown,
      openTagColorDropdown: $openTagColorDropdown
    });
  }

  function assignColor(item, color, isTag, e) {
    console.log('assignColor: Called', { item, color, isTag, target: e.target, menuOpen: $menuOpen });
    e.stopPropagation();
    e.preventDefault();
    if (isTag) {
      $tagColors = { ...$tagColors, [item]: color };
      $openTagColorDropdown = {};
    } else {
      $bookColors = { ...$bookColors, [item]: color };
      $openBookColorDropdown = {};
    }
  }

  function assignShape(item, shape, isTag) {
    if (isTag) {
      $tagShapes = { ...$tagShapes, [item]: shape };
    } else {
      $bookShapes = { ...$bookShapes, [item]: shape };
    }
  }

  function assignEdgeStyle(item, edgeStyle, isTag) {
    if (isTag) {
      $tagEdgeStyles = { ...$tagEdgeStyles, [item]: edgeStyle };
    } else {
      $bookEdgeStyles = { ...$bookEdgeStyles, [item]: edgeStyle };
    }
  }

  function assignThickness(item, thickness, isTag) {
    if (isTag) {
      $tagThickness = { ...$tagThickness, [item]: thickness };
    } else {
      $bookThickness = { ...$bookThickness, [item]: thickness };
    }
  }

  function clearBooks() {
    $selectedBooks = [];
    $bookColors = {};
    $bookShapes = {};
    $bookEdgeStyles = {};
    $bookThickness = {};
  }

  function clearTags() {
    $selectedTags = [];
    $tagColors = {};
    $tagShapes = {};
    $tagEdgeStyles = {};
    $tagThickness = {};
  }

  function handleMenuToggle(e) {
    const path = e.composedPath ? e.composedPath().map(el => el.className) : [];
    console.log('handleMenuToggle: Triggered', {
      target: e.target,
      className: e.target.className,
      path,
      menuOpen: $menuOpen
    });
    if (
      e.target.matches('.color-toggle, .color-dropdown, .color-option') ||
      e.target.closest('.color-toggle, .color-dropdown, .color-option')
    ) {
      console.log('handleMenuToggle: Ignored for color-related click', { target: e.target });
      return;
    }
    e.preventDefault();
    const now = Date.now();
    if (now - lastTouchTime > 300) {
      $menuOpen = !$menuOpen;
      console.log('handleMenuToggle: Toggled menuOpen to', $menuOpen);
      lastTouchTime = now;
    }
  }
</script>

<style lang="scss">
  :root {
    --bg-color: #FFFFFF;
    --border-color: #D1D5DB;
    --text-color: #333;
    --accent-color: #55ab00;
    --shadow-color: rgba(0, 0, 0, 0.1);
    --hover-bg: #E5E7EB;
    --border-radius: 4px;
    --padding-sm: 8px;
    --padding-md: 12px;
    --transition: all 0.2s ease;
    --font-family: 'Gentium Plus', serif;
  }

  .options {
    font-family: var(--font-family);
    color: var(--text-color);
  }

  .options-header {
    background: var(--bg-color);
    border-radius: var(--border-radius);
    box-shadow: 0 2px 8px var(--shadow-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-color);
    cursor: pointer;
  }

  .options-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: var(--padding-md);
    overflow-y: auto;
    min-height: 99vh;
  }

  .options-content.hidden {
    display: none;
    width: 0;
  }

  .menu-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .button {
    background: #F5F5F5;
    border: 1px solid var(--border-color);
    padding: 6px var(--padding-md);
    border-radius: var(--border-radius);
    font-family: var(--font-family);
    transition: var(--transition);
    width: 100%;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg);
    }
  }

  .toggle-button {
    background: #F5F5F5;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    padding: 2px 4px;
    font-size: 1rem;
    transition: var(--transition);
    cursor: pointer;
    pointer-events: auto;

    &:hover {
      background: var(--hover-bg);
    }
  }

  .clear-button {
    background: #F5F5F5;
    border: 1px solid var(--border-color);
    padding: 4px 8px;
    font-family: var(--font-family);
    border-radius: var(--border-radius);
    transition: var(--transition);
    width: 100%;
    cursor: pointer;

    &:hover {
      background: var(--hover-bg);
    }
  }

  .color-toggle {
    width: 100%;
    padding: 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    text-align: left;
    font-family: var(--font-family);
    transition: var(--transition);
    cursor: pointer;

    &:hover {
      filter: brightness(90%);
    }
  }

  .color-option {
    width: 100%;
    height: 20px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    cursor: pointer;
    transition: var(--transition);
    margin: 2px 0;

    &:hover {
      filter: brightness(90%);
    }
  }

  .dropdown {
    background: var(--bg-color);
    padding: var(--padding-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    box-shadow: 0 2px 8px var(--shadow-color);
  }

  .book-dropdown,
  .tag-dropdown {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    z-index: 1001;
    @extend .dropdown;
  }

  .color-dropdown {
    position: absolute;
    top: 30px;
    left: 0;
    right: 0;
    z-index: 1002;
    @extend .dropdown;
    padding: 4px;
  }

  .settings-menu {
    position: absolute;
    top: 25px;
    left: 0;
    right: 0;
    z-index: 1002;
    @extend .dropdown;
    padding: var(--padding-md);
  }

  .custom-input {
    padding: 4px;
    width: 100px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-family: var(--font-family);
  }

  .range-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 8px;
    background: var(--border-color);
    border-radius: var(--border-radius);
    outline: none;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: var(--accent-color);
      border-radius: 50%;
      cursor: pointer;
      transition: var(--transition);

      &:hover {
        background: var(--hover-bg);
      }
    }

    &::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: var(--accent-color);
      border-radius: 50%;
      cursor: pointer;
      transition: var(--transition);

      &:hover {
        background: var(--hover-bg);
      }
    }
  }

  .custom-checkbox {
    appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-color);
    cursor: pointer;
    transition: var(--transition);

    &:hover {
      border-color: #9CA3AF;
    }

    &:checked {
      background: var(--accent-color);
      border-color: var(--accent-color);

      &::after {
        content: '';
        display: block;
        width: 10px;
        height: 10px;
        background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>') no-repeat center;
        background-size: contain;
        position: relative;
        top: 1px;
        left: 1px;
      }
    }
  }

  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    width: 5px;
    height: 100%;
    cursor: ew-resize;
    background: transparent;
    user-select: none;

    &:hover {
      background: rgba(0, 0, 0, 0.1);
    }
  }

  .settings-menu select {
    width: 100%;
    padding: 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-family: var(--font-family);
    background: #F5F5F5;
    transition: var(--transition);

    &:focus {
      outline: none;
      border-color: var(--accent-color);
    }
  }

  .settings-menu label {
    font-size: 0.9rem;
    margin-bottom: 4px;
    color: var(--text-color);
  }

  .settings-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;

    svg {
      width: 16px;
      height: 16px;
      stroke: var(--text-color);
      stroke-width: 2;
    }
  }
</style>

<div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; position: absolute; left: 0; top: 0; background: #333333; filter: invert(15%) contrast(120%)">
  {#if error}
    <div style="position: absolute; top: 10px; left: 10px; background: rgba(255, 0, 0, 0.8); color: white; padding: 10px; border-radius: 5px; z-index: 1000; font-family: var(--font-family);">
      {error}
    </div>
  {/if}
  <div class="options" style="{menuStyle}">
    <div class="options-header" on:pointerdown={handleMenuToggle} style="{headerStyle}">
      <p style="padding: 2px 8px;">Options</p>
      <button class="toggle-button">
        {$menuOpen ? '▶' : '◀'}
      </button>
    </div>
    <div class="options-content {$menuOpen ? '' : 'hidden'}" style="{contentStyle}">
      {#if $menuOpen}
        <div class="resize-handle"></div>
      {/if}
      <div class="menu-item">
        {#if $editingDate}
          <input
            type="text"
            bind:value={dateInput}
            on:blur={handleDateInput}
            on:keydown={(e) => e.key === 'Enter' && handleDateInput()}
            autofocus
            class="custom-input"
          />
        {:else}
          <span on:dblclick={() => { $editingDate = true; dateInput = ''; }} style="cursor: pointer;">
            Year: {selectedDate < 0 ? -selectedDate + ' BCE' : selectedDate + ' CE'}
          </span>
        {/if}
        <input id="date-slider" type="range" min="-1500" max="500" step="1" bind:value={selectedDate} class="range-slider" />
      </div>
      <div class="menu-item">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" bind:checked={$showAllPoints} class="custom-checkbox" />
          Points: Ignore Date
        </label>
      </div>
      <div class="menu-item">
        <label for="name-display" class="label">Display Names:</label>
        <select id="name-display" bind:value={$nameDisplay} class="label button">
          <option value="english">English Names</option>
          <option value="original">Original Names</option>
          <option value="both">Both Names</option>
        </select>
      </div>
      <div class="menu-item">
        <label for="geometry-edge-opacity" class="label">Edge Opacity:</label>
        <input id="geometry-edge-opacity" type="range" min="0" max="1" step="0.01" bind:value={$geometryEdgeOpacity} class="range-slider" />
      </div>
      <div class="menu-item">
        <label for="label-text-size" class="label">Text Size:</label>
        <input id="label-text-size" type="range" min="0.5" max="1.5" step="0.1" bind:value={$labelTextSize} class="range-slider" />
      </div>
      <div class="menu-item">
        <label for="point-size" class="label">Point Size:</label>
        <input id="point-size" type="range" min="5" max="20" step="1" bind:value={$pointSize} class="range-slider" />
      </div>
      <div class="menu-item">
        <label style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" bind:checked={$matchTitleColors} class="custom-checkbox" />
          Match Title Colors
        </label>
      </div>
      <div class="menu-item" style="position: relative;">
        <button class="button book-toggle" on:click={toggleBookDropdown}>
          Filter Books {$openBookDropdown ? '▲' : '▼'}
        </button>
        {#if $openBookDropdown}
          <div class="book-dropdown">
            <button class="clear-button" on:click={clearBooks}>
              Clear Books
            </button>
            {#each allBooks as book}
              <div style="display: flex; align-items: center; margin: 4px 0; gap: 8px; justify-content: space-between;">
                <label style="display: flex; align-items: center; gap: 8px; flex: 1;">
                  <input
                    type="checkbox"
                    checked={$selectedBooks.includes(book)}
                    on:change={(e) => {
                      if (e.target.checked) {
                        $selectedBooks = [...$selectedBooks, book];
                      } else {
                        $selectedBooks = $selectedBooks.filter(b => b !== book);
                      }
                    }}
                    class="custom-checkbox"
                  />
                  <span style="color: {$bookColors[book] || 'var(--text-color)'};">{book}</span>
                </label>
                <button class="settings-toggle" on:click={() => toggleSettings(`book-${book}`)}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 0 0 1 0-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 0 0 1 0-2.83 2 0 0 1 2.83 0l-.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 0 0 1 2 2v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l-.06.06a2 0 0 1 2.83 0 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
                {#if $openSettings === `book-${book}`}
                  <div class="settings-menu">
                    <div style="margin-bottom: 12px; position: relative;">
                      <label class="label">Color</label>
                      <button 
                        class="color-toggle" 
                        style="background-color: {$bookColors[book] || '#F5F5F5'}; color: {getContrastColor($bookColors[book] || '#F5F5F5')};"
                        on:click={(e) => toggleColorDropdown(book, false, e)}
                      >
                        {$bookColors[book] || 'None'}
                      </button>
                      {#if $openBookColorDropdown[book]}
                        <div class="color-dropdown">
                          {#each colorOptions as color}
                            <button
                              class="color-option"
                              style="background-color: {color || '#FFFFFF'};"
                              on:click={(e) => assignColor(book, color, false, e)}
                              on:click|stopPropagation
                              on:mousedown|stopPropagation
                            ></button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <div style="margin-bottom: 12px;">
                      <label class="label">Point Shape</label>
                      <select
                        value={$bookShapes[book] || 'circle'}
                        on:change={(e) => assignShape(book, e.target.value, false)}
                        class="subsetting"
                      >
                        {#each shapeOptions as shape}
                          <option value={shape}>{shape}</option>
                        {/each}
                      </select>
                    </div>
                    <div style="margin-bottom: 12px;">
                      <label class="label">Edge Style</label>
                      <select
                        value={$bookEdgeStyles[book] || 'solid'}
                        on:change={(e) => assignEdgeStyle(book, e.target.value, false)}
                        class="subsetting"
                      >
                        {#each edgeStyleOptions as edgeStyle}
                          <option value={edgeStyle}>{edgeStyle}</option>
                        {/each}
                      </select>
                    </div>
                    <div>
                      <label class="label">Thickness</label>
                      <select
                        value={$bookThickness[book] || 'thin'}
                        on:change={(e) => assignThickness(book, e.target.value, false)}
                        class="subsetting"
                      >
                        {#each thicknessOptions as thickness}
                          <option value={thickness}>{thickness}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="menu-item" style="position: relative;">
        <button class="button tag-toggle" on:click={toggleTagDropdown}>
          Filter Tags {$openTagDropdown ? '▲' : '▼'}
        </button>
        {#if $openTagDropdown}
          <div class="tag-dropdown">
            <button class="clear-button" on:click={clearTags}>
              Clear Tags
            </button>
            {#each allTags as tag}
              <div style="display: flex; align-items: center; margin: 4px 0; gap: 8px; justify-content: space-between;">
                <label style="display: flex; align-items: center; gap: 8px; flex: 1;">
                  <input
                    type="checkbox"
                    checked={$selectedTags.includes(tag)}
                    on:change={(e) => {
                      if (e.target.checked) {
                        $selectedTags = [...$selectedTags, tag];
                      } else {
                        $selectedTags = $selectedTags.filter(t => t !== tag);
                      }
                    }}
                    class="custom-checkbox"
                  />
                  <span style="color: {$tagColors[tag] || 'var(--text-color)'};">{tag}</span>
                </label>
                <button class="settings-toggle" on:click={() => toggleSettings(`tag-${tag}`)}>
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 0 0 1 0-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 0 0 1 0-2.83 2 0 0 1 2.83 0l-.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 0 0 1 2 2v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l-.06.06a2 0 0 1 2.83 0 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
                {#if $openSettings === `tag-${tag}`}
                  <div class="settings-menu">
                    <div style="margin-bottom: 12px; position: relative;">
                      <label class="label">Color</label>
                      <button 
                        class="color-toggle" 
                        style="background-color: {$tagColors[tag] || '#F5F5F5'}; color: {getContrastColor($tagColors[tag] || '#F5F5F5')};"
                        on:click={(e) => toggleColorDropdown(tag, true, e)}
                      >
                        {$tagColors[tag] || 'None'}
                      </button>
                      {#if $openTagColorDropdown[tag]}
                        <div class="color-dropdown button">
                          {#each colorOptions as color}
                            <button
                              class="color-option"
                              style="background-color: {color || '#FFFFFF'};"
                              on:click={(e) => assignColor(tag, color, true, e)}
                              on:click|stopPropagation
                              on:mousedown|stopPropagation
                            ></button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <div style="margin-bottom: 12px;">
                      <label class="label">Point Shape</label>
                      <select
                        value={$tagShapes[tag] || 'circle'}
                        on:change={(e) => assignShape(tag, e.target.value, true)}
                        class="button"
                      >
                        {#each shapeOptions as shape}
                          <option value={shape}>{shape}</option>
                        {/each}
                      </select>
                    </div>
                    <div style="margin-bottom: 12px;">
                      <label class="label">Edge Style</label>
                      <select
                        value={$tagEdgeStyles[tag] || 'solid'}
                        on:change={(e) => assignEdgeStyle(tag, e.target.value, true)}
                        class="button"
                      >
                        {#each edgeStyleOptions as edgeStyle}
                          <option value={edgeStyle}>{edgeStyle}</option>
                        {/each}
                      </select>
                    </div>
                    <div>
                      <label class="label">Thickness</label>
                      <select
                        value={$tagThickness[tag] || 'thin'}
                        on:change={(e) => assignThickness(tag, e.target.value, true)}
                        class="button"
                      >
                        {#each thicknessOptions as thickness}
                          <option value={thickness}>{thickness}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
  <div bind:this={mapContainer} style="flex: 1; width: 100%; height: 100%; z-index: 500;"></div>
</div>