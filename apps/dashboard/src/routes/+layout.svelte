<script>
  import '../app.css';
  let { children, data } = $props();
</script>

{#if data.authed}
  <nav>
    <strong>Sugo Host</strong>
    <a href="/hosts">Hostlar</a>
    <a href="/pairs">Pair'ler</a>
    <a href="/queue">Kuyruk</a>
    <a href="/playground">Playground</a>
    <form method="POST" action="/login?/logout"><button class="link">Çıkış</button></form>
  </nav>
{/if}
<main>{@render children()}</main>
