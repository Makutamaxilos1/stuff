<script>
  import { onMount } from 'svelte';
  import { graph, titles, backlinks, tags } from '$lib/graph.js';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { derived, writable } from 'svelte/store';

  // Store for current path from URL
  const currentPath = derived(page, $page =>
    $page.url.pathname.replace(/^\/|\/$/g, '')
  );

  // Store for focused path
  const focusedPath = writable('');

  // Store for last clicked node (mouse down or drag start)
  const lastClickedNode = writable(null);

  // Store for currently hovered node
  const hoveredNode = writable(null);

  // Store for tag colors { tag: color }
  const tagColors = writable({});

  // Store for which tag's color picker is open
  const openColorPicker = writable(null);

  // Store for selected tag to group nodes
  const selectedTag = writable(null);

  // Sync focusedPath with currentPath
  currentPath.subscribe(path => {
    focusedPath.set(path);
  });

  // Derived store for outbound links
  const outbound = derived(focusedPath, path =>
    (graph[path] || []).sort((a, b) => a.weight - b.weight)
  );

  // Derived store for inbound links
  const inbound = derived(focusedPath, path =>
    (backlinks[path] || []).sort((a, b) => titles[a]?.localeCompare(titles[b]) ?? 0)
  );

  // Get all unique tags
  const allTags = [...new Set(Object.values(tags).flat())].sort();

  // Available colors (pale, pastel shades)
  const colorOptions = [
    '#FF9999', // Pale red
    '#99FF99', // Pale green
    '#9999FF', // Pale blue
    '#FFFF99', // Pale yellow
    '#FF99FF', // Pale magenta
    null       // No color
  ];

  // Function to check if a node has expandable links
  function hasExpandableLinks(path, parentPath) {
    const out = graph[path] || [];
    const inb = (backlinks[path] || []).filter(source => source !== parentPath);
    return out.length > 0 || inb.length > 0;
  }

  // Function to expand (focus) a node
  function expand(path) {
    focusedPath.set(path);
    goto(`/${path}`);
  }

  // Function to toggle color picker
  function toggleColorPicker(tag) {
    openColorPicker.set($openColorPicker === tag ? null : tag);
  }

  // Function to assign a color to a tag
  function assignColor(tag, color) {
    tagColors.update(colors => {
      if (color === null) {
        const { [tag]: _, ...rest } = colors; // Remove tag from colors
        return rest;
      }
      return {
        ...colors,
        [tag]: color
      };
    });
    openColorPicker.set(null); // Close picker
  }

  // Function to clear all tag colors
  function clearTagColors() {
    tagColors.set({});
    openColorPicker.set(null);
  }

  // HSV conversion utilities
  function hexToHsv(hex) {
    if (!hex) return { h: 0, s: 0, v: 0 };
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = max === 0 ? 0 : delta / max;
    const v = max;
    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, v };
  }

  function hsvToHex(h, s, v) {
    h = h % 360;
    if (h < 0) h += 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    r = Math.round((r + m) * 255).toString(16).padStart(2, '0');
    g = Math.round((g + m) * 255).toString(16).padStart(2, '0');
    b = Math.round((b + m) * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // Find the shorter hue angle between two hues
  function getIntermediateHue(h1, h2) {
    let diff = Math.abs(h2 - h1);
    if (diff > 180) diff = 360 - diff;
    const direction = diff === Math.abs(h2 - h1) ? 1 : -1;
    const intermediate = h1 + (direction * diff) / 2;
    return (intermediate + 360) % 360;
  }

  // Function to compute node color (includes lastClickedNode)
  function getNodeColor(node) {
    if (node.id === $lastClickedNode || node.id === $hoveredNode) return '#ffef14'; // Yellow for clicked or hovered
    return getNodeBaseColor(node);
  }

  // Function to compute node base color (excludes lastClickedNode)
  function getNodeBaseColor(node) {
    const nodeTags = tags[node.id] || [];
    const assignedColors = nodeTags
      .filter(tag => $tagColors[tag])
      .map(tag => $tagColors[tag]);
    
    if (assignedColors.length === 0) return '#FFFFFF'; // Default white

    // Convert to HSV
    const hsvColors = assignedColors.map(hex => hexToHsv(hex));
    console.log('HSV colors for node:', node.id, hsvColors);

    // Handle single color
    if (hsvColors.length === 1) {
      return assignedColors[0];
    }

    // Compute intermediate hue
    let h = hsvColors[0].h;
    for (let i = 1; i < hsvColors.length; i++) {
      h = getIntermediateHue(h, hsvColors[i].h);
    }

    // Average saturation and value
    const s = hsvColors.reduce((sum, c) => sum + c.s, 0) / hsvColors.length;
    const v = hsvColors.reduce((sum, c) => sum + c.v, 0) / hsvColors.length;

    const result = hsvToHex(h, s, v);
    console.log('Combined HSV for node:', node.id, { h, s, v, hex: result });
    return result;
  }

  let container;

  onMount(async () => {
    const ForceGraph = (await import('force-graph')).default;

    const graphData = generateGraphData();
    console.log('Generated Graph Data:', graphData);
    console.log('All Tags:', allTags);

    // Debounce function for resize
    function debounce(fn, wait) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), wait);
      };
    }

    const fg = ForceGraph()(container)
      .graphData(graphData)
      .nodeId('id')
      .nodeLabel('label')
      .linkSource('source')
      .linkTarget('target')
      .nodeVal(() => 4) // Larger hitbox radius for hover/click/drag
      .nodeColor(getNodeColor)
      .nodeCanvasObject((node, ctx, globalScale) => {
        // Validate node position
        if (isNaN(node.x) || isNaN(node.y)) {
          console.warn('Invalid node position:', node.id, { x: node.x, y: node.y });
          return;
        }
        // Draw a smaller circle for each node
        ctx.beginPath();
        ctx.arc(node.x, node.y, 0.8, 0, 2 * Math.PI, false); // Visual radius: 3
        ctx.fillStyle = getNodeColor(node);
        ctx.fill();

        // Draw label below the node with fixed size
        ctx.font = '3px Gentium'; // Fixed font size
        ctx.fillStyle = getNodeColor(node); // Match node color
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + 4); // Lower position
        console.log('Label drawn:', { id: node.id, label: node.label, font: ctx.font, color: ctx.fillStyle, x: node.x, y: node.y + 15 });
      })
      .nodeCanvasObjectMode(() => 'replace')
      .linkCanvasObject((link, ctx, globalScale) => {
        const sourceNode = link.source;
        const targetNode = link.target;
        const isHovered = $hoveredNode && ($hoveredNode === sourceNode.id || $hoveredNode === targetNode.id);

        // Validate positions
        if (isNaN(sourceNode.x) || isNaN(sourceNode.y) || isNaN(targetNode.x) || isNaN(targetNode.y)) {
          console.warn('Invalid link position:', { source: sourceNode.id, target: targetNode.id });
          return;
        }

        // Get colors
        const sourceColor = isHovered ? '#ffef14' : getNodeBaseColor(sourceNode);
        const targetColor = isHovered ? '#ffef14' : getNodeBaseColor(targetNode);

        // Compute midpoint
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;

        // Draw first half (source to midpoint)
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(midX, midY);
        ctx.strokeStyle = sourceColor;
        ctx.lineWidth = 0.2;
        ctx.stroke();

        // Draw second half (midpoint to target)
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.strokeStyle = targetColor;
        ctx.lineWidth = 0.2;
        ctx.stroke();

        console.log('Link drawn:', { source: sourceNode.id, target: targetNode.id, sourceColor, targetColor, isHovered, hoveredNode: $hoveredNode, sourceIdType: typeof sourceNode.id, targetIdType: typeof targetNode.id });
      })
      .linkCanvasObjectMode(() => 'replace')
      .linkDirectionalArrowLength(2.5) // Smaller arrows
      .linkDirectionalArrowRelPos(1) // Arrows at the end of links
      .linkDirectionalArrowColor(link => {
        const sourceNode = link.source;
        const targetNode = link.target;
        const isHovered = $hoveredNode && ($hoveredNode === sourceNode.id || $hoveredNode === targetNode.id);
        const color = isHovered ? '#ffef14' : getNodeBaseColor(targetNode);
        console.log('Arrow color:', { source: sourceNode.id, target: targetNode.id, color, isHovered, hoveredNode: $hoveredNode, sourceIdType: typeof sourceNode.id, targetIdType: typeof targetNode.id });
        return color;
      })
      .backgroundColor('#333333') // Charcoal grey background
      .onNodeClick(node => {
        lastClickedNode.set(node.id); // Set on click (mouse down)
        expand(node.id); // Navigate
        console.log('Node clicked:', node.id);
      })
      .onNodeHover(node => {
        const nodeId = node ? node.id : null;
        hoveredNode.set(nodeId);
        console.log('Node hovered:', { nodeId, hoveredNode: $hoveredNode, x: node?.x, y: node?.y, nodeIdType: typeof nodeId });
      })
      .onNodeDrag(node => {
        node.fx = node.x; // Pin during drag
        node.fy = node.y;
        lastClickedNode.set(node.id); // Set on drag start
        console.log('Dragging node:', node.id, 'Position:', { x: node.x, y: node.y });
      })
      .onNodeDragEnd(node => {
        // Unpin after drag to allow force simulation
        setTimeout(() => {
          node.fx = null;
          node.fy = null;
          console.log('Unpinned node:', node.id);
        }, 100); // Short delay to stabilize
      })
      .zoom(4);

    // Custom force to group nodes by tag (while mouse is held)
    fg.d3Force('tagGroup', () => {
      if (!$selectedTag) return;

      // Get nodes with the selected tag
      const taggedNodes = graphData.nodes.filter(node => (tags[node.id] || []).includes($selectedTag));
      if (taggedNodes.length < 2) {
        selectedTag.set(null); // No grouping needed
        return;
      }

      // Compute |centroid
      const centroid = taggedNodes.reduce(
        (acc, node) => ({
          x: acc.x + (node.x || 0),
          y: acc.y + (node.y || 0)
        }),
        { x: 0, y: 0 }
      );
      centroid.x /= taggedNodes.length;
      centroid.y /= taggedNodes.length;

      // Apply gentle force
      const strength = 0.1; // Adjusted for gentle attraction
      taggedNodes.forEach(node => {
        if (node.x && node.y) {
          node.vx = (node.vx || 0) + (centroid.x - node.x) * strength;
          node.vy = (node.vy || 0) + (centroid.y - node.y) * strength;
        }
      });

      console.log('Tag grouping:', { tag: $selectedTag, centroid, taggedNodes: taggedNodes.map(n => n.id) });
    });

    // Global mouseup listener to stop grouping
    const handleMouseUp = () => {
      if ($selectedTag) {
        selectedTag.set(null);
        console.log('Tag grouping stopped: Mouse released');
      }
    };
    window.addEventListener('mouseup', handleMouseUp);

    // Reheat simulation when selectedTag changes
    selectedTag.subscribe(() => {
      if ($selectedTag) {
        fg.d3ReheatSimulation();
        console.log('Tag grouping started:', $selectedTag);
      }
    });

    // Update node and link colors when lastClickedNode, hoveredNode, or tagColors changes
    lastClickedNode.subscribe(() => {
      fg.nodeColor(getNodeColor);
      fg.linkCanvasObject(fg.linkCanvasObject()); // Redraw links
    });

    hoveredNode.subscribe(() => {
      fg.nodeColor(getNodeColor);
      fg.linkCanvasObject(fg.linkCanvasObject()); // Redraw links
    });

    tagColors.subscribe(() => {
      fg.nodeColor(getNodeColor);
      fg.linkCanvasObject(fg.linkCanvasObject()); // Redraw links
    });

    // Resize the graph when the window size changes
    const resizeGraph = () => {
      const rect = container.getBoundingClientRect();
      console.log('Container size:', { width: rect.width, height: rect.height });
      fg.width(rect.width).height(rect.height);
    };

    // Debounced resize handler
    const debouncedResize = debounce(resizeGraph, 100);

    // Initial resize with delay to ensure container is rendered
    requestAnimationFrame(() => {
      resizeGraph();
    });
    window.addEventListener('resize', debouncedResize);

    // Cleanup on component destroy
    return () => {
      console.log('Unmounting Graph2D');
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('mouseup', handleMouseUp);
      fg._destructor(); // Explicitly destroy ForceGraph instance
    };
  });

  function generateGraphData() {
    // Collect all unique node IDs (source and target)
    const nodeIds = new Set();
    for (const [source, edges] of Object.entries(graph)) {
      nodeIds.add(source);
      for (const { target } of edges) {
        if (target !== undefined && target !== null) {
          nodeIds.add(target);
        }
      }
    }

    // Generate nodes
    const nodes = Array.from(nodeIds).map(id => ({
      id,
      label: titles[id] || id,
    }));

    // Generate valid links
    const links = [];
    for (const [source, edges] of Object.entries(graph)) {
      for (const { target } of edges) {
        if (nodeIds.has(source) && nodeIds.has(target)) {
          links.push({ source, target });
        } else {
          console.warn('Skipping invalid link:', { source, target });
        }
      }
    }

    return { nodes, links };
  }
</script>

<div style="display: flex; width: 100vw; height: 100vh; overflow: hidden; position: absolute; left: 0px; top: 0;">

  <!-- Graph Container -->
  <div bind:this={container} style="flex: 1; height: 100%; background: none; width: 100%; margin-left: 0px; position: relative; box-sizing: border-box;"></div>

  <!-- Tags Overlay -->
  <div class="tags-overlay" style="position: absolute; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.7); padding: 10px; border-radius: 0px; z-index: 1000;">
    <h3 style="color: white; margin: 0 0 10px 0; font-family: 'Gentium Plus' font-size: 1rem;">Tags</h3>
    {#if allTags.length > 0}
      {#each allTags as tag}
        <div style="display: flex; align-items: center; margin-bottom: 5px; position: relative;">
          <span
            style="color: white; margin-right: 10px; cursor: pointer;"
            on:mousedown={() => selectedTag.set(tag)}
            on:mouseup={() => selectedTag.set(null)}
          >
            {tag}
          </span>
          <button
            on:click={() => toggleColorPicker(tag)}
            style="width: 20px; height: 20px; background: {$tagColors[tag] || '#FFFFFF'}; border: 1px solid white; margin-right: 5px; position: relative;"
          >
            {#if !$tagColors[tag]}
              <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg); color: black; font-family: 'Gentium Plus'; font-size: 14px;">/</span>
            {/if}
          </button>
          {#if $openColorPicker === tag}
            <div style="position: absolute; top: 25px; right: 0; background: rgba(0, 0, 0, 0.9); padding: 5px; border-radius: 5px; z-index: 1001;">
              {#each colorOptions as color}
                <button
                  on:click={() => assignColor(tag, color)}
                  style="width: 20px; height: 20px; background: {color || '#FFFFFF'}; border: 1px solid white; margin: 2px; display: block; position: relative;"
                >
                  {#if !color}
                    <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg); color: black; font-family: 'Gentium Plus'; font-size: 14px;">/</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <button
        on:click={clearTagColors}
        style="background: none; border: 1px solid white; font-family: 'Gentium Plus'; color: white; padding: 2px 8px; margin: 2px; display: block;"
      >
        Clear Tags
      </button>
    {:else}
      <p style="color: white; margin: 0;">No tags found</p>
    {/if}
  </div>
</div>

<style>
  .tags-overlay button:hover, .tags-overlay span:hover {
    opacity: 0.8;
  }
</style>