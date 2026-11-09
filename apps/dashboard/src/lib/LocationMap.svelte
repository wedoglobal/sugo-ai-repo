<script>
  import { project, unproject as inverse } from './map-geometry.js';
  let { latitude = $bindable(41.0082), longitude = $bindable(28.9784) } = $props();
  let zoom = $state(5);
  let width = $state(600);
  const height = 340;
  let center = $state({ lat: 41.0082, lon: 28.9784 });
  let drag = null;
  $effect(() => { center = { lat: Number(latitude) || 0, lon: Number(longitude) || 0 }; });
  const unproject = (x, y) => inverse(x, y, zoom);
  const point = $derived(project(Number(latitude) || 0, Number(longitude) || 0, zoom));
  const origin = $derived(project(center.lat, center.lon, zoom));
  const tiles = $derived.by(() => {
    const list = []; const n = 2 ** zoom;
    for (let x = Math.floor((origin.x - width / 2) / 256); x <= Math.floor((origin.x + width / 2) / 256); x++)
      for (let y = Math.floor((origin.y - height / 2) / 256); y <= Math.floor((origin.y + height / 2) / 256); y++)
        if (y >= 0 && y < n) list.push({ key: `${zoom}/${x}/${y}`, url: `https://tile.openstreetmap.org/${zoom}/${((x % n) + n) % n}/${y}.png`, x: x * 256 - origin.x + width / 2, y: y * 256 - origin.y + height / 2 });
    return list;
  });
  function down(e) { drag = { x: e.clientX, y: e.clientY, origin, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }
  function move(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.moved) center = unproject(drag.origin.x - dx, drag.origin.y - dy);
  }
  function up(e) {
    if (drag && !drag.moved) {
      const r = e.currentTarget.getBoundingClientRect();
      const p = unproject(origin.x + e.clientX - r.left - width / 2, origin.y + e.clientY - r.top - height / 2);
      latitude = Number(p.lat.toFixed(6)); longitude = Number(p.lon.toFixed(6));
    }
    drag = null;
  }
</script>
<div class="map-shell">
  <div class="map" role="application" aria-label="Konum haritası. Tıklayarak seçin, sürükleyerek gezinin. Klavye için koordinat alanlarını kullanın." bind:clientWidth={width} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => drag = null}>
    {#each tiles as tile (tile.key)}<img draggable="false" alt="" src={tile.url} style="left:{tile.x}px;top:{tile.y}px" />{/each}
    <div class="pin" style="left:{point.x - origin.x + width / 2}px;top:{point.y - origin.y + height / 2}px">●</div>
  </div>
  <div class="tools"><button type="button" aria-label="Yakınlaştır" onclick={() => zoom = Math.min(18, zoom + 1)}>+</button><button type="button" aria-label="Uzaklaştır" onclick={() => zoom = Math.max(2, zoom - 1)}>−</button><button type="button" onclick={() => { center = { lat: Number(latitude) || 0, lon: Number(longitude) || 0 }; }}>Konuma git</button></div>
  <a class="credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
</div>
<style>
  .map-shell{position:relative;border-radius:16px;overflow:hidden;background:#e5edea;border:1px solid #dce4e3}.map{height:340px;position:relative;overflow:hidden;touch-action:none;cursor:crosshair}.map img{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none}.pin{position:absolute;transform:translate(-50%,-50%);font-size:26px;color:#6d28d9;text-shadow:0 0 0 #fff;border:4px solid white;border-radius:50%;width:24px;height:24px;line-height:20px;box-shadow:0 3px 20px #34276766;pointer-events:none}.tools{position:absolute;top:12px;left:12px;display:flex;gap:4px}.tools button{background:white;color:#282336;box-shadow:0 2px 8px #0001;font-size:13px}.credit{position:absolute;right:0;bottom:0;background:#ffffffdf;padding:3px 7px;font-size:10px;color:#384944}
</style>
