<script>
  let { data } = $props();
</script>

<h1>Kuyruk</h1>
<table>
  <thead><tr><th>#</th><th>Pair</th><th>Tür</th><th>Durum</th><th>Cevap</th><th></th></tr></thead>
  <tbody>
    {#each data.jobs as j (j.id)}
      <tr>
        <td>{j.id}</td><td><a href="/pairs/{j.pair_id}">{j.pair_id}</a></td><td>{j.kind}</td>
        <td>{j.status}{#if j.error}<div class="err">{j.error}</div>{/if}</td><td>{j.reply_text ?? ''}</td>
        <td style="white-space:nowrap">
          {#if j.status === 'failed'}
            <form method="POST" action="?/retry"><input type="hidden" name="id" value={j.id} /><button class="ghost">tekrar dene</button></form>
          {:else if j.status !== 'done'}
            <form method="POST" action="?/cancel"><input type="hidden" name="id" value={j.id} /><button class="ghost">iptal</button></form>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>
