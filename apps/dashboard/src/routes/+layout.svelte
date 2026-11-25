<script>
  import '../app.css';
  import { page } from '$app/state';
  import Icon from '$lib/Icon.svelte';
  let { children, data } = $props();
  let menuOpen = $state(false);
  const groups = [
    { label: 'ÇALIŞMA ALANI', items: [['/', 'Genel bakış', 'grid'], ['/hosts', 'AI profilleri', 'users'], ['/pairs', 'Sohbetler', 'chat'], ['/conversation-repair', 'Sohbet Akışı', 'chat'], ['/queue', 'İş kuyruğu', 'queue'], ['/stats', 'İstatistikler', 'grid'], ['/status', 'Canlı durum', 'queue']] },
    { label: 'DAVRANIŞ VE İÇERİK', items: [['/greetings', 'Karşılama', 'spark'], ['/rules', 'Konuşma kuralları', 'rules'], ['/filters', 'Mesaj filtreleri', 'filter'], ['/gift-thanks', 'Hediye yanıtları', 'gift'], ['/photo-triggers', 'Fotoğraf istekleri', 'image']] },
    { label: 'GELİŞTİR', items: [['/playground', 'Deneme alanı', 'lab']] },
  ];
  const selected = (href) => href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
  const title = $derived(groups.flatMap((g) => g.items).find(([href]) => selected(href))?.[1] ?? 'Çalışma alanı');
</script>
<svelte:window onkeydown={(e) => { if (e.key === 'Escape') menuOpen = false; }} />
<svelte:head><title>{title} · Velora AI</title><meta name="theme-color" content="#111b30" /></svelte:head>
{#if data.authed}
  <a class="skip-link" href="#page-content">İçeriğe geç</a>
  <div class="app-shell">
    <aside class="app-sidebar" class:menu-open={menuOpen}>
      <a class="brand" href="/" aria-label="Velora AI ana sayfa"><span class="brand-mark"><svg width="23" height="25" viewBox="0 0 23 25" fill="none" aria-hidden="true"><path d="M2 5l9 16L21 3M8 4l5 9" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" /></svg></span><span>velora<span class="brand-ai">AI</span><small>INTELLIGENCE STUDIO</small></span></a>
      <a class="workspace-switch" href="/hosts" onclick={() => menuOpen = false}><span class="workspace-avatar">V</span><span>Yönetim alanı<small>Profiller ve otomasyon</small></span><span class="switch-arrow">↗</span></a>
      <nav class="side-nav" aria-label="Ana menü">
        {#each groups as group}<div class="nav-group"><div class="nav-label">{group.label}</div>{#each group.items as [href, label, icon]}<a {href} class:active={selected(href)} aria-current={selected(href) ? 'page' : undefined} onclick={() => menuOpen = false}><Icon name={icon} /><span>{label}</span>{#if selected(href)}<i></i>{/if}</a>{/each}</div>{/each}
      </nav>
      <div class="sidebar-bottom"><div class="studio-note"><span>✧</span><strong>Kontrol sende.</strong><p>Karakteri tasarla.<br />Deneyimi yönet.</p></div><div class="admin-account"><span class="admin-avatar">A</span><div>Yönetici<small>Velora workspace</small></div><form method="POST" action="/login?/logout"><button class="sign-out" aria-label="Çıkış yap" title="Çıkış yap"><Icon name="logout" size={17} /></button></form></div></div>
    </aside>
    {#if menuOpen}<button class="menu-overlay" aria-label="Menüyü kapat" onclick={() => menuOpen = false}></button>{/if}
    <div class="app-stage"><header class="app-topbar"><div class="breadcrumb"><button class="mobile-menu ghost" aria-label="Menüyü aç" aria-expanded={menuOpen} onclick={() => menuOpen = !menuOpen}><Icon name="menu" /></button><span>Çalışma alanı</span><span class="crumb-separator">/</span><strong>{title}</strong></div><div class="topbar-right"><span class="workspace-badge"><i></i>Yönetim konsolu</span><span class="topbar-avatar">A</span></div></header><main id="page-content" class="page-content">{@render children()}</main><footer class="app-footer"><span>VELORA AI <span> / </span> Intelligence, with intention.</span><span>Senin çalışma alanın.</span></footer></div>
  </div>
{:else}<main class="auth-main">{@render children()}</main>{/if}
