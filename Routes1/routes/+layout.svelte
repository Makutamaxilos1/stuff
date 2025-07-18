<script>
  import Sidebar from '$lib/Sidebar.svelte';
  import '../app.css'; // Import from src/app.css

  let sidebarCollapsed = false;

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }
</script>

<div class="overall" style="display: flex; flex-direction: column;">
  <div class="Header">
    <h1 class="title">TheoNotes</h1>
    <button class="sidebar-toggle" on:click={toggleSidebar}>
      {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
    </button>
  </div>

  <div class="lower" style="display: flex;">
    {#if !sidebarCollapsed}
      <Sidebar />
    {/if}

    <div class="article">
      <main style="flex: 1;">
        <slot />
      </main>
    </div>
  </div>
</div>

<style>
  .overall {
    flex-direction: column;
    top: -1px;
    left: 0;
    padding-left: 0vw;
  }

  .lower {
    flex-direction: column;
  }

  .Header {
    width: 100vw;
    height: 0rem;
    background-color: red;
  }

  .title {
    position: absolute;
    right: 3rem;
    bottom: 3rem;
    color: rgba(0, 0, 0, 0);
  }

  .article {
    width: min(60vw, 1000px);
    margin: auto;
  }

  .sidebar-toggle {
    font-family: "Gentium Plus";
    position: absolute;
    padding: 0.5rem 1rem;
    font-size: 2rem;
    cursor: pointer;
    z-index: 2000;
    border: 0px;
    border-radius: 3px;
    width: max(200px, 14vw);
    background-color: rgba(240, 240, 240, 0.267);
  }
</style>