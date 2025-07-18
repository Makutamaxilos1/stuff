<script>
  import { onMount, tick } from 'svelte';
  import { writable } from 'svelte/store';
  import { fetchLocations } from '$lib/utils/map/dataUtils';

  export const title = "Map Editor";
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
  let openBookDropdown = writable(false);
  let openTagDropdown = writable(false);
  let editingDate = writable(false);
  let dateInput = '';
  let allBooks = [];
  let allTags = [];
  let selectedLocation = writable(null);
  let locationData = writable({});
  let collapsedKeyframes = writable({}); // Store to track collapsed state of keyframes
  const defaultColor = '#b89f00';
  const selectedColor = '#00FF00';
  const menuWidth = 480;

  onMount(() => {
    console.log('onMount: Initializing map editor component');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/leaflet/leaflet.css';
    document.head.appendChild(link);

    const handleOutsideClick = (event) => {
      const closestMatch = event.target.closest('.book-toggle, .tag-toggle');
      if ($openBookDropdown || $openTagDropdown) {
        const bookDropdown = document.querySelector('.book-dropdown');
        const tagDropdown = document.querySelector('.tag-dropdown');
        if (
          !closestMatch &&
          (!bookDropdown || !bookDropdown.contains(event.target)) &&
          (!tagDropdown || !tagDropdown.contains(event.target))
        ) {
          $openBookDropdown = false;
          $openTagDropdown = false;
        }
      }
    };
    document.addEventListener('click', handleOutsideClick);

    const handleResize = () => {
      if (map) map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    try {
      fetchLocations().then(({ locations: fetchedLocations, allBooks: fetchedBooks, allTags: fetchedTags, error: fetchError }) => {
        console.log('fetchLocations: Data fetched', { 
          locationsCount: fetchedLocations.length, 
          booksCount: fetchedBooks.length, 
          tagsCount: fetchedTags.length,
          sources: fetchedLocations.map(loc => ({ id: loc.id, sources: loc.sources || [] })),
          sampleLonlat: fetchedLocations.map(loc => loc.lonlat)
        });
        locations = fetchedLocations;
        allBooks = fetchedBooks;
        allTags = fetchedTags;
        error = fetchError;

        console.log('fetchLocations: Loaded locations', JSON.stringify(locations, null, 2));

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
    };
  });

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

  function handleLocationClick(location) {
    console.log('handleLocationClick: Raw location', {
      id: location.id,
      sources: location.sources,
      books: location.books,
      tags: location.tags
    });
    $selectedLocation = location;
    $locationData = JSON.parse(JSON.stringify(location)); // Deep copy
    // Initialize collapsedKeyframes with true for each keyframe
    const newCollapsed = {};
    (location.keyframes || []).forEach((_, index) => {
      newCollapsed[index] = true;
    });
    $collapsedKeyframes = newCollapsed;
    console.log('handleLocationClick: $locationData after copy', {
      id: $locationData.id,
      sources: $locationData.sources,
      books: $locationData.books,
      tags: $locationData.tags
    });
    updateMap();
  }

  function updateLocationData(key, value, index = null, subKey = null, pointIndex = null) {
    $locationData = { ...$locationData };
    if (key === 'keyframes' && index !== null && pointIndex !== null && subKey !== null) {
      $locationData.keyframes = [...$locationData.keyframes];
      $locationData.keyframes[index] = { ...$locationData.keyframes[index] };
      $locationData.keyframes[index].points = [...$locationData.keyframes[index].points];
      $locationData.keyframes[index].points[pointIndex] = [...$locationData.keyframes[index].points[pointIndex]];
      $locationData.keyframes[index].points[pointIndex][subKey === 'x' ? 0 : 1] = Number(value);
    } else if (key === 'keyframes' && index !== null && subKey === 'date') {
      $locationData.keyframes = [...$locationData.keyframes];
      $locationData.keyframes[index] = { ...$locationData.keyframes[index], date: Number(value) };
    } else if (index !== null && subKey !== null) {
      $locationData[key] = [...($locationData[key] || [])];
      $locationData[key][index] = { ...$locationData[key][index], [subKey]: value };
    } else if (index !== null) {
      $locationData[key] = [...($locationData[key] || [])];
      if (key === 'keyframes') {
        $locationData[key][index] = value;
      } else {
        $locationData[key][index] = value;
      }
    } else if (key === 'names') {
      $locationData.names = { ...$locationData.names, ...value };
    } else if (key === 'lonlat') {
      if (typeof value === 'string') {
        const [lon, lat] = value.split(',').map(Number);
        if (!isNaN(lon) && !isNaN(lat)) {
          $locationData.lonlat = [lon, lat];
        } else {
          console.warn('updateLocationData: Invalid lonlat format', value);
          $locationData.lonlat = $locationData.lonlat || [0, 0];
        }
      } else if (Array.isArray(value) && value.length === 2 && !isNaN(value[0]) && !isNaN(value[1])) {
        $locationData.lonlat = value;
      } else {
        console.warn('updateLocationData: Invalid lonlat array', value);
        $locationData.lonlat = $locationData.lonlat || [0, 0];
      }
    } else {
      $locationData[key] = value;
    }
  }

  function addListItem(key, keyframeIndex = null, newPoint = null, insertIndex = null) {
    $locationData = { ...$locationData };
    if (key === 'sources') {
      $locationData[key] = [...($locationData[key] || []), { name: '', loc: '' }];
    } else if (key === 'books' || key === 'tags') {
      $locationData[key] = [...($locationData[key] || []), ''];
    } else if (key === 'keyframes') {
      const newKeyframes = [...($locationData[key] || []), { date: 0, points: [[0, 0]] }];
      $locationData[key] = newKeyframes.sort((a, b) => a.date - b.date);
      // Set new keyframe as collapsed
      const newIndex = $locationData.keyframes.length - 1;
      $collapsedKeyframes = { ...$collapsedKeyframes, [newIndex]: true };
    } else if (key === 'points' && keyframeIndex !== null) {
      $locationData.keyframes = [...$locationData.keyframes];
      $locationData.keyframes[keyframeIndex] = {
        ...$locationData.keyframes[keyframeIndex],
        points: insertIndex !== null && newPoint
          ? [
              ...$locationData.keyframes[keyframeIndex].points.slice(0, insertIndex),
              newPoint,
              ...$locationData.keyframes[keyframeIndex].points.slice(insertIndex)
            ]
          : [...$locationData.keyframes[keyframeIndex].points, [0, 0]]
      };
    }
  }

  function addKeyframeAtCurrentDate() {
    $locationData = { ...$locationData };
    // Find the most recent keyframe with date <= selectedDate
    const keyframes = ($locationData.keyframes || []).filter(kf => kf.date <= selectedDate);
    const sourceKeyframe = keyframes.length > 0
      ? keyframes.reduce((prev, curr) => (curr.date > prev.date ? curr : prev))
      : $locationData.keyframes?.[0];
    // Use points from sourceKeyframe, or default to [[0, 0]] if no keyframes exist
    const points = sourceKeyframe ? [...sourceKeyframe.points] : [[0, 0]];
    const newKeyframe = { date: selectedDate, points };
    $locationData.keyframes = [...($locationData.keyframes || []), newKeyframe].sort((a, b) => a.date - b.date);
    // Set new keyframe as collapsed
    const newIndex = $locationData.keyframes.findIndex(kf => kf.date === newKeyframe.date);
    $collapsedKeyframes = { ...$collapsedKeyframes, [newIndex]: true };
    // Persist to locations array to ensure updateMap sees the new keyframe
    const locIndex = locations.findIndex(loc => loc.id === $locationData.id);
    if (locIndex !== -1) {
      locations[locIndex] = {
        ...locations[locIndex],
        keyframes: [...$locationData.keyframes]
      };
      console.log('addKeyframeAtCurrentDate: Updated locations with new keyframe', {
        locationId: $locationData.id,
        keyframeDate: selectedDate,
        keyframePoints: points,
        keyframeIndex: newIndex
      });
    } else {
      console.warn('addKeyframeAtCurrentDate: Location not found in locations array', { id: $locationData.id });
    }
    // Force map update to render with new keyframe
    updateMap();
  }

  function removeListItem(key, index, keyframeIndex = null) {
    $locationData = { ...$locationData };
    if (key === 'points' && keyframeIndex !== null) {
      $locationData.keyframes = [...$locationData.keyframes];
      $locationData.keyframes[keyframeIndex] = {
        ...$locationData.keyframes[keyframeIndex],
        points: $locationData.keyframes[keyframeIndex].points.filter((_, i) => i !== index)
      };
      // Persist to locations
      const locIndex = locations.findIndex(loc => loc.id === $locationData.id);
      if (locIndex !== -1) {
        locations[locIndex] = {
          ...locations[locIndex],
          keyframes: [...$locationData.keyframes]
        };
      }
    } else {
      $locationData[key] = $locationData[key].filter((_, i) => i !== index);
      if (key === 'keyframes') {
        $locationData[key] = $locationData[key].sort((a, b) => a.date - b.date);
        // Remove collapsed state for deleted keyframe and reindex
        const newCollapsed = {};
        $locationData.keyframes.forEach((_, newIndex) => {
          if (newIndex < index) {
            newCollapsed[newIndex] = $collapsedKeyframes[newIndex];
          } else {
            newCollapsed[newIndex] = $collapsedKeyframes[newIndex + 1] ?? true;
          }
        });
        $collapsedKeyframes = newCollapsed;
      }
    }
  }

  function toggleKeyframeCollapse(index) {
    $collapsedKeyframes = {
      ...$collapsedKeyframes,
      [index]: !$collapsedKeyframes[index]
    };
  }

  function duplicateKeyframe(index) {
    $locationData = { ...$locationData };
    const keyframeToDuplicate = $locationData.keyframes[index];
    const newKeyframe = {
      ...keyframeToDuplicate,
      date: keyframeToDuplicate.date + 1, // Offset date by 1 to avoid exact duplicates
      points: [...keyframeToDuplicate.points] // Deep copy points
    };
    $locationData.keyframes = [...$locationData.keyframes, newKeyframe].sort((a, b) => a.date - b.date);
    // Set new keyframe as collapsed
    const newIndex = $locationData.keyframes.findIndex(kf => kf.date === newKeyframe.date);
    $collapsedKeyframes = { ...$collapsedKeyframes, [newIndex]: true };
  }

  function saveLocation() {
    if (!$selectedLocation || !$locationData) return;
    const index = locations.findIndex(loc => loc.id === $locationData.id);
    if (index !== -1) {
      const originalLocation = locations[index];
      const updatedLocation = { ...originalLocation };

      updatedLocation.id = originalLocation.id;
      updatedLocation.names = $locationData.names;
      updatedLocation.type = $locationData.type;
      updatedLocation.lonlat = $locationData.type === 'point' ? ($locationData.lonlat || originalLocation.lonlat) : undefined;
      updatedLocation.confidence_score = $locationData.confidence_score;
      updatedLocation.importance_score = $locationData.importance_score;
      updatedLocation.books = $locationData.books;
      updatedLocation.tags = $locationData.tags;
      updatedLocation.start_time = $locationData.start_time;
      updatedLocation.end_time = $locationData.end_time;
      updatedLocation.end_date = $locationData.end_date;
      updatedLocation.keyframes = $locationData.keyframes ? [...$locationData.keyframes].sort((a, b) => a.date - b.date) : undefined;
      updatedLocation.description = $locationData.description || originalLocation.description;
      updatedLocation.sources = Array.isArray($locationData.sources) ? $locationData.sources : (originalLocation.sources || []);
      updatedLocation.region = $locationData.type === 'geometry' ? ($locationData.region ?? originalLocation.region) : undefined;

      delete updatedLocation.latitude;
      delete updatedLocation.longitude;

      locations[index] = updatedLocation;
      const jsonString = JSON.stringify(locations, null, 2);
      navigator.clipboard.writeText(jsonString).then(() => {
        console.log('locations.json copied to clipboard', { 
          id: updatedLocation.id,
          sources: updatedLocation.sources, 
          region: updatedLocation.region,
          keyframes: updatedLocation.keyframes,
          lonlat: updatedLocation.lonlat
        });
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
      updateMap();
    }
  }

  function updateGeometryLayer(location, keyframe, color) {
    const current_points = keyframe.points.map(([lon, lat]) => [lat, lon]);
    const layer = location.region
      ? L.polygon(current_points, {
          color: color,
          fillColor: color,
          fillOpacity: 0.1,
          opacity: 0.4,
          weight: 1
        })
      : L.polyline(current_points, {
          color: color,
          opacity: 0.4,
          weight: 1
        });
    layer.on('click', () => handleLocationClick(location));
    return layer;
  }

  function findClosestSegment(points, clickLatLng, L, isRegion) {
    let minDistance = Infinity;
    let closestSegment = null;
    let insertIndex = 0;
    let closestPoint = null;

    const numPoints = points.length;
    const segments = isRegion ? numPoints : numPoints - 1; // Include closing segment for regions

    for (let i = 0; i < segments; i++) {
      const p1 = L.latLng(points[i % numPoints][1], points[i % numPoints][0]);
      const p2 = L.latLng(points[(i + 1) % numPoints][1], points[(i + 1) % numPoints][0]);
      const closest = L.GeometryUtil.closestOnSegment(map, clickLatLng, p1, p2);
      const distance = clickLatLng.distanceTo(closest);

      if (distance < minDistance) {
        minDistance = distance;
        closestSegment = [p1, p2];
        insertIndex = (i + 1) % numPoints; // Correct insert index for closing segment
        closestPoint = closest;
      }
    }

    return { closestPoint, insertIndex };
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
      try {
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
        const isSelected = $selectedLocation && $selectedLocation.id === location.id;
        const color = isSelected ? selectedColor : defaultColor;

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

          const layer = updateGeometryLayer(location, keyframe, color);
          layer.on('click', (e) => {
            if (!isSelected) {
              handleLocationClick(location);
              return;
            }
            console.log('geometryLayer: Click', { id: location.id, latlng: e.latlng });
            try {
              const { closestPoint, insertIndex } = findClosestSegment(keyframe.points, e.latlng, L, location.region);
              if (closestPoint) {
                const newPoint = [closestPoint.lng, closestPoint.lat];
                const currentKeyframeIndex = $locationData.keyframes?.findIndex(kf => kf.date === keyframe.date) ?? -1;
                if (currentKeyframeIndex !== -1) {
                  addListItem('points', currentKeyframeIndex, newPoint, insertIndex);
                  // Persist to locations
                  const locIndex = locations.findIndex(loc => loc.id === $locationData.id);
                  if (locIndex !== -1) {
                    locations[locIndex] = {
                      ...locations[locIndex],
                      keyframes: [...$locationData.keyframes]
                    };
                  }
                  updateMap();
                }
              }
            } catch (err) {
              console.error('geometryLayer: Error adding point', { id: location.id, error: err.message });
            }
          });
          mapLayers.push({ layer, location, isLabel: false, isPoint: false });
          layer.addTo(map);

          if (isSelected && keyframe.points) {
            const currentKeyframeIndex = $locationData.keyframes?.findIndex(kf => 
              kf.date === keyframe.date
            ) ?? -1;
            console.log('updateMap: Setting up markers for keyframe', { 
              locationId: location.id, 
              keyframeDate: keyframe.date, 
              currentKeyframeIndex, 
              selectedDate 
            });
            keyframe.points.forEach(([lon, lat], pointIndex) => {
              try {
                console.log('updateMap: Creating marker for geometry point', { id: location.id, pointIndex, isSelected, draggable: isSelected });
                const markerIcon = L.divIcon({
                  className: 'geometry-point-marker',
                  html: `<svg width="12" height="12" viewBox="0 0 12 12">
                    <circle cx="6" cy="6" r="5" stroke="${color}" stroke-width="1" fill="${color}" fill-opacity="0.5" />
                  </svg>`,
                  iconSize: [12, 12],
                  iconAnchor: [6, 6]
                });
                const marker = L.marker([lat, lon], {
                  icon: markerIcon,
                  draggable: isSelected,
                  zIndexOffset: 1000
                });
                marker.on('mousedown', (e) => {
                  console.log('marker: Mousedown', { id: location.id, pointIndex });
                  map.dragging.disable();
                  e.originalEvent.stopPropagation();
                });
                marker.on('click', (e) => {
                  console.log('marker: Click', { id: location.id, pointIndex });
                  handleLocationClick(location);
                  e.originalEvent.stopPropagation();
                });
                marker.on('contextmenu', (e) => {
                  console.log('marker: Right-click', { id: location.id, pointIndex });
                  if (currentKeyframeIndex !== -1) {
                    removeListItem('points', pointIndex, currentKeyframeIndex);
                    updateMap();
                  }
                });
                marker.on('dragstart', () => {
                  console.log('marker: Drag started', { id: location.id, pointIndex });
                });
                marker.on('drag', (e) => {
                  console.log('marker: Dragging', { 
                    id: location.id, 
                    pointIndex, 
                    latlng: e.target.getLatLng(), 
                    keyframeIndex: currentKeyframeIndex, 
                    keyframeDate: $locationData.keyframes?.[currentKeyframeIndex]?.date,
                    expectedDate: selectedDate
                  });
                  const { lat, lng } = e.target.getLatLng();
                  if (currentKeyframeIndex !== -1) {
                    $locationData = { ...$locationData };
                    $locationData.keyframes = [...$locationData.keyframes];
                    $locationData.keyframes[currentKeyframeIndex] = {
                      ...$locationData.keyframes[currentKeyframeIndex],
                      points: [...$locationData.keyframes[currentKeyframeIndex].points]
                    };
                    $locationData.keyframes[currentKeyframeIndex].points[pointIndex] = [lng, lat];
                    // Update only the geometry layer
                    const geometryLayerIndex = mapLayers.findIndex(l => l.location.id === location.id && !l.isLabel && !l.isPoint);
                    if (geometryLayerIndex !== -1) {
                      map.removeLayer(mapLayers[geometryLayerIndex].layer);
                      mapLayers[geometryLayerIndex].layer = updateGeometryLayer(location, {
                        date: keyframe.date,
                        points: $locationData.keyframes[currentKeyframeIndex].points
                      }, color);
                      mapLayers[geometryLayerIndex].layer.addTo(map);
                    }
                  } else {
                    console.warn('marker: Invalid keyframe index during drag', { id: location.id, currentKeyframeIndex });
                  }
                });
                marker.on('dragend', (e) => {
                  console.log('marker: Drag ended', { 
                    id: location.id, 
                    pointIndex, 
                    latlng: e.target.getLatLng(), 
                    keyframeIndex: currentKeyframeIndex, 
                    keyframeDate: $locationData.keyframes?.[currentKeyframeIndex]?.date,
                    expectedDate: selectedDate
                  });
                  const { lat, lng } = e.target.getLatLng();
                  if (currentKeyframeIndex !== -1) {
                    $locationData = { ...$locationData };
                    $locationData.keyframes = [...$locationData.keyframes];
                    $locationData.keyframes[currentKeyframeIndex] = {
                      ...$locationData.keyframes[currentKeyframeIndex],
                      points: [...$locationData.keyframes[currentKeyframeIndex].points]
                    };
                    $locationData.keyframes[currentKeyframeIndex].points[pointIndex] = [lng, lat];
                    // Persist to locations
                    const locIndex = locations.findIndex(loc => loc.id === $locationData.id);
                    if (locIndex !== -1) {
                      locations[locIndex] = {
                        ...locations[locIndex],
                        keyframes: [...$locationData.keyframes]
                      };
                    } else {
                      console.warn('marker: Location not found in locations array during dragend', { id: $locationData.id });
                    }
                    updateMap();
                  } else {
                    console.warn('marker: Invalid keyframe index during dragend', { id: location.id, currentKeyframeIndex });
                  }
                  map.dragging.enable();
                });
                mapLayers.push({ layer: marker, location, isLabel: false, isPoint: true });
                marker.addTo(map);
                console.log('updateMap: Added marker to map', { id: location.id, pointIndex });
              } catch (err) {
                console.error('updateMap: Error creating marker', { id: location.id, pointIndex, error: err.message });
              }
            });
          }
        } else if (location.type === 'point') {
          if (isSelected && $locationData.lonlat && Array.isArray($locationData.lonlat) && $locationData.lonlat.length === 2) {
            longitude = $locationData.lonlat[0];
            latitude = $locationData.lonlat[1];
          } else if (location.lonlat && Array.isArray(location.lonlat) && location.lonlat.length === 2 && !isNaN(location.lonlat[0]) && !isNaN(location.lonlat[1])) {
            longitude = location.lonlat[0];
            latitude = location.lonlat[1];
          } else if (location.longitude && location.latitude && !isNaN(location.longitude) && !isNaN(location.latitude)) {
            longitude = location.longitude;
            latitude = location.latitude;
            location.lonlat = [longitude, latitude];
            console.log('updateMap: Constructed lonlat from latitude/longitude', { id: location.id, lonlat: location.lonlat });
          } else {
            console.warn('updateMap: Missing or invalid lonlat for point location', { id: location.id, lonlat: location.lonlat, latitude: location.latitude, longitude: location.longitude });
            return;
          }

          if (isNaN(latitude) || isNaN(longitude)) {
            console.warn('updateMap: Invalid coordinates for point location', { id: location.id, latitude, longitude });
            return;
          }

          const pointIcon = L.divIcon({
            className: 'point-marker',
            html: `<svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4" stroke="${color}" stroke-width="1" fill="${color}" />
            </svg>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
          const pointMarker = L.marker([latitude, longitude], {
            icon: pointIcon,
            draggable: isSelected
          });
          pointMarker.on('mousedown', (e) => {
            console.log('pointMarker: Mousedown', { id: location.id });
            map.dragging.disable();
            e.originalEvent.stopPropagation();
          });
          pointMarker.on('click', (e) => {
            console.log('pointMarker: Click', { id: location.id });
            handleLocationClick(location);
            e.originalEvent.stopPropagation();
          });
          pointMarker.on('drag', (e) => {
            const { lat, lng } = e.target.getLatLng();
            updateLocationData('lonlat', [lng, lat].join(','));
            // Persist to locations
            const locIndex = locations.findIndex(loc => loc.id === $locationData.id);
            if (locIndex !== -1) {
              locations[locIndex] = {
                ...locations[locIndex],
                lonlat: [lng, lat]
              };
            }
          });
          pointMarker.on('dragend', (e) => {
            const { lat, lng } = e.target.getLatLng();
            updateLocationData('lonlat', [lng, lat].join(','));
            map.dragging.enable();
            updateMap();
          });
          mapLayers.push({ layer: pointMarker, location, isLabel: false, isPoint: true });
          pointMarker.addTo(map);
          console.log('updateMap: Added pointMarker', { id: location.id, latitude, longitude });
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

        const labelTextSize = 0.8;
        let labelText = `${names.english}, ${names.original}`;

        const shouldShowLabel = confidence_score >= 400 || zoom >= 10;
        if (shouldShowLabel) {
          const labelIcon = L.divIcon({
            className: 'location-label',
            html: `<span style="
              font-family: 'Gentium Plus', serif;
              font-size: ${labelTextSize}rem;
              font-weight: ${fontWeight};
              color: var(--text-color);
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
              <p style="margin: 0; font-size: 0.9rem;">Sources: ${location.sources?.length > 0 ? location.sources.map(src => `<a href="${src.loc}" target="_blank">${src.name}</a>`).join(', ') : 'None'}</p>
            </div>
          `;
          labelMarker.bindPopup(popupContent);
          labelMarker.on('click', () => handleLocationClick(location));

          mapLayers.push({ layer: labelMarker, location, isLabel: true, isPoint: false });
          labelMarker.addTo(map);
          console.log('updateMap: Added labelMarker', { id: location.id, name: names.english });
        }
      } catch (err) {
        console.error('updateMap: Error processing location', { id: location?.id, error: err.message });
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
      await import('leaflet-geometryutil');

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

  $: if (map && $selectedTags) {
    updateMap();
  }

  $: if (map && $selectedLocation) {
    updateMap();
  }

  $: if ($locationData) {
    console.log('Reactivity: locationData updated', { id: $locationData.id, sources: $locationData.sources, books: $locationData.books, tags: $locationData.tags });
  }

  $: menuStyle = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${menuWidth}px;
    height: 100vh;
    z-index: 1000;
    background: rgba(255, 255, 255, 0.7);
    overflow-y: auto;
  `;

  $: headerStyle = `
    width: ${menuWidth - 16}px;
    padding: 4px 8px;
  `;

  $: contentStyle = `
    pointer-events: auto;
  `;
  
  function toggleBookDropdown() {
    $openBookDropdown = !$openBookDropdown;
    if ($openTagDropdown) $openTagDropdown = false;
  }

  function toggleTagDropdown() {
    $openTagDropdown = !$openTagDropdown;
    if ($openBookDropdown) $openBookDropdown = false;
  }

  function clearBooks() {
    $selectedBooks = [];
  }

  function clearTags() {
    $selectedTags = [];
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
    justify-content: flex-start;
    align-items: center;
    color: var(--text-color);
  }

  .options-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: var(--padding-md);
    overflow-y: auto;
    max-height: calc(100vh - 40px);
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

  .custom-input,
  .custom-select {
    padding: 4px;
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-family: var(--font-family);
  }

  .custom-display {
    padding: 4px;
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-family: var(--font-family);
    background: #f5f5f5;
    color: var(--text-color);
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

  .editor-section {
    border-top: 1px solid var(--border-color);
    padding-top: var(--padding-md);
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .editor-field {
    margin-bottom: 8px;
  }

  .editor-label {
    font-size: 0.9rem;
    margin-bottom: 4px;
    color: var(--text-color);
  }

  .list-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
    padding-left: 12px;
    border-left: 2px solid var(--border-color);
  }

  .source-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .keyframe-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
  }

  .keyframe-header {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .keyframe-date {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .collapse-button {
    background: #F5F5F5;
    border: 1px solid var(--border-color);
    padding: 2px 8px;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-family: var(--font-family);
    transition: var(--transition);

    &:hover {
      background: var(--hover-bg);
    }
  }

  .plus-button {
    background: var(--accent-color);
    color: white;
    border: none;
    padding: 2px 8px;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-family: var(--font-family);
    font-size: 1rem;
    line-height: 1;
    transition: var(--transition);
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: #4A9A00;
    }
  }

  .points-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .point-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    background: #f5f5f5;
  }

  .point-input {
    width: 60px;
    padding: 2px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius);
    font-family: var(--font-family);
  }

  .remove-button {
    background: #FF4D4D;
    color: white;
    border: none;
    padding: 2px 8px;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-family: var(--font-family);
    transition: var(--transition);

    &:hover {
      background: #E53E3E;
    }
  }

  .add-button {
    background: var(--accent-color);
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-family: var(--font-family);
    transition: var(--transition);

    &:hover {
      background: #4A9A00;
    }
  }

  .save-button {
    background: #007BFF;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-family: var(--font-family);
    transition: var(--transition);

    &:hover {
      background: #0056B3;
    }
  }

  .geometry-point-marker svg {
    display: block;
  }
</style>

<div style="display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; position: absolute; left: 0; top: 0; background: #333333; filter: invert(15%) contrast(120%)">
  {#if error}
    <div style="position: absolute; top: 10px; left: 10px; background: rgba(255, 0, 0, 0.8); color: white; padding: 10px; border-radius: 5px; z-index: 1000; font-family: var(--font-family);">
      {error}
    </div>
  {/if}
  <div class="options" style="{menuStyle}">
    <div class="options-header" style="{headerStyle}">
      <p style="padding: 2px 8px;">Options</p>
    </div>
    <div class="options-content" style="{contentStyle}">
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
              <div style="display: flex; align-items: center; margin: 4px 0; gap: 8px;">
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
                  <span>{book}</span>
                </label>
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
              <div style="display: flex; align-items: center; margin: 4px 0; gap: 8px;">
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
                  <span>{_TAG_}</span>
                </label>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="menu-item editor-section">
        <div class="editor-header">
          <h3 style="margin: 0; font-size: 1rem;">Editor</h3>
          {#if $selectedLocation}
            <button class="save-button" on:click={saveLocation}>Save</button>
          {/if}
        </div>
        {#if $selectedLocation}
          {console.log('Editor: Rendering locationData', { id: $locationData.id, keys: Object.keys($locationData), sources: $locationData.sources })}
          {#each Object.entries($locationData) as [key, value]}
            {#if key === 'id'}
              <!-- Skip rendering id in editor -->
            {:else if key === 'names'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                <div style="padding-left: 12px;">
                  <div class="editor-field">
                    <div class="editor-label">english</div>
                    <input
                      type="text"
                      value={value.english}
                      on:input={(e) => updateLocationData('names', { english: e.target.value })}
                      class="custom-input"
                    />
                  </div>
                  <div class="editor-field">
                    <div class="editor-label">original</div>
                    <input
                      type="text"
                      value={value.original}
                      on:input={(e) => updateLocationData('names', { original: e.target.value })}
                      class="custom-input"
                    />
                  </div>
                </div>
              </div>
            {:else if key === 'type'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                <span class="custom-display">{value}</span>
              </div>
            {:else if key === 'lonlat'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                <input
                  type="text"
                  value={$locationData.lonlat?.join(',') || ''}
                  on:input={(e) => updateLocationData(key, e.target.value)}
                  class="custom-input"
                />
              </div>
            {:else if key === 'region' && $locationData.type === 'geometry'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                <label style="display: flex; align-items: center; gap: 8px;">
                  <input
                    type="checkbox"
                    checked={value}
                    on:change={(e) => updateLocationData(key, e.target.checked)}
                    class="custom-checkbox"
                  />
                  Region
                </label>
              </div>
            {:else if key === 'sources'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                {#if value.length === 0}
                  <p style="font-size: 0.9rem; color: var(--text-color);">No sources</p>
                {:else}
                  {#each value as source, index}
                    <div class="list-item source-item">
                      <div class="editor-field">
                        <div class="editor-label">Name</div>
                        <input
                          type="text"
                          value={source.name}
                          on:input={(e) => updateLocationData('sources', e.target.value, index, 'name')}
                          class="custom-input"
                        />
                      </div>
                      <div class="editor-field">
                        <div class="editor-label">URL</div>
                        <input
                          type="text"
                          value={source.loc}
                          on:input={(e) => updateLocationData('sources', e.target.value, index, 'loc')}
                          class="custom-input"
                        />
                      </div>
                      <button class="remove-button" on:click={() => removeListItem('sources', index)}>Remove Source</button>
                    </div>
                  {/each}
                {/if}
                <button class="add-button" on:click={() => addListItem('sources')}>Add Source</button>
              </div>
            {:else if Array.isArray(value) && key !== 'keyframes'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                {console.log('Editor: Rendering array field', { key, value })}
                {#if value.length === 0}
                  <p style="font-size: 0.9rem; color: var(--text-color);">No {key} items</p>
                {:else}
                  {#each value as item, index}
                    {console.log('Editor: Rendering item', { key, index, item })}
                    <div class="list-item">
                      <input
                        type="text"
                        value={item}
                        on:input={(e) => updateLocationData(key, e.target.value, index)}
                        class="custom-input"
                      />
                      <button class="remove-button" on:click={() => removeListItem(key, index)}>Remove</button>
                    </div>
                  {/each}
                {/if}
                <button class="add-button" on:click={() => addListItem(key)}>Add {key} Item</button>
              </div>
            {:else if key === 'keyframes'}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                {#if value.length === 0}
                  <p style="font-size: 0.9rem; color: var(--text-color);">No keyframes</p>
                {:else}
                  {#each value.sort((a, b) => a.date - b.date) as keyframe, index}
                    <div class="keyframe-item">
                      <div class="keyframe-header">
                        <div class="keyframe-date">
                          <button class="collapse-button" on:click={() => toggleKeyframeCollapse(index)}>
                            {$collapsedKeyframes[index] ? '▼' : '▲'}
                          </button>
                          <div class="editor-label">Date:</div>
                          <input
                            type="number"
                            value={keyframe.date}
                            on:input={(e) => updateLocationData('keyframes', e.target.value, index, 'date')}
                            class="custom-input"
                            style="width: 100px;"
                          />
                        </div>
                        <button class="plus-button" on:click={() => duplicateKeyframe(index)}>+</button>
                      </div>
                      {#if !$collapsedKeyframes[index]}
                        <div class="editor-field">
                          <div class="editor-label">Points</div>
                          {#if keyframe.points.length === 0}
                            <p style="font-size: 0.9rem; color: var(--text-color);">No points</p>
                          {:else}
                            <div class="points-container">
                              {#each keyframe.points as point, pointIndex}
                                <div class="point-item">
                                  <span>x:</span>
                                  <input
                                    type="number"
                                    value={point[0]}
                                    on:input={(e) => updateLocationData('keyframes', e.target.value, index, 'x', pointIndex)}
                                    class="point-input"
                                    step="0.1"
                                  />
                                  <span>y:</span>
                                  <input
                                    type="number"
                                    value={point[1]}
                                    on:input={(e) => updateLocationData('keyframes', e.target.value, index, 'y', pointIndex)}
                                    class="point-input"
                                    step="0.1"
                                  />
                                  <button class="remove-button" on:click={() => removeListItem('points', pointIndex, index)}>Remove</button>
                                </div>
                              {/each}
                            </div>
                          {/if}
                          <button class="add-button" on:click={() => addListItem('points', index)}>Add Point</button>
                        </div>
                        <button class="remove-button" on:click={() => removeListItem('keyframes', index)}>Remove Keyframe</button>
                      {/if}
                    </div>
                  {/each}
                {/if}
                <div style="display: flex; gap: 8px;">
                  <button class="add-button" on:click={() => addListItem('keyframes')}>Add Keyframe</button>
                  <button class="add-button" on:click={addKeyframeAtCurrentDate}>
                    Add Keyframe at {selectedDate < 0 ? -selectedDate + ' BCE' : selectedDate + ' CE'}
                  </button>
                </div>
              </div>
            {:else}
              <div class="editor-field">
                <div class="editor-label">{key}</div>
                <input
                  type={typeof value === 'number' ? 'number' : 'text'}
                  value={value ?? ''}
                  on:input={(e) => updateLocationData(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)}
                  class="custom-input"
                />
              </div>
            {/if}
          {/each}
        {:else}
          <p style="font-size: 0.9rem; color: var(--text-color);">Select a location to edit</p>
        {/if}
      </div>
    </div>
  </div>
  <div bind:this={mapContainer} style="flex: 1; width: 100%; height: 100%; z-index: 500;"></div>
</div>