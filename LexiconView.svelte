<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

    // 1. Define the Interlinear Data Structure
    type InterlinearWord = {
        id: string;
        english: string;
        hebrew: string;
        strongs: string;
    };

    // --- State ---
    // --- State ---
    let hoveredState: { id: string, part: 'english' | 'hebrew' | 'strongs' } | null = $state(null);
    let highlightedIds: Set<string> = $state(new Set());
    
    // Layout tracking for hit detection (Now includes the specific 'part')
    type HitZone = { id: string, part: 'english' | 'hebrew' | 'strongs', x: number, y: number, w: number, h: number };
    let hitTestMap: HitZone[] = [];
    
    // Layout tracking for hit detection
    let {
        words = [
            { id: "1", english: "In the beginning", hebrew:  "בְּבְּרֵאשִׁ֖יתרֵאשִׁ֖ית", strongs: "H7225" },
            { id: "2", english: "created", hebrew: "בָּרָ֣א", strongs: "H1254" },
            { id: "3", english: "God", hebrew: "אֱלֹהִ֑ים אֱלֹהִ֑ים", strongs: "H430" },
            { id: "4", english: "the", hebrew: "אֵ֥ת", strongs: "H853" },
            { id: "5", english: "heavens", hebrew: "הַשָּׁמַ֖יִם", strongs: "H8064" },
            { id: "6", english: "and", hebrew: "וְאֵ֥ת", strongs: "H853" },
            { id: "7", english: "the earth.", hebrew: "הָאָֽרֶץ׃", strongs: "H776" }
        ]
    }: {
        words?: InterlinearWord[];
    } = $props();

    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let observer: ResizeObserver;
    let resizeTimeout: number;
    let isReady = false; // Safety flag

    // Layout Constants
    const FONT_ENG = '16px "Inter", sans-serif';
    const FONT_HEB = '20px "Noto Sans Hebrew", sans-serif';
    const FONT_STRONGS = '12px "Inter", monospace';
    
    const MARGIN = 40; // Changed back from 0 so text doesn't hit the edge
    const WORD_PADDING = 5; 
    const ROW_HEIGHT = 90;   

    function resizeCanvas(width: number, height: number) {
        if (!canvas || !ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const scale = Math.min(dpr, 2); 
        
        const pixelWidth = Math.round(width * scale);
        const pixelHeight = Math.round(height * scale);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
    }

    function draw(width: number, height: number) {
        if (!ctx || !isReady || width === 0 || height === 0) return;
        
        resizeCanvas(width, height);
        ctx.clearRect(0, 0, width, height);
        
        // Setup base canvas rendering rules
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        (ctx as any).mozImageSmoothingEnabled = false;
        (ctx as any).webkitImageSmoothingEnabled = false;
        ctx.imageSmoothingEnabled = false;
        if ('textRendering' in ctx) {
            (ctx as any).textRendering = 'geometricPrecision';
        }

        hitTestMap = [];

        let currentX = MARGIN;
        let currentY = MARGIN;
        const availableWidth = width - MARGIN;

        for (const word of words) {
            // Measure components
            ctx.font = FONT_ENG;
            const engWidth = ctx.measureText(word.english).width;
            ctx.font = FONT_HEB;
            const hebWidth = ctx.measureText(word.hebrew).width;
            ctx.font = FONT_STRONGS;
            const strongsWidth = ctx.measureText(word.strongs).width;

            const blockWidth = Math.max(engWidth, hebWidth, strongsWidth) + WORD_PADDING;

            if (currentX + blockWidth > availableWidth) {
                currentX = MARGIN;
                currentY += ROW_HEIGHT;
            }

            const centerX = currentX + (blockWidth / 2);

            // SAVE 3 SEPARATE TIGHT BOUNDING BOXES
            // We calculate the left edge (x) by subtracting half the text width from centerX
            hitTestMap.push({ id: word.id, part: 'english', x: centerX - (engWidth / 2), y: currentY, w: engWidth, h: 25 });
            hitTestMap.push({ id: word.id, part: 'hebrew', x: centerX - (hebWidth / 2), y: currentY + 25, w: hebWidth, h: 30 });
            hitTestMap.push({ id: word.id, part: 'strongs', x: centerX - (strongsWidth / 2), y: currentY + 55, w: strongsWidth, h: 35 });

            // Determine specific hover states
            const isHighlighted = highlightedIds.has(word.id);
            const isEngHovered = hoveredState?.id === word.id && hoveredState?.part === 'english';
            const isHebHovered = hoveredState?.id === word.id && hoveredState?.part === 'hebrew';
            const isStrHovered = hoveredState?.id === word.id && hoveredState?.part === 'strongs';

            // Draw English 
            ctx.font = FONT_ENG;
            ctx.fillStyle = isEngHovered ? "#eab308" : "#222222";
            ctx.fillText(word.english, centerX, currentY);

            // Draw Hebrew (Hover takes precedence over Highlight)
            ctx.font = FONT_HEB;
            ctx.fillStyle = isHebHovered ? "#eab308" : (isHighlighted ? "#a855f7" : "#1d4ed8");
            ctx.fillText(word.hebrew, centerX, currentY + 25);

            // Draw Strongs
            ctx.font = FONT_STRONGS;
            ctx.fillStyle = isStrHovered ? "#eab308" : (isHighlighted ? "#a855f7" : "#6b7280");
            ctx.fillText(word.strongs, centerX, currentY + 55);

            currentX += blockWidth;
        }
    }

    function throttledDraw(width: number, height: number) {
        clearTimeout(resizeTimeout);
        draw(width, height);
        resizeTimeout = setTimeout(() => {
            draw(width, height);
        }, 100);
    }

    function handleMouseMove(e: MouseEvent) {
        if (!canvas || !container || !isReady) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0) return;
        
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Find the specific text part we are hovering over
        const found = hitTestMap.find(box => 
            mx >= box.x && mx <= box.x + box.w && 
            my >= box.y && my <= box.y + box.h
        );

        const newHoveredId = found ? found.id : null;
        const newHoveredPart = found ? found.part : null;
        
        // Redraw only if the ID or the part changed
        if (hoveredState?.id !== newHoveredId || hoveredState?.part !== newHoveredPart) {
            if (found) {
                hoveredState = { id: found.id, part: found.part };
            } else {
                hoveredState = null;
            }
            const containerRect = container.getBoundingClientRect();
            draw(containerRect.width, containerRect.height);
        }
    }

    function handleClick(e: MouseEvent) {
        if (!canvas || !container || !isReady) return;
        
        // We only care about the ID for highlighting the whole column on click
        if (hoveredState?.id) {
            if (highlightedIds.has(hoveredState.id)) {
                highlightedIds.delete(hoveredState.id);
            } else {
                highlightedIds.add(hoveredState.id);
            }
            const containerRect = container.getBoundingClientRect();
            draw(containerRect.width, containerRect.height);
        }
    }

    onMount(() => {
        if (!canvas || !container) return;
        
        ctx = canvas.getContext("2d")!;
        isReady = true;

        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("click", handleClick);

        // Handle font loading non-blocking
        document.fonts.ready.then(() => {
            if (container) {
                const rect = container.getBoundingClientRect();
                draw(rect.width, rect.height);
            }
        });

        observer = new ResizeObserver(entries => {
            if (!isReady) return;
            const { width, height } = entries[0].contentRect;
            throttledDraw(width, height);
        });
        
        observer.observe(container);
    });

    onDestroy(() => {
        isReady = false;
        observer?.disconnect();
        if (canvas) {
            canvas.removeEventListener("mousemove", handleMouseMove);
            canvas.removeEventListener("click", handleClick);
        }
        clearTimeout(resizeTimeout);
    });
</script>

<div bind:this={container} class="container">
    <canvas bind:this={canvas}></canvas>
</div>

<style>
    .container {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        flex: 1 1 auto;
    }
    canvas {
        display: block;
        width: 100%;
        height: 100%;
        transform: translateZ(0);
        image-rendering: auto;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
</style>