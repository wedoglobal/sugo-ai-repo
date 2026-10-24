<script>
  let { form } = $props();
</script>

<h1>Giriş</h1>
<form method="POST" action="?/login" class="card">
  <label for="password">Admin şifresi</label>
  <input id="password" name="password" type="password" autofocus required />
  {#if form?.error}<p class="err">{form.error}</p>{/if}
  <p><button>Giriş yap</button></p>
</form>
